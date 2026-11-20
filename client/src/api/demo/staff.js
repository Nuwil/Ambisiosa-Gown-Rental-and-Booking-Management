import { authenticate, mount, requireRole } from './router.js';
import { getDb, insert, logActivity } from './store.js';
import { PERMISSIONS, parsePermissions, serializePermissions } from './model.js';
import { conflict, created, like, notFound, paged, paginate, stamp } from './util.js';
import { array, email, idParam, object, oneOf, optStr, pageQuery, parse, password, string, STATUSES } from './validate.js';

const profile = { name: string({ min: 2, max: 120 }), email, phone: optStr(30), address: optStr(255) };
const permissions = (o) => array(oneOf(PERMISSIONS), { max: PERMISSIONS.length, ...o });
const createSchema = object({ ...profile, password, permissions: permissions({ default: PERMISSIONS }) });
const updateSchema = object({ ...profile, permissions: permissions({ optional: true }) });
const statusSchema = object({ status: oneOf(STATUSES) });
const listQuery = object({ ...pageQuery, status: oneOf(STATUSES, { optional: true }), q: string({ max: 100, optional: true }) });

export const shape = ({ id, name, email: em, phone, address, status, created_at, staff_permissions }) => ({ id, name, email: em, phone, address, status, created_at, permissions: parsePermissions(staff_permissions) });

/** Random one-time password, like crypto.randomBytes(9).toString('base64url') + 'a1'. */
export function tempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return `${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')}a1`;
}

export const routes = mount('/staff', [authenticate, requireRole('owner')], [
  ['GET', '/', [], ({ user, query }) => {
    const f = parse(listQuery, query);
    const rows = getDb().users.filter((u) => u.role === 'staff' && u.owner_id === user.id && (!f.status || u.status === f.status) && (!f.q || like(u.name, f.q) || like(u.email, f.q))).sort((a, b) => b.id - a.id);
    return paged(rows, paginate(f), shape);
  }],
  ['POST', '/', [], ({ user, body }) => {
    const d = parse(createSchema, body);
    if (getDb().users.some((u) => u.email === d.email)) throw conflict('Email is already registered');
    const u = insert('users', { role: 'staff', owner_id: user.id, name: d.name, email: d.email, phone: d.phone ?? null, address: d.address ?? null, shop_name: null, status: 'active', theme: 'light', staff_permissions: serializePermissions(d.permissions), password: d.password, is_seed: false, created_at: stamp() });
    logActivity({ actorId: user.id, targetUserId: u.id, action: 'ACCOUNT_CREATE', description: `${user.name} created staff account for ${d.name}` });
    return created(shape(u));
  }],
  ['PUT', '/:id', [], ({ user, params, body }) => {
    const s = mine(user, params); const d = parse(updateSchema, body);
    if (getDb().users.some((u) => u.email === d.email && u.id !== s.id)) throw conflict('Email is already used by another account');
    Object.assign(s, { name: d.name, email: d.email, phone: d.phone ?? null, address: d.address ?? null, ...(d.permissions ? { staff_permissions: serializePermissions(d.permissions) } : {}) });
    logActivity({ actorId: user.id, targetUserId: s.id, action: 'ACCOUNT_UPDATE', description: `${user.name} updated staff account of ${d.name}` });
    return shape(s);
  }],
  ['PATCH', '/:id/status', [], ({ user, params, body }) => {
    const s = mine(user, params); const { status } = parse(statusSchema, body);
    s.status = status;
    logActivity({ actorId: user.id, targetUserId: s.id, action: 'ACCOUNT_STATUS', description: `${user.name} set staff ${s.name} to ${status}` });
    return { ok: true, status };
  }],
  ['POST', '/:id/reset-password', [], ({ user, params }) => {
    const s = mine(user, params); const temp = tempPassword();
    s.password = temp;
    logActivity({ actorId: user.id, targetUserId: s.id, action: 'PASSWORD_RESET', description: `${user.name} reset the password of staff ${s.name}` });
    return { temporaryPassword: temp, note: 'Share securely. Ask the staff member to change it after signing in.' };
  }],
  ['DELETE', '/:id', [], ({ user, params }) => {
    const s = mine(user, params); const db = getDb();
    if (db.payments.some((p) => p.recorded_by === s.id)) throw conflict('This staff member has recorded payments. Suspend the account instead of deleting it.');
    db.users.splice(db.users.indexOf(s), 1);
    logActivity({ actorId: user.id, action: 'ACCOUNT_DELETE', description: `${user.name} deleted staff account of ${s.name}` });
    return { ok: true };
  }],
]);

function mine(user, params) {
  const s = getDb().users.find((u) => u.id === parse(idParam, params).id && u.role === 'staff' && u.owner_id === user.id);
  if (!s) throw notFound('Staff member not found');
  return s;
}
