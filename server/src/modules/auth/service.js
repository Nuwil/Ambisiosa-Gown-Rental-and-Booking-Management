import { permissionsFor } from '../../utils/permissions.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { sendMail } from '../../utils/mailer.js';
import { q, q1 } from '../../config/db.js';
import { badRequest, unauthorized, forbidden, conflict } from '../../utils/http.js';
import { logActivity } from '../../utils/audit.js';

const COST = 12;
// Pre-computed hash used to equalise timing when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const publicUser = (u) => ({
  id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone,
  address: u.address, shop_name: u.shop_name, status: u.status, theme: u.theme, created_at: u.created_at,
  permissions: permissionsFor(u),
});

const CODE_TTL_MIN = 10;
const RESEND_COOLDOWN_S = 60;
const MAX_ATTEMPTS = 5;
export const NOT_VERIFIED = 'Email not verified';

const hashCode = (email, code) => crypto.createHmac('sha256', env.jwtSecret).update(`${email}:${code}`).digest('hex');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Issues a fresh 6-digit code (replaces any previous one). Silently skipped inside the resend cooldown. */
async function sendVerificationCode(user) {
  const prev = await q1('SELECT TIMESTAMPDIFF(SECOND, sent_at, NOW()) AS age FROM email_verifications WHERE user_id = ?', [user.id]);
  if (prev && prev.age < RESEND_COOLDOWN_S) return false;
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await q(
    `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts, sent_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${CODE_TTL_MIN} MINUTE), 0, NOW())
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0, sent_at = VALUES(sent_at)`,
    [user.id, hashCode(user.email, code)]
  );
  try {
    await sendMail({
      to: user.email,
      subject: 'Your Atelier Rentals verification code',
      text: `Your verification code is ${code}. It expires in ${CODE_TTL_MIN} minutes.\n\nIf you did not create an account, ignore this email.`,
    });
  } catch (err) {
    await q('DELETE FROM email_verifications WHERE user_id = ?', [user.id]); // undelivered code: don't start the resend cooldown
    throw err;
  }
  return true;
}

/** Creates the renter with email_verified = 0 and emails the code. No session is issued until the code is confirmed. */
export async function registerRenter(data) {
  const hash = await bcrypt.hash(data.password, COST);
  const exists = await q1('SELECT * FROM users WHERE email = ?', [data.email]);
  let user;
  if (exists) {
    // An abandoned, never-verified sign-up may be re-claimed by its (verifiable) owner; anything else is taken.
    if (exists.email_verified || exists.role !== 'renter' || exists.google_id) throw conflict('Email is already registered');
    await q('UPDATE users SET name=?, phone=?, address=?, password_hash=? WHERE id=?', [data.name, data.phone ?? null, data.address ?? null, hash, exists.id]);
    user = exists;
  } else {
    await q('INSERT INTO users (role, name, email, email_verified, phone, address, password_hash) VALUES (?,?,?,0,?,?,?)', ['renter', data.name, data.email, data.phone ?? null, data.address ?? null, hash]);
    user = await q1('SELECT * FROM users WHERE email = ?', [data.email]);
    await logActivity({ actorId: user.id, targetUserId: user.id, action: 'USER_REGISTER', description: `Renter ${user.name} registered (email pending verification)` });
  }
  await sendVerificationCode(user);
  return { email: user.email };
}

export async function verifyEmail({ email, code }) {
  const user = await q1('SELECT * FROM users WHERE email = ?', [email]);
  const row = user && await q1('SELECT *, expires_at < NOW() AS expired FROM email_verifications WHERE user_id = ?', [user.id]);
  const bad = () => badRequest('Invalid or expired code');
  if (!row || row.expired || row.attempts >= MAX_ATTEMPTS) throw bad();
  if (!safeEqual(row.code_hash, hashCode(email, code))) {
    await q('UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = ?', [user.id]);
    throw bad();
  }
  if (user.status !== 'active') throw forbidden(`Account is ${user.status}. Contact the administrator.`);
  await q('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
  await q('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
  await logActivity({ actorId: user.id, targetUserId: user.id, action: 'EMAIL_VERIFIED', description: `${user.name} verified their email` });
  return publicUser({ ...user, email_verified: 1 });
}

/** Always resolves the same way so the endpoint cannot be used to discover which emails are registered. */
export async function resendCode({ email }) {
  const user = await q1('SELECT * FROM users WHERE email = ?', [email]);
  if (user && !user.email_verified && user.status === 'active') await sendVerificationCode(user);
}

export async function login({ email, password }) {
  const user = await q1('SELECT * FROM users WHERE email = ?', [email]);
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  if (user.status !== 'active') throw forbidden(`Account is ${user.status}. Contact the administrator.`);
  if (!user.email_verified) {
    await sendVerificationCode(user);
    throw forbidden(`${NOT_VERIFIED}. Enter the 6-digit code we sent to ${user.email}.`);
  }
  await logActivity({ actorId: user.id, targetUserId: user.id, action: 'USER_LOGIN', description: `${user.name} logged in` });
  return publicUser(user);
}

/** Verifies a Google Identity Services ID token server-side (signature checked by Google's tokeninfo endpoint). */
async function verifyGoogleToken(credential) {
  if (!env.googleClientId) throw badRequest('Google sign-in is not configured');
  let info;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) throw new Error('rejected');
    info = await r.json();
  } catch {
    throw unauthorized('Google sign-in failed');
  }
  const issOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== env.googleClientId || !issOk || Number(info.exp) * 1000 < Date.now() || String(info.email_verified) !== 'true' || !info.email || !info.sub) {
    throw unauthorized('Google sign-in failed');
  }
  return { sub: String(info.sub), email: String(info.email).toLowerCase(), name: String(info.name || info.email.split('@')[0]).slice(0, 120) };
}

/** Signs in (or creates / links) the account that owns this Google-verified email. */
export async function loginWithGoogle({ credential }) {
  const g = await verifyGoogleToken(credential);
  let user = await q1('SELECT * FROM users WHERE google_id = ?', [g.sub]) ?? await q1('SELECT * FROM users WHERE email = ?', [g.email]);
  if (user && user.google_id && user.google_id !== g.sub) throw conflict('This email is linked to a different Google account');
  if (!user) {
    // Random unusable password: the account is Google-only until the user sets one (reset flow).
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), COST);
    await q('INSERT INTO users (role, name, email, email_verified, google_id, password_hash) VALUES (?,?,?,1,?,?)', ['renter', g.name, g.email, g.sub, hash]);
    user = await q1('SELECT * FROM users WHERE email = ?', [g.email]);
    await logActivity({ actorId: user.id, targetUserId: user.id, action: 'USER_REGISTER', description: `Renter ${user.name} registered with Google` });
  } else {
    if (user.status !== 'active') throw forbidden(`Account is ${user.status}. Contact the administrator.`);
    if (!user.google_id || !user.email_verified) {
      // A never-verified sign-up may have been made by someone else with this email: drop its password so only Google works.
      if (!user.email_verified) await q('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(crypto.randomBytes(24).toString('hex'), COST), user.id]);
      await q('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?', [g.sub, user.id]);
      await q('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
      await logActivity({ actorId: user.id, targetUserId: user.id, action: 'GOOGLE_LINKED', description: `${user.name} linked a Google account` });
    }
    await logActivity({ actorId: user.id, targetUserId: user.id, action: 'USER_LOGIN', description: `${user.name} logged in with Google` });
  }
  return publicUser(user);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await q1('SELECT * FROM users WHERE id = ?', [userId]);
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) throw badRequest('Current password is incorrect');
  if (currentPassword === newPassword) throw badRequest('New password must differ from the current one');
  const hash = await bcrypt.hash(newPassword, COST);
  await q('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  await logActivity({ actorId: userId, targetUserId: userId, action: 'PASSWORD_CHANGE', description: `${user.name} changed their password` });
}

export async function updateProfile(user, data) {
  await q('UPDATE users SET name=?, phone=?, address=?, shop_name=? WHERE id=?', [
    data.name, data.phone ?? null, data.address ?? null,
    user.role === 'owner' ? data.shop_name ?? null : user.shop_name, user.id,
  ]);
  await logActivity({ actorId: user.id, targetUserId: user.id, action: 'PROFILE_UPDATE', description: `${user.name} updated their profile` });
  return publicUser(await q1('SELECT * FROM users WHERE id = ?', [user.id]));
}

export const setTheme = (userId, theme) => q('UPDATE users SET theme = ? WHERE id = ?', [theme, userId]);
export { publicUser };
