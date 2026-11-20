import { authenticate, mount, requireRole, requireShop, staffNeeds } from './router.js';
import { getDb, insert, logActivity } from './store.js';
import { find, shopName } from './model.js';
import { conflict, created, like, notFound, paged, paginate, stamp, today } from './util.js';
import { idParam, object, oneOf, optStr, pageQuery, parse, string, STATUSES } from './validate.js';
import { listQuery as txListQuery, listTransactions } from './transactions.js';

const customerSchema = object({ name: string({ min: 2, max: 120 }), phone: optStr(30), email: string({ lower: true, email: true, max: 191, optional: true, nullable: true, emptyNull: true }), address: optStr(255), notes: optStr(2000) });
const listQuery = object({ ...pageQuery, q: string({ max: 100, optional: true }), source: oneOf(['account', 'walkin'], { optional: true }), sort: oneOf(['name', 'newest', 'spent'], { optional: true }) });
const renterQuery = object({ ...pageQuery, q: string({ max: 100, optional: true }), status: oneOf(STATUSES, { optional: true }) });

/** total_transactions / total_paid / overdue_count, as the server's STATS subqueries. */
function stats(c) {
  const db = getDb(); const txs = db.transactions.filter((t) => t.customer_id === c.id); const ids = new Set(txs.map((t) => t.id));
  return {
    total_transactions: txs.length,
    total_paid: db.payments.filter((p) => ids.has(p.transaction_id)).reduce((n, p) => n + p.amount, 0),
    overdue_count: txs.filter((t) => t.type === 'rental' && t.status === 'active' && t.expected_return < today()).length,
  };
}
const withStats = (c) => ({ ...c, ...stats(c) });

const owned = (user, cid) => {
  const c = getDb().customers.find((x) => x.id === cid && (!user.isShop || x.owner_id === user.shopId));
  if (!c) throw notFound('Customer not found');
  return withStats(c);
};
const staffGuard = (ctx) => (ctx.method === 'GET' && ctx.user.role === 'staff' && ctx.user.permissions.includes('transactions') ? undefined : staffNeeds('customers')(ctx));
const viewers = requireRole('owner', 'staff', 'admin');

export const routes = mount('/customers', [authenticate, staffGuard], [
  ['GET', '/', [viewers], ({ user, query }) => {
    const f = parse(listQuery, query);
    const rows = getDb().customers.filter((c) => (!user.isShop || c.owner_id === user.shopId)
      && (!f.q || [c.name, c.email, c.phone].some((x) => like(x, f.q)))
      && (f.source !== 'account' || c.user_id) && (f.source !== 'walkin' || !c.user_id))
      .map((c) => ({ id: c.id, owner_id: c.owner_id, user_id: c.user_id, name: c.name, phone: c.phone, email: c.email, address: c.address, created_at: c.created_at, ...stats(c), shop_name: shopName(find('users', c.owner_id)) }));
    const order = { name: (a, b) => a.name.localeCompare(b.name), spent: (a, b) => b.total_paid - a.total_paid }[f.sort] ?? ((a, b) => b.id - a.id);
    return paged(rows.sort(order), paginate(f));
  }],
  ['GET', '/renters', [requireShop], ({ user, query }) => {
    const f = parse(renterQuery, query); const db = getDb();
    const rows = db.users.filter((u) => u.role === 'renter' && (!f.status || u.status === f.status) && (!f.q || [u.name, u.email, u.phone].some((x) => like(x, f.q)))).sort((a, b) => b.id - a.id)
      .map((u) => {
        const c = db.customers.find((x) => x.user_id === u.id && x.owner_id === user.shopId);
        const txs = c ? db.transactions.filter((t) => t.customer_id === c.id) : [];
        return { id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, created_at: u.created_at, customer_id: c?.id ?? null, total_transactions: txs.length, last_activity: txs.map((t) => t.created_at).sort().pop() ?? null };
      });
    return paged(rows, paginate(f));
  }],
  ['POST', '/', [requireShop], ({ user, body }) => {
    const d = parse(customerSchema, body);
    const c = insert('customers', { owner_id: user.shopId, user_id: null, name: d.name, phone: d.phone ?? null, email: d.email ?? null, address: d.address ?? null, notes: d.notes ?? null, created_at: stamp() });
    logActivity({ actorId: user.id, action: 'CUSTOMER_CREATE', description: `${user.name} registered customer ${d.name}` });
    return created(c);
  }],
  ['GET', '/:id', [viewers], ({ user, params }) => owned(user, parse(idParam, params).id)],
  ['GET', '/:id/transactions', [viewers], ({ user, params, query }) => {
    const { id: cid } = parse(idParam, params); const f = parse(txListQuery, query);
    owned(user, cid);
    return paged(listTransactions(user, { ...f, customer_id: cid }), paginate(f));
  }],
  ['PUT', '/:id', [requireShop], ({ user, params, body }) => {
    const { id: cid } = parse(idParam, params); const d = parse(customerSchema, body);
    const c = owned(user, cid);
    Object.assign(getDb().customers.find((x) => x.id === c.id), { name: d.name, phone: d.phone ?? null, email: d.email ?? null, address: d.address ?? null, notes: d.notes ?? null });
    logActivity({ actorId: user.id, action: 'CUSTOMER_UPDATE', description: `${user.name} updated customer ${d.name}` });
    return owned(user, cid);
  }],
  ['DELETE', '/:id', [requireRole('owner')], ({ user, params }) => {
    const c = owned(user, parse(idParam, params).id); const db = getDb();
    if (c.total_transactions > 0) throw conflict('This customer has transaction history and cannot be deleted');
    db.customers.splice(db.customers.findIndex((x) => x.id === c.id), 1);
    logActivity({ actorId: user.id, action: 'CUSTOMER_DELETE', description: `${user.name} deleted customer ${c.name}` });
    return { ok: true };
  }],
]);
