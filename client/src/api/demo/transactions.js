import { authenticate, mount, requireRole, requireShop, staffNeeds } from './router.js';
import { atomic, getDb, insert, logActivity, notify, notifyShop } from './store.js';
import { availableOf, find, scopeFor, txRow } from './model.js';
import { badRequest, conflict, created, dayOf, forbidden, inclusiveDays, like, notFound, paged, paginate, stamp, today } from './util.js';
import { bool, date, id, idParam, int, number, object, oneOf, optStr, pageQuery, parse, string, union } from './validate.js';

const qty = int({ min: 1, max: 1000 });
const base = { variant_id: id(), quantity: qty, notes: optStr(1000) };
const requestSchema = union('type', {
  rental: object({ type: oneOf(['rental']), ...base, start_date: date(), expected_return: date() }),
  purchase: object({ type: oneOf(['purchase']), ...base, contact_phone: optStr(30), contact_address: optStr(255) }),
});
const manualSchema = union('type', {
  rental: object({ type: oneOf(['rental']), customer_id: id(), ...base, start_date: date(), expected_return: date() }),
  purchase: object({ type: oneOf(['purchase']), customer_id: id(), ...base }),
});
const actionSchema = object({
  action: oneOf(['approve', 'reject', 'release', 'return', 'finalize', 'cancel']),
  actual_return: date({ optional: true }), mark_paid: bool({ optional: true }), note: string({ max: 500, optional: true }),
});
const paymentSchema = object({ amount: number({ positive: true, max: 10_000_000 }), method: optStr(30) });
export const listQuery = object({
  ...pageQuery,
  type: oneOf(['rental', 'purchase'], { optional: true }),
  status: oneOf(['pending', 'approved', 'active', 'completed', 'rejected', 'cancelled', 'overdue'], { optional: true }),
  payment_status: oneOf(['unpaid', 'partial', 'paid', 'refunded'], { optional: true }),
  category_id: int({ optional: true }), customer_id: int({ optional: true }), from: date({ optional: true }), to: date({ optional: true }), q: string({ max: 100, optional: true }),
});

/** Filtered, newest-first transaction rows for a scope. */
export function listTransactions(user, f) {
  return getDb().transactions.filter(scopeFor(user)).map(txRow).filter((t) => {
    if (f.type && t.type !== f.type) return false;
    if (f.status === 'overdue' ? !t.is_overdue : f.status && t.status !== f.status) return false;
    if (f.payment_status && t.payment_status !== f.payment_status) return false;
    if (f.category_id && t.category_id !== f.category_id) return false;
    if (f.customer_id && t.customer_id !== f.customer_id) return false;
    if (f.from && dayOf(t.created_at) < f.from) return false;
    if (f.to && dayOf(t.created_at) > f.to) return false;
    if (f.q && !(like(t.item_name, f.q) || like(t.customer_name, f.q) || String(t.id) === f.q)) return false;
    return true;
  }).sort((a, b) => b.id - a.id);
}

export function getTransaction(user, txId) {
  const t = getDb().transactions.filter(scopeFor(user)).find((x) => x.id === txId);
  if (!t) throw notFound('Transaction not found');
  return { ...txRow(t), payments: getDb().payments.filter((p) => p.transaction_id === t.id).map(({ id: pid, amount, method, paid_at }) => ({ id: pid, amount, method, paid_at })) };
}

// ---------- create ----------
const variantInfo = (variantId) => {
  const v = find('variants', variantId);
  const item = v && find('items', v.item_id);
  return v ? { v, item, owner: find('users', item.owner_id) } : null;
};

export function computeAmount({ item }, d) {
  if (d.type === 'purchase') {
    if (item.purchase_price == null) throw badRequest('This item is not available for purchase');
    return item.purchase_price * d.quantity;
  }
  return item.rental_price * d.quantity * inclusiveDays(d.start_date, d.expected_return);
}

export function validateDates(d) {
  if (d.type !== 'rental') return;
  if (d.start_date < today()) throw badRequest('Rental start date cannot be in the past');
  if (d.expected_return < d.start_date) throw badRequest('Return date must be on or after the start date');
  if (inclusiveDays(d.start_date, d.expected_return) > 365) throw badRequest('Rental period cannot exceed 365 days');
}

function assertAvailable(d, ignoreTxId = 0) {
  const v = find('variants', d.variant_id);
  if (!v) throw notFound('Item size not found');
  const start = d.type === 'rental' ? d.start_date : today(); const end = d.type === 'rental' ? d.expected_return : today();
  const available = availableOf(v, start, end, ignoreTxId);
  if (available < d.quantity) throw conflict(available > 0 ? `Only ${available} unit(s) available for the selected period` : 'Not available for the selected period');
}

function upsertRenterCustomer(ownerId, user, contact = {}) {
  const db = getDb();
  const phone = contact.contact_phone ?? user.phone ?? null; const address = contact.contact_address ?? user.address ?? null;
  const c = db.customers.find((x) => x.owner_id === ownerId && x.user_id === user.id);
  if (c) { Object.assign(c, { name: user.name, email: user.email, phone: phone ?? c.phone, address: address ?? c.address }); return c.id; }
  return insert('customers', { owner_id: ownerId, user_id: user.id, name: user.name, phone, email: user.email, address, notes: null, created_at: stamp() }).id;
}

const insertTx = (ownerId, customerId, d, amount, status) => {
  const now = stamp();
  return insert('transactions', {
    owner_id: ownerId, customer_id: customerId, variant_id: d.variant_id, type: d.type, quantity: d.quantity, start_date: d.start_date ?? null,
    expected_return: d.expected_return ?? null, actual_return: null, amount, status, payment_status: 'unpaid', notes: d.notes ?? null, created_at: now, updated_at: now,
  });
};

/** One pending request (used by /request and cart checkout). Throws before mutating anything. */
export function createRequestTx(user, d) {
  validateDates(d);
  const info = variantInfo(d.variant_id);
  if (!info || !info.item.is_published || info.item.archived_at || info.owner.status !== 'active') throw notFound('Item not available');
  assertAvailable(d);
  const amount = computeAmount(info, d);
  const customerId = upsertRenterCustomer(info.owner.id, user, d);
  const tx = insertTx(info.owner.id, customerId, d, amount, 'pending');
  notifyShop(info.owner.id, 'REQUEST_SUBMITTED', `New ${d.type} request for "${info.item.name}" (${info.v.size}) from ${user.name}`, tx.id);
  logActivity({ actorId: user.id, targetUserId: info.owner.id, action: `${d.type.toUpperCase()}_REQUEST`, description: `${user.name} requested ${d.type} of "${info.item.name}" x${d.quantity}` });
  return tx.id;
}

// ---------- lifecycle ----------
const TRANSITIONS = {
  approve: { from: ['pending'], to: 'approved' }, reject: { from: ['pending'], to: 'rejected' },
  release: { from: ['approved'], to: 'active', only: 'rental' }, return: { from: ['active'], to: 'completed', only: 'rental' },
  finalize: { from: ['approved'], to: 'completed', only: 'purchase' }, cancel: { from: ['pending', 'approved'], to: 'cancelled' },
};

function recordPaymentTx(user, tx, amount, method) {
  if (amount <= 0) return;
  const db = getDb();
  insert('payments', { transaction_id: tx.id, amount, method: method ?? null, paid_at: stamp(), recorded_by: user.id });
  const paid = db.payments.filter((p) => p.transaction_id === tx.id).reduce((n, p) => n + p.amount, 0);
  tx.payment_status = paid >= tx.amount ? 'paid' : 'partial';
}

function applyAction(user, txId, { action, actual_return, mark_paid, note }) {
  const rule = TRANSITIONS[action]; const db = getDb();
  const tx = db.transactions.find((t) => t.id === txId);
  if (!tx) throw notFound('Transaction not found');
  const cust = find('customers', tx.customer_id); const renterId = cust.user_id;
  const isOwner = user.isShop && tx.owner_id === user.shopId; const isRenter = user.role === 'renter' && renterId === user.id;
  if (!isOwner && !isRenter) throw notFound('Transaction not found');
  if (isRenter && !(action === 'cancel' && tx.status === 'pending')) throw forbidden('Renters can only cancel pending requests');
  if (!rule.from.includes(tx.status)) throw conflict(`Cannot ${action} a transaction that is ${tx.status}`);
  if (rule.only && rule.only !== tx.type) throw badRequest(`"${action}" applies to ${rule.only} transactions only`);
  if (action === 'approve') assertAvailable(tx, tx.id);
  let ret;
  if (action === 'return') {
    ret = actual_return || today();
    if (ret < tx.start_date) throw badRequest('Return date cannot be before the rental start date');
  }
  const variant = find('variants', tx.variant_id);
  if (action === 'finalize') {
    if (variant.total_quantity < tx.quantity) throw conflict('Not enough stock to finalize this purchase');
    variant.total_quantity -= tx.quantity;
  }
  tx.status = rule.to; tx.updated_at = stamp();
  if (ret) tx.actual_return = ret;
  if (note) tx.notes = [tx.notes, `[${action}] ${note}`].filter(Boolean).join('\n');
  if (mark_paid && isOwner && action === 'finalize') recordPaymentTx(user, tx, tx.amount - db.payments.filter((p) => p.transaction_id === tx.id).reduce((n, p) => n + p.amount, 0), 'cash');

  const item = find('items', variant.item_id).name;
  const msgs = {
    approve: ['REQUEST_APPROVED', `Your ${tx.type} request for "${item}" was approved`], reject: ['REQUEST_REJECTED', `Your ${tx.type} request for "${item}" was rejected`],
    release: ['ITEM_RELEASED', `"${item}" has been released to you. Return by ${tx.expected_return}`], return: ['ITEM_RETURNED', `Return of "${item}" recorded. Thank you!`],
    finalize: ['PURCHASE_COMPLETED', `Your purchase of "${item}" is complete`], cancel: ['REQUEST_CANCELLED', `Request for "${item}" was cancelled`],
  };
  const [type, msg] = msgs[action];
  if (isOwner && renterId) notify(renterId, type, msg, tx.id);
  if (isRenter) notifyShop(tx.owner_id, type, `${cust.name} cancelled a request for "${item}"`, tx.id);
  logActivity({ actorId: user.id, targetUserId: renterId, action: `TX_${action.toUpperCase()}`, description: `${user.name}: ${action} ${tx.type} #${tx.id} "${item}"` });
}

export const routes = mount('/transactions', [authenticate, staffNeeds('transactions')], [
  ['GET', '/', [], ({ user, query }) => { const f = parse(listQuery, query); return paged(listTransactions(user, f), paginate(f)); }],
  ['GET', '/:id', [], ({ user, params }) => getTransaction(user, parse(idParam, params).id)],
  ['POST', '/request', [requireRole('renter')], ({ user, body }) => {
    const d = parse(requestSchema, body);
    return atomic(() => created(getTransaction(user, createRequestTx(user, d))));
  }],
  ['POST', '/manual', [requireShop], ({ user, body }) => {
    const d = parse(manualSchema, body);
    validateDates(d);
    const info = variantInfo(d.variant_id);
    if (!info || info.item.owner_id !== user.shopId || info.item.archived_at) throw notFound('Item not found');
    const cust = getDb().customers.find((c) => c.id === d.customer_id && c.owner_id === user.shopId);
    if (!cust) throw notFound('Customer not found');
    assertAvailable(d);
    const tx = insertTx(user.shopId, cust.id, d, computeAmount(info, d), 'approved');
    logActivity({ actorId: user.id, action: `${d.type.toUpperCase()}_CREATE`, description: `${user.name} recorded ${d.type} of "${info.item.name}" for ${cust.name}` });
    return created(getTransaction(user, tx.id));
  }],
  ['POST', '/:id/action', [requireRole('owner', 'staff', 'renter')], ({ user, params, body }) => {
    const { id: txId } = parse(idParam, params); const d = parse(actionSchema, body);
    return atomic(() => { applyAction(user, txId, d); return getTransaction(user, txId); });
  }],
  ['POST', '/:id/payments', [requireShop], ({ user, params, body }) => {
    const { id: txId } = parse(idParam, params); const d = parse(paymentSchema, body);
    const tx = getDb().transactions.find((t) => t.id === txId && t.owner_id === user.shopId);
    if (!tx) throw notFound('Transaction not found');
    if (['rejected', 'cancelled'].includes(tx.status)) throw conflict('Cannot record payment for a rejected or cancelled transaction');
    const paid = getDb().payments.filter((p) => p.transaction_id === txId).reduce((n, p) => n + p.amount, 0);
    if (paid + d.amount > tx.amount + 0.001) throw badRequest(`Payment exceeds the balance (${(tx.amount - paid).toFixed(2)})`);
    recordPaymentTx(user, tx, d.amount, d.method);
    logActivity({ actorId: user.id, action: 'PAYMENT_UPDATE', description: `${user.name} recorded payment of ${d.amount.toFixed(2)} on transaction #${txId}` });
    return created(getTransaction(user, txId));
  }],
]);

