import { authenticate, mount, requireRole } from './router.js';
import { getDb, insert, logActivity } from './store.js';
import { serializePermissions, PERMISSIONS } from './model.js';
import { DEFAULT_CATEGORIES } from './seed.js';
import { badRequest, conflict, created, dayOf, FileReply, like, notFound, paged, paginate, stamp } from './util.js';
import { email, idParam, object, oneOf, optStr, pageQuery, parse, password, string, date, STATUSES } from './validate.js';
import { tempPassword } from './staff.js';

const listQuery = object({ ...pageQuery, role: oneOf(['admin', 'owner', 'staff', 'renter'], { optional: true }), status: oneOf(STATUSES, { optional: true }), q: string({ max: 100, optional: true }) });
const createSchema = object({ role: oneOf(['owner', 'staff', 'renter', 'admin']), name: string({ min: 2, max: 120 }), email, password, phone: optStr(30), address: optStr(255), shop_name: optStr(150) });
const updateSchema = object({ name: string({ min: 2, max: 120 }), email, phone: optStr(30), address: optStr(255), shop_name: optStr(150) });
const statusSchema = object({ status: oneOf(STATUSES) });
const logsQuery = object({ ...pageQuery, q: string({ max: 100, optional: true }), action: string({ max: 60, optional: true }), from: date({ plain: true, optional: true }), to: date({ plain: true, optional: true }) });
const restoreSchema = object({ password: string({ raw: true, min: 1, max: 72 }), confirm: oneOf(['RESTORE']) });

const listUser = ({ id, role, owner_id, name, email: em, phone, address, shop_name, status, created_at, is_seed }) => ({ id, role, owner_id, name, email: em, phone, address, shop_name, status, created_at, is_seed: !!is_seed });
const target = (params) => {
  const u = getDb().users.find((x) => x.id === parse(idParam, params).id);
  if (!u) throw notFound('User not found');
  return u;
};
const nameOf = (id) => getDb().users.find((u) => u.id === id)?.name ?? null;
const hasHistory = (u) => getDb().transactions.some((t) => t.owner_id === u.id || getDb().customers.find((c) => c.id === t.customer_id)?.user_id === u.id);

const users = mount('/admin', [authenticate, requireRole('admin')], [
  ['GET', '/users', [], ({ query }) => {
    const f = parse(listQuery, query);
    const rows = getDb().users.filter((u) => (!f.role || u.role === f.role) && (!f.status || u.status === f.status) && (!f.q || [u.name, u.email, u.shop_name].some((x) => like(x, f.q)))).sort((a, b) => b.id - a.id);
    return paged(rows, paginate(f), listUser);
  }],
  ['POST', '/users', [], ({ user, body }) => {
    const d = parse(createSchema, body); const db = getDb();
    if (db.users.some((u) => u.email === d.email)) throw conflict('Email is already registered');
    let ownerId = null;
    if (d.role === 'admin' || d.role === 'owner') { if (db.users.some((u) => u.role === d.role)) throw conflict(`Only one ${d.role} account is allowed`); }
    if (d.role === 'staff') {
      const owner = db.users.find((u) => u.role === 'owner');
      if (!owner) throw conflict('Create the owner account before adding staff');
      ownerId = owner.id;
    }
    const u = insert('users', { role: d.role, owner_id: ownerId, name: d.name, email: d.email, phone: d.phone ?? null, address: d.address ?? null, shop_name: d.role === 'owner' ? d.shop_name ?? null : null, status: 'active', theme: 'light', staff_permissions: d.role === 'staff' ? serializePermissions(PERMISSIONS) : null, password: d.password, is_seed: false, created_at: stamp() });
    if (d.role === 'owner') DEFAULT_CATEGORIES.forEach((name) => insert('categories', { owner_id: u.id, name }));
    logActivity({ actorId: user.id, targetUserId: u.id, action: 'ACCOUNT_CREATE', description: `Admin ${user.name} created ${d.role} account for ${d.name}` });
    return created(listUser(u));
  }],
  ['PUT', '/users/:id', [], ({ user, params, body }) => {
    const u = target(params); const d = parse(updateSchema, body);
    if (getDb().users.some((x) => x.email === d.email && x.id !== u.id)) throw conflict('Email is already used by another account');
    Object.assign(u, { name: d.name, email: d.email, phone: d.phone ?? null, address: d.address ?? null, shop_name: u.role === 'owner' ? d.shop_name ?? null : null });
    logActivity({ actorId: user.id, targetUserId: u.id, action: 'ACCOUNT_UPDATE', description: `Admin ${user.name} updated account of ${d.name}` });
    return listUser(u);
  }],
  ['PATCH', '/users/:id/status', [], ({ user, params, body }) => {
    const { status } = parse(statusSchema, body);
    if (parse(idParam, params).id === user.id) throw badRequest('You cannot change your own account status');
    const u = target(params);
    u.status = status;
    logActivity({ actorId: user.id, targetUserId: u.id, action: 'ACCOUNT_STATUS', description: `Admin ${user.name} set ${u.name} to ${status}` });
    return { ok: true, status };
  }],
  ['POST', '/users/:id/reset-password', [], ({ user, params }) => {
    const u = target(params); const temp = tempPassword();
    u.password = temp;
    logActivity({ actorId: user.id, targetUserId: u.id, action: 'PASSWORD_RESET', description: `Admin ${user.name} reset the password of ${u.name}` });
    return { temporaryPassword: temp, note: 'Share securely. Ask the user to change it after signing in.' };
  }],
  ['DELETE', '/users/:id', [], ({ user, params }) => {
    if (parse(idParam, params).id === user.id) throw badRequest('You cannot delete your own account');
    const u = target(params); const db = getDb();
    if (u.role === 'owner') throw conflict('The owner account cannot be deleted. Suspend it instead.');
    if (u.role === 'admin' && db.users.filter((x) => x.role === 'admin').length <= 1) throw conflict('Cannot delete the last administrator');
    if (hasHistory(u)) throw conflict('This user has transaction history. Suspend the account instead of deleting it.');
    db.users.splice(db.users.indexOf(u), 1);
    db.cart = db.cart.filter((c) => c.renter_id !== u.id);
    logActivity({ actorId: user.id, action: 'ACCOUNT_DELETE', description: `Admin ${user.name} deleted account of ${u.name} (${u.role})` });
    return { ok: true };
  }],
  ['GET', '/logs', [], ({ query }) => {
    const f = parse(logsQuery, query);
    const rows = getDb().logs.filter((l) => (!f.action || l.action === f.action)
      && (!f.q || [l.description, nameOf(l.actor_id), nameOf(l.target_user_id)].some((x) => like(x, f.q)))
      && (!f.from || dayOf(l.created_at) >= f.from) && (!f.to || dayOf(l.created_at) <= f.to)).sort((a, b) => b.id - a.id);
    return paged(rows, paginate(f, 20), (l) => ({ id: l.id, action: l.action, description: l.description, created_at: l.created_at, actor_name: nameOf(l.actor_id), target_name: nameOf(l.target_user_id) }));
  }],
]);

// ---- backups: simulated (no database to dump). Create/delete edit the list; restore verifies the admin and logs only. ----
const backup = (b) => ({ id: b.id, file_name: b.file_name, size_bytes: b.size_bytes, status: b.status, error: b.error, created_at: b.created_at, created_by_name: nameOf(b.created_by), file_exists: b.status === 'success' });
function makeBackup(user) {
  const db = getDb(); const created_at = stamp();
  const size = Math.round(JSON.stringify({ ...db, logs: 0 }).length * 4.2);
  return insert('backups', { file_name: `backup-${created_at.replace(' ', 'T').replace(/:/g, '-')}.sql`, size_bytes: size, status: 'success', error: null, created_by: user.id, created_at });
}
const backupById = (params) => {
  const b = getDb().backups.find((x) => x.id === parse(idParam, params).id);
  if (!b) throw notFound('Backup not found');
  return b;
};

const backups = mount('/admin/backups', [authenticate, requireRole('admin')], [
  ['GET', '/', [], () => [...getDb().backups].sort((a, b) => b.id - a.id).slice(0, 100).map(backup)],
  ['POST', '/', [], ({ user }) => {
    const b = makeBackup(user);
    logActivity({ actorId: user.id, action: 'BACKUP_CREATE', description: `Admin ${user.name} created backup ${b.file_name} (success)` });
    return created(backup(b));
  }],
  ['GET', '/:id/download', [], ({ user, params }) => {
    const b = backupById(params);
    if (b.status !== 'success') throw notFound('Backup file not found');
    logActivity({ actorId: user.id, action: 'BACKUP_DOWNLOAD', description: `Admin ${user.name} downloaded ${b.file_name}` });
    const db = getDb(); const counts = Object.entries(db).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `--   ${k}: ${v.length} rows`).join('\n');
    return new FileReply(b.file_name, 'application/sql', [`-- Demo backup ${b.file_name}\n-- Generated in the browser; the demo has no database.\n-- Snapshot contents:\n${counts}\n`]);
  }],
  ['POST', '/:id/restore', [], ({ user, params, body }) => {
    const { id: bid } = parse(idParam, params); const d = parse(restoreSchema, body);
    if (user.password !== d.password) throw badRequest('Password is incorrect');
    const b = getDb().backups.find((x) => x.id === bid && x.status === 'success');
    if (!b) throw notFound('Backup file not found');
    const safety = makeBackup(user);
    logActivity({ actorId: user.id, action: 'BACKUP_RESTORE', description: `Admin ${user.name} restored backup ${b.file_name} (safety backup: ${safety.file_name})` });
    return { ok: true, restored: b.file_name, safetyBackup: safety.file_name };
  }],
  ['DELETE', '/:id', [], ({ user, params }) => {
    const b = backupById(params); const db = getDb();
    db.backups.splice(db.backups.indexOf(b), 1);
    logActivity({ actorId: user.id, action: 'BACKUP_DELETE', description: `Admin ${user.name} deleted backup ${b.file_name}` });
    return { ok: true };
  }],
]);

export const routes = [...backups, ...users];
