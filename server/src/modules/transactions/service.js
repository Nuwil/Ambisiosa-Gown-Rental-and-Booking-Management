import { q, q1, withTransaction } from '../../config/db.js';
import { badRequest, notFound, conflict, forbidden, inclusiveDays } from '../../utils/http.js';
import { logActivity, notify, notifyShop } from '../../utils/audit.js';
import { lockedAvailable, today } from '../inventory/availability.js';

// ---------- Shared read model ----------
const SELECT = `
  SELECT t.id, t.owner_id, t.customer_id, t.variant_id, t.type, t.quantity, t.start_date, t.expected_return, t.actual_return,
    t.amount, t.status, t.payment_status, t.notes, t.created_at, t.updated_at,
    c.name AS customer_name, c.phone AS customer_phone, c.user_id AS renter_user_id,
    i.id AS item_id, i.name AS item_name, i.rental_price, i.purchase_price, cat.id AS category_id, cat.name AS category,
    v.size, COALESCE(o.shop_name, o.name) AS shop_name,
    (SELECT path FROM item_images im WHERE im.item_id = i.id ORDER BY im.is_primary DESC, im.id LIMIT 1) AS image,
    CASE WHEN t.type = 'rental' THEN DATEDIFF(COALESCE(t.actual_return, t.expected_return), t.start_date) + 1 END AS duration_days,
    (t.type = 'rental' AND t.status = 'active' AND t.expected_return < CURDATE()) AS is_overdue,
    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.transaction_id = t.id), 0) AS amount_paid
  FROM transactions t
  JOIN customers c ON c.id = t.customer_id
  JOIN item_variants v ON v.id = t.variant_id
  JOIN items i ON i.id = v.item_id
  JOIN categories cat ON cat.id = i.category_id
  JOIN users o ON o.id = t.owner_id`;

const shape = (r) => ({
  ...r,
  is_overdue: !!r.is_overdue,
  display_status: r.is_overdue ? 'overdue' : r.status,
  image_url: r.image ? `/uploads/${r.image}` : null,
});

function buildFilters(f, scope) {
  const where = [scope.sql]; const params = [...scope.params];
  if (f.type) { where.push('t.type = ?'); params.push(f.type); }
  if (f.status === 'overdue') where.push("(t.type='rental' AND t.status='active' AND t.expected_return < CURDATE())");
  else if (f.status) { where.push('t.status = ?'); params.push(f.status); }
  if (f.payment_status) { where.push('t.payment_status = ?'); params.push(f.payment_status); }
  if (f.category_id) { where.push('cat.id = ?'); params.push(f.category_id); }
  if (f.customer_id) { where.push('t.customer_id = ?'); params.push(f.customer_id); }
  if (f.from) { where.push('DATE(t.created_at) >= ?'); params.push(f.from); }
  if (f.to) { where.push('DATE(t.created_at) <= ?'); params.push(f.to); }
  if (f.q) { where.push('(i.name LIKE ? OR c.name LIKE ? OR CAST(t.id AS CHAR) = ?)'); params.push(`%${f.q}%`, `%${f.q}%`, f.q); }
  return { where: where.join(' AND '), params };
}

export async function listTransactions(scope, { limit, offset }, f) {
  const { where, params } = buildFilters(f, scope);
  const [{ total }] = await q(
    `SELECT COUNT(*) AS total FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN item_variants v ON v.id=t.variant_id
     JOIN items i ON i.id=v.item_id JOIN categories cat ON cat.id=i.category_id WHERE ${where}`, params);
  const rows = await q(`${SELECT} WHERE ${where} ORDER BY t.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  return { rows: rows.map(shape), total };
}

export const scopes = {
  owner: (id) => ({ sql: 't.owner_id = ?', params: [id] }),
  renter: (id) => ({ sql: 'c.user_id = ?', params: [id] }),
  admin: () => ({ sql: '1=1', params: [] }),
};

/** Shop users (owner + staff) share the owner's scope; renters and admin keep their own. */
export const scopeFor = (user) => (user.isShop ? scopes.owner(user.shopId) : scopes[user.role](user.id));

export async function getTransaction(user, id) {
  const sc = scopeFor(user);
  const row = await q1(`${SELECT} WHERE t.id = ? AND ${sc.sql}`, [id, ...sc.params]);
  if (!row) throw notFound('Transaction not found');
  const payments = await q('SELECT id, amount, method, paid_at FROM payments WHERE transaction_id = ? ORDER BY id', [id]);
  return { ...shape(row), payments };
}

// ---------- Create ----------
async function loadVariantForUpdate(conn, variantId) {
  const v = await q1(
    `SELECT v.id, v.size, v.total_quantity, i.id AS item_id, i.name, i.owner_id, i.rental_price, i.purchase_price, i.is_published, i.archived_at, u.status AS owner_status
     FROM item_variants v JOIN items i ON i.id = v.item_id JOIN users u ON u.id = i.owner_id WHERE v.id = ?`, [variantId], conn);
  return v;
}

function computeAmount(variant, d) {
  if (d.type === 'purchase') {
    if (variant.purchase_price == null) throw badRequest('This item is not available for purchase');
    return variant.purchase_price * d.quantity;
  }
  return variant.rental_price * d.quantity * inclusiveDays(d.start_date, d.expected_return);
}

function validateDates(d) {
  if (d.type !== 'rental') return;
  if (d.start_date < today()) throw badRequest('Rental start date cannot be in the past');
  if (d.expected_return < d.start_date) throw badRequest('Return date must be on or after the start date');
  if (inclusiveDays(d.start_date, d.expected_return) > 365) throw badRequest('Rental period cannot exceed 365 days');
}

async function upsertRenterCustomer(conn, ownerId, user, contact = {}) {
  await conn.execute(
    `INSERT INTO customers (owner_id, user_id, name, phone, email, address) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email),
       phone = COALESCE(VALUES(phone), phone), address = COALESCE(VALUES(address), address)`,
    [ownerId, user.id, user.name, contact.contact_phone ?? user.phone ?? null, user.email, contact.contact_address ?? user.address ?? null]
  );
  const [[c]] = await conn.execute('SELECT id FROM customers WHERE owner_id = ? AND user_id = ?', [ownerId, user.id]);
  return c.id;
}

async function insertTx(conn, { ownerId, customerId, d, amount, status }) {
  const [res] = await conn.execute(
    `INSERT INTO transactions (owner_id, customer_id, variant_id, type, quantity, start_date, expected_return, amount, status, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [ownerId, customerId, d.variant_id, d.type, d.quantity, d.start_date ?? null, d.expected_return ?? null, amount, status, d.notes ?? null]
  );
  return res.insertId;
}

async function assertAvailable(conn, d, ignoreTxId = 0) {
  const start = d.type === 'rental' ? d.start_date : today();
  const end = d.type === 'rental' ? d.expected_return : today();
  const avail = await lockedAvailable(conn, d.variant_id, start, end, ignoreTxId);
  if (!avail) throw notFound('Item size not found');
  if (avail.available < d.quantity) {
    throw conflict(avail.available > 0 ? `Only ${avail.available} unit(s) available for the selected period` : 'Not available for the selected period');
  }
}

/** Creates one pending request inside the caller's transaction (locks the variant, re-checks availability). */
export async function createRequestTx(conn, user, d) {
  validateDates(d);
  const variant = await loadVariantForUpdate(conn, d.variant_id);
  if (!variant || !variant.is_published || variant.archived_at || variant.owner_status !== 'active') throw notFound('Item not available');
  await assertAvailable(conn, d);
  const amount = computeAmount(variant, d);
  const customerId = await upsertRenterCustomer(conn, variant.owner_id, user, d);
  const id = await insertTx(conn, { ownerId: variant.owner_id, customerId, d, amount, status: 'pending' });
  await notifyShop(variant.owner_id, 'REQUEST_SUBMITTED', `New ${d.type} request for "${variant.name}" (${variant.size}) from ${user.name}`, id, conn);
  await logActivity({ actorId: user.id, targetUserId: variant.owner_id, action: `${d.type.toUpperCase()}_REQUEST`, description: `${user.name} requested ${d.type} of "${variant.name}" x${d.quantity}` }, conn);
  return id;
}

/** Renter submits a request → status pending. */
export async function createRequest(user, d) {
  const txId = await withTransaction((conn) => createRequestTx(conn, user, d));
  return getTransaction(user, txId);
}

/** Owner creates a transaction for one of their customers; it is pre-approved (stock reserved). */
export async function createManual(owner, d) {
  validateDates(d);
  const txId = await withTransaction(async (conn) => {
    const variant = await loadVariantForUpdate(conn, d.variant_id);
    if (!variant || variant.owner_id !== owner.shopId || variant.archived_at) throw notFound('Item not found');
    const cust = await q1('SELECT id, name FROM customers WHERE id = ? AND owner_id = ?', [d.customer_id, owner.shopId], conn);
    if (!cust) throw notFound('Customer not found');
    await assertAvailable(conn, d);
    const id = await insertTx(conn, { ownerId: owner.shopId, customerId: cust.id, d, amount: computeAmount(variant, d), status: 'approved' });
    await logActivity({ actorId: owner.id, action: `${d.type.toUpperCase()}_CREATE`, description: `${owner.name} recorded ${d.type} of "${variant.name}" for ${cust.name}` }, conn);
    return id;
  });
  return getTransaction(owner, txId);
}

// ---------- Lifecycle ----------
const TRANSITIONS = {
  approve:  { from: ['pending'], to: 'approved' },
  reject:   { from: ['pending'], to: 'rejected' },
  release:  { from: ['approved'], to: 'active', only: 'rental' },
  return:   { from: ['active'], to: 'completed', only: 'rental' },
  finalize: { from: ['approved'], to: 'completed', only: 'purchase' },
  cancel:   { from: ['pending', 'approved'], to: 'cancelled' },
};

export async function applyAction(user, id, { action, actual_return, mark_paid, note }) {
  const rule = TRANSITIONS[action];
  await withTransaction(async (conn) => {
    const tx = await q1(
      `SELECT t.*, i.name AS item_name, c.user_id AS renter_id, c.name AS customer_name
       FROM transactions t JOIN item_variants v ON v.id = t.variant_id JOIN items i ON i.id = v.item_id JOIN customers c ON c.id = t.customer_id
       WHERE t.id = ? FOR UPDATE`, [id], conn);
    if (!tx) throw notFound('Transaction not found');

    const isOwner = user.isShop && tx.owner_id === user.shopId;
    const isRenter = user.role === 'renter' && tx.renter_id === user.id;
    if (!isOwner && !isRenter) throw notFound('Transaction not found'); // do not leak existence
    if (isRenter && !(action === 'cancel' && tx.status === 'pending')) throw forbidden('Renters can only cancel pending requests');
    if (!rule.from.includes(tx.status)) throw conflict(`Cannot ${action} a transaction that is ${tx.status}`);
    if (rule.only && rule.only !== tx.type) throw badRequest(`"${action}" applies to ${rule.only} transactions only`);

    if (action === 'approve') await assertAvailable(conn, { type: tx.type, variant_id: tx.variant_id, quantity: tx.quantity, start_date: tx.start_date, expected_return: tx.expected_return }, tx.id);

    let extra = '';
    const params = [rule.to];
    if (action === 'return') {
      const ret = actual_return || today();
      if (ret < tx.start_date) throw badRequest('Return date cannot be before the rental start date');
      extra = ', actual_return = ?'; params.push(ret);
    }
    if (action === 'finalize') {
      const [[v]] = await conn.execute('SELECT total_quantity FROM item_variants WHERE id = ? FOR UPDATE', [tx.variant_id]);
      if (v.total_quantity < tx.quantity) throw conflict('Not enough stock to finalize this purchase');
      await conn.execute('UPDATE item_variants SET total_quantity = total_quantity - ? WHERE id = ?', [tx.quantity, tx.variant_id]);
    }
    if (note) { extra += ', notes = CONCAT_WS(CHAR(10), notes, ?)'; params.push(`[${action}] ${note}`); }
    await conn.execute(`UPDATE transactions SET status = ?${extra} WHERE id = ?`, [...params, id]);

    if (mark_paid && isOwner && action === 'finalize') {
      const { s } = await q1('SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE transaction_id = ?', [tx.id], conn);
      await recordPaymentTx(conn, user, tx.id, Number(tx.amount) - Number(s), 'cash');
    }

    const msgs = {
      approve: [`Your ${tx.type} request for "${tx.item_name}" was approved`, 'REQUEST_APPROVED'],
      reject: [`Your ${tx.type} request for "${tx.item_name}" was rejected`, 'REQUEST_REJECTED'],
      release: [`"${tx.item_name}" has been released to you. Return by ${tx.expected_return}`, 'ITEM_RELEASED'],
      return: [`Return of "${tx.item_name}" recorded. Thank you!`, 'ITEM_RETURNED'],
      finalize: [`Your purchase of "${tx.item_name}" is complete`, 'PURCHASE_COMPLETED'],
      cancel: [`Request for "${tx.item_name}" was cancelled`, 'REQUEST_CANCELLED'],
    };
    const [msg, type] = msgs[action];
    if (isOwner && tx.renter_id) await notify(tx.renter_id, type, msg, tx.id, conn);
    if (isRenter) await notifyShop(tx.owner_id, type, `${tx.customer_name} cancelled a request for "${tx.item_name}"`, tx.id, conn);
    await logActivity({ actorId: user.id, targetUserId: tx.renter_id, action: `TX_${action.toUpperCase()}`, description: `${user.name}: ${action} ${tx.type} #${tx.id} "${tx.item_name}"` }, conn);
  });
  return getTransaction(user, id);
}

async function recordPaymentTx(conn, user, txId, amount, method) {
  if (amount <= 0) return;
  await conn.execute('INSERT INTO payments (transaction_id, amount, method, paid_at, recorded_by) VALUES (?,?,?,NOW(),?)', [txId, amount, method ?? null, user.id]);
  const [[t]] = await conn.execute('SELECT amount FROM transactions WHERE id = ?', [txId]);
  const [[s]] = await conn.execute('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE transaction_id = ?', [txId]);
  const status = Number(s.paid) >= Number(t.amount) ? 'paid' : 'partial';
  await conn.execute('UPDATE transactions SET payment_status = ? WHERE id = ?', [status, txId]);
}

export async function recordPayment(owner, id, { amount, method }) {
  await withTransaction(async (conn) => {
    const tx = await q1('SELECT id, amount, status FROM transactions WHERE id = ? AND owner_id = ? FOR UPDATE', [id, owner.shopId], conn);
    if (!tx) throw notFound('Transaction not found');
    if (['rejected', 'cancelled'].includes(tx.status)) throw conflict('Cannot record payment for a rejected or cancelled transaction');
    const paid = Number((await q1('SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE transaction_id = ?', [id], conn)).s);
    if (paid + amount > Number(tx.amount) + 0.001) throw badRequest(`Payment exceeds the balance (${(Number(tx.amount) - paid).toFixed(2)})`);
    await recordPaymentTx(conn, owner, id, amount, method);
    await logActivity({ actorId: owner.id, action: 'PAYMENT_UPDATE', description: `${owner.name} recorded payment of ${amount.toFixed(2)} on transaction #${id}` }, conn);
  });
  return getTransaction(owner, id);
}
