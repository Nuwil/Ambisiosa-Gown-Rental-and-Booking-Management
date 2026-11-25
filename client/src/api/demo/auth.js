import { authenticate, mount } from './router.js';
import { insert, getDb, logActivity, setSessionId } from './store.js';
import { find, permissionsFor } from './model.js';
import { badRequest, conflict, created, forbidden, stamp, unauthorized } from './util.js';
import { email, object, oneOf, optStr, parse, password, string } from './validate.js';

export const publicUser = (u, shop_name = u.shop_name) => ({
  id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, address: u.address, shop_name,
  status: u.status, theme: u.theme, created_at: u.created_at, permissions: permissionsFor(u),
});

const registerSchema = object({ name: string({ min: 2, max: 120 }), email, password, phone: optStr(30), address: optStr(255) });
const loginSchema = object({ email, password: string({ raw: true, min: 1, max: 72 }) });
const passwordSchema = object({ currentPassword: string({ raw: true, min: 1, max: 72 }), newPassword: password });
const profileSchema = object({ name: string({ min: 2, max: 120 }), phone: optStr(30), address: optStr(255), shop_name: optStr(150) });
const verifySchema = object({ email, code: string({ patterns: [[/^\d{6}$/, 'Enter the 6-digit code']] }) });
const resendSchema = object({ email });
const googleSchema = object({ credential: string({ raw: true, min: 20, max: 4096 }) });
const themeSchema = object({ theme: oneOf(['light', 'dark']) });

// Demo has no mailbox: codes live in memory and are echoed back as `demoCode` so the UI can show them.
const codes = new Map();
const issueCode = (addr) => { const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0'); codes.set(addr, { code, expires: Date.now() + 10 * 60 * 1000, attempts: 0 }); return code; };
const DEMO_GOOGLE = { prefix: 'demo-google:', email: 'google.demo@example.com', name: 'Google Demo User' };

export const routes = mount('/auth', [], [
  ['POST', '/register', [], (ctx) => {
    const d = parse(registerSchema, ctx.body);
    const prior = getDb().users.find((u) => u.email === d.email);
    if (prior && (prior.email_verified !== false || prior.role !== 'renter')) throw conflict('Email is already registered');
    if (prior) Object.assign(prior, { name: d.name, phone: d.phone ?? null, address: d.address ?? null, password: d.password }); // re-claim an unverified sign-up
    else {
      const u = insert('users', { role: 'renter', owner_id: null, name: d.name, email: d.email, email_verified: false, phone: d.phone ?? null, address: d.address ?? null, shop_name: null, status: 'active', theme: 'light', staff_permissions: null, password: d.password, is_seed: false, created_at: stamp() });
      logActivity({ actorId: u.id, targetUserId: u.id, action: 'USER_REGISTER', description: `Renter ${u.name} registered (email pending verification)` });
    }
    return created({ verificationRequired: true, email: d.email, demoCode: issueCode(d.email) });
  }],
  ['POST', '/verify-email', [], (ctx) => {
    const d = parse(verifySchema, ctx.body);
    const u = getDb().users.find((x) => x.email === d.email);
    const c = codes.get(d.email);
    if (!u || !c || c.expires < Date.now() || c.attempts >= 5) throw badRequest('Invalid or expired code');
    if (c.code !== d.code) { c.attempts += 1; throw badRequest('Invalid or expired code'); }
    codes.delete(d.email);
    u.email_verified = true;
    logActivity({ actorId: u.id, targetUserId: u.id, action: 'EMAIL_VERIFIED', description: `${u.name} verified their email` });
    setSessionId(u.id);
    return { user: publicUser(u) };
  }],
  ['POST', '/resend-code', [], (ctx) => {
    const { email: addr } = parse(resendSchema, ctx.body);
    const u = getDb().users.find((x) => x.email === addr);
    return { ok: true, demoCode: u && u.email_verified === false ? issueCode(addr) : undefined };
  }],
  ['POST', '/google', [], (ctx) => {
    const { credential } = parse(googleSchema, ctx.body);
    if (!credential.startsWith(DEMO_GOOGLE.prefix)) throw unauthorized('Google sign-in failed');
    let u = getDb().users.find((x) => x.email === DEMO_GOOGLE.email);
    if (!u) {
      u = insert('users', { role: 'renter', owner_id: null, name: DEMO_GOOGLE.name, email: DEMO_GOOGLE.email, email_verified: true, phone: null, address: null, shop_name: null, status: 'active', theme: 'light', staff_permissions: null, password: `google-${Math.random()}`, is_seed: false, created_at: stamp() });
      logActivity({ actorId: u.id, targetUserId: u.id, action: 'USER_REGISTER', description: `Renter ${u.name} registered with Google` });
    }
    if (u.status !== 'active') throw forbidden(`Account is ${u.status}. Contact the administrator.`);
    logActivity({ actorId: u.id, targetUserId: u.id, action: 'USER_LOGIN', description: `${u.name} logged in with Google` });
    setSessionId(u.id);
    return { user: publicUser(u) };
  }],
  ['POST', '/login', [], (ctx) => {
    const d = parse(loginSchema, ctx.body);
    const u = getDb().users.find((x) => x.email === d.email);
    if (!u || u.password !== d.password) throw unauthorized('Invalid email or password');
    if (u.status !== 'active') throw forbidden(`Account is ${u.status}. Contact the administrator.`);
    if (u.email_verified === false) throw forbidden(`Email not verified. Enter the 6-digit code we sent to ${u.email}.`);
    logActivity({ actorId: u.id, targetUserId: u.id, action: 'USER_LOGIN', description: `${u.name} logged in` });
    setSessionId(u.id);
    return { user: publicUser(u) };
  }],
  ['POST', '/logout', [authenticate], ({ user }) => {
    logActivity({ actorId: user.id, targetUserId: user.id, action: 'USER_LOGOUT', description: `${user.name} logged out` });
    setSessionId(null);
    return { ok: true };
  }],
  ['GET', '/me', [authenticate], ({ user }) => ({ user: publicUser(user) })],
  ['PUT', '/password', [authenticate], ({ user, body }) => {
    const d = parse(passwordSchema, body);
    const row = find('users', user.id);
    if (row.password !== d.currentPassword) throw badRequest('Current password is incorrect');
    if (d.currentPassword === d.newPassword) throw badRequest('New password must differ from the current one');
    row.password = d.newPassword;
    logActivity({ actorId: user.id, targetUserId: user.id, action: 'PASSWORD_CHANGE', description: `${user.name} changed their password` });
    return { ok: true };
  }],
  ['PUT', '/profile', [authenticate], ({ user, body }) => {
    const d = parse(profileSchema, body);
    const row = find('users', user.id);
    Object.assign(row, { name: d.name, phone: d.phone ?? null, address: d.address ?? null, shop_name: user.role === 'owner' ? d.shop_name ?? null : row.shop_name });
    logActivity({ actorId: user.id, targetUserId: user.id, action: 'PROFILE_UPDATE', description: `${user.name} updated their profile` });
    return { user: publicUser(row) };
  }],
  ['PUT', '/theme', [authenticate], ({ user, body }) => {
    const { theme } = parse(themeSchema, body);
    find('users', user.id).theme = theme;
    return { theme };
  }],
]);
