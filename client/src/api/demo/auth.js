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
const themeSchema = object({ theme: oneOf(['light', 'dark']) });

export const routes = mount('/auth', [], [
  ['POST', '/register', [], (ctx) => {
    const d = parse(registerSchema, ctx.body);
    if (getDb().users.some((u) => u.email === d.email)) throw conflict('Email is already registered');
    const u = insert('users', { role: 'renter', owner_id: null, name: d.name, email: d.email, phone: d.phone ?? null, address: d.address ?? null, shop_name: null, status: 'active', theme: 'light', staff_permissions: null, password: d.password, is_seed: false, created_at: stamp() });
    logActivity({ actorId: u.id, targetUserId: u.id, action: 'USER_REGISTER', description: `Renter ${u.name} registered` });
    setSessionId(u.id);
    return created({ user: publicUser(u) });
  }],
  ['POST', '/login', [], (ctx) => {
    const d = parse(loginSchema, ctx.body);
    const u = getDb().users.find((x) => x.email === d.email);
    if (!u || u.password !== d.password) throw unauthorized('Invalid email or password');
    if (u.status !== 'active') throw forbidden(`Account is ${u.status}. Contact the administrator.`);
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
