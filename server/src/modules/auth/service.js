import { permissionsFor } from '../../utils/permissions.js';
import bcrypt from 'bcryptjs';
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

export async function registerRenter(data) {
  const exists = await q1('SELECT id FROM users WHERE email = ?', [data.email]);
  if (exists) throw conflict('Email is already registered');
  const hash = await bcrypt.hash(data.password, COST);
  const res = await q(
    'INSERT INTO users (role, name, email, phone, address, password_hash) VALUES (?,?,?,?,?,?)',
    ['renter', data.name, data.email, data.phone ?? null, data.address ?? null, hash]
  ).then(() => q1('SELECT * FROM users WHERE email = ?', [data.email]));
  await logActivity({ actorId: res.id, targetUserId: res.id, action: 'USER_REGISTER', description: `Renter ${res.name} registered` });
  return publicUser(res);
}

export async function login({ email, password }) {
  const user = await q1('SELECT * FROM users WHERE email = ?', [email]);
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  if (user.status !== 'active') throw forbidden(`Account is ${user.status}. Contact the administrator.`);
  await logActivity({ actorId: user.id, targetUserId: user.id, action: 'USER_LOGIN', description: `${user.name} logged in` });
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
