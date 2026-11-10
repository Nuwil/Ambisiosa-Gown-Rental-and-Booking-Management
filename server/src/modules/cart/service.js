import { q, q1, withTransaction } from '../../config/db.js';
import { badRequest, notFound, conflict, inclusiveDays } from '../../utils/http.js';
import { RESERVED_SUBQUERY, today } from '../inventory/availability.js';
import { createRequestTx } from '../transactions/service.js';

const MAX_LINES = 50;

const LINES = `
  SELECT c.id, c.variant_id, c.type, c.quantity, c.start_date, c.expected_return, c.created_at,
    v.size, v.total_quantity, i.id AS item_id, i.name AS item_name, i.rental_price, i.purchase_price,
    i.is_published, i.archived_at, o.status AS owner_status, COALESCE(o.shop_name, o.name) AS shop_name,
    (SELECT path FROM item_images im WHERE im.item_id = i.id ORDER BY im.is_primary DESC, im.id LIMIT 1) AS image,
    ${RESERVED_SUBQUERY} AS reserved
  FROM cart_items c
  JOIN item_variants v ON v.id = c.variant_id
  JOIN items i ON i.id = v.item_id
  JOIN users o ON o.id = i.owner_id`;

const fmtDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

/** Price + validity of one line. Non-locking; the authoritative re-check happens at checkout. */
function evaluate(r) {
  const start = fmtDate(r.start_date); const end = fmtDate(r.expected_return);
  let issue = null;
  let days = null;
  let unit = null;
  if (!r.is_published || r.archived_at || r.owner_status !== 'active') issue = 'No longer available';
  else if (r.type === 'purchase') {
    unit = r.purchase_price;
    if (unit == null) issue = 'Not available for purchase';
  } else {
    unit = r.rental_price;
    if (start < today()) issue = 'Start date is in the past — update the dates';
    else if (end < start) issue = 'Return date is before the start date';
    else days = inclusiveDays(start, end);
  }
  const available = Math.max(0, r.total_quantity - Number(r.reserved));
  if (!issue && available < r.quantity) issue = available > 0 ? `Only ${available} available for these dates` : 'Not available for these dates';
  const mult = r.type === 'rental' ? days ?? 0 : 1;
  return {
    id: r.id, variant_id: r.variant_id, item_id: r.item_id, type: r.type, quantity: r.quantity,
    start_date: start, expected_return: end, days,
    item_name: r.item_name, size: r.size, shop_name: r.shop_name,
    image_url: r.image ? `/uploads/${r.image}` : null,
    unit_price: unit, line_total: unit == null ? 0 : unit * r.quantity * mult,
    available, issue,
  };
}

export async function listCart(userId) {
  // Availability window per line: its own dates for rentals, today for purchases.
  const rows = await q(`SELECT id FROM cart_items WHERE renter_id = ? ORDER BY id DESC`, [userId]);
  if (!rows.length) return { lines: [], count: 0, total: 0, valid_total: 0, has_issues: false };
  const lines = [];
  for (const { id } of rows) lines.push(await oneLine(userId, id));
  const live = lines.filter(Boolean);
  return summarize(live);
}

async function oneLine(userId, id, conn) {
  const raw = await q1(`SELECT type, start_date, expected_return FROM cart_items WHERE id = ? AND renter_id = ?`, [id, userId], conn);
  if (!raw) return null;
  const start = raw.type === 'rental' ? fmtDate(raw.start_date) : today();
  const end = raw.type === 'rental' ? fmtDate(raw.expected_return) : today();
  const r = await q1(`${LINES} WHERE c.id = ? AND c.renter_id = ?`, [end, start, id, userId], conn);
  return r ? evaluate(r) : null;
}

const summarize = (lines) => ({
  lines,
  count: lines.reduce((n, l) => n + l.quantity, 0),
  total: lines.reduce((n, l) => n + l.line_total, 0),
  valid_total: lines.filter((l) => !l.issue).reduce((n, l) => n + l.line_total, 0),
  has_issues: lines.some((l) => l.issue),
});

export async function cartCount(userId) {
  const r = await q1('SELECT COUNT(*) AS n FROM cart_items WHERE renter_id = ?', [userId]);
  return Number(r.n);
}

function checkDates(d) {
  if (d.type !== 'rental') return;
  if (d.start_date < today()) throw badRequest('Rental start date cannot be in the past');
  if (d.expected_return < d.start_date) throw badRequest('Return date must be on or after the start date');
  if (inclusiveDays(d.start_date, d.expected_return) > 365) throw badRequest('Rental period cannot exceed 365 days');
}

/** Add (or merge into) a cart line. Same item+size+type merges: quantity adds up, dates are replaced. */
export async function addToCart(userId, d) {
  checkDates(d);
  const v = await q1(
    `SELECT v.id FROM item_variants v JOIN items i ON i.id = v.item_id JOIN users o ON o.id = i.owner_id
     WHERE v.id = ? AND i.is_published = 1 AND i.archived_at IS NULL AND o.status = 'active'
       AND (? = 'rental' OR i.purchase_price IS NOT NULL)`, [d.variant_id, d.type]);
  if (!v) throw notFound('Item not available');
  const existing = await q1('SELECT id FROM cart_items WHERE renter_id = ? AND variant_id = ? AND type = ?', [userId, d.variant_id, d.type]);
  if (!existing && (await cartCount(userId)) >= MAX_LINES) throw conflict(`Your cart is full (${MAX_LINES} lines)`);
  await q(
    `INSERT INTO cart_items (renter_id, variant_id, type, quantity, start_date, expected_return) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE quantity = LEAST(quantity + VALUES(quantity), 100), start_date = VALUES(start_date), expected_return = VALUES(expected_return)`,
    [userId, d.variant_id, d.type, d.quantity, d.type === 'rental' ? d.start_date : null, d.type === 'rental' ? d.expected_return : null]);
  return listCart(userId);
}

export async function updateLine(userId, id, d) {
  const cur = await q1('SELECT type, quantity, start_date, expected_return FROM cart_items WHERE id = ? AND renter_id = ?', [id, userId]);
  if (!cur) throw notFound('Cart line not found');
  const next = {
    type: cur.type, quantity: d.quantity ?? cur.quantity,
    start_date: d.start_date ?? fmtDate(cur.start_date), expected_return: d.expected_return ?? fmtDate(cur.expected_return),
  };
  if (cur.type === 'purchase' && (d.start_date || d.expected_return)) throw badRequest('Purchases have no dates');
  checkDates(next);
  await q('UPDATE cart_items SET quantity = ?, start_date = ?, expected_return = ? WHERE id = ? AND renter_id = ?',
    [next.quantity, cur.type === 'rental' ? next.start_date : null, cur.type === 'rental' ? next.expected_return : null, id, userId]);
  return listCart(userId);
}

export async function removeLine(userId, id) {
  const r = await q('DELETE FROM cart_items WHERE id = ? AND renter_id = ?', [id, userId]);
  if (!r.affectedRows) throw notFound('Cart line not found');
  return listCart(userId);
}

export const clearCart = async (userId) => { await q('DELETE FROM cart_items WHERE renter_id = ?', [userId]); return listCart(userId); };

/**
 * Turns the selected cart lines into pending requests in ONE database transaction:
 * if any line is no longer available nothing is created and the cart stays untouched.
 */
export async function checkout(user, { ids, contact_phone, contact_address, notes }) {
  const created = await withTransaction(async (conn) => {
    const where = ids?.length ? `AND id IN (${ids.map(() => '?').join(',')})` : '';
    const rows = await q(`SELECT id, variant_id, type, quantity, start_date, expected_return FROM cart_items WHERE renter_id = ? ${where} ORDER BY variant_id, id FOR UPDATE`,
      [user.id, ...(ids ?? [])], conn);
    if (!rows.length) throw badRequest('Select at least one item to check out');
    if (ids?.length && rows.length !== new Set(ids).size) throw notFound('Some cart lines no longer exist — refresh your cart');
    const txIds = [];
    for (const r of rows) { // ordered by variant to keep lock order stable across concurrent checkouts
      const d = r.type === 'rental'
        ? { type: 'rental', variant_id: r.variant_id, quantity: r.quantity, start_date: fmtDate(r.start_date), expected_return: fmtDate(r.expected_return), notes }
        : { type: 'purchase', variant_id: r.variant_id, quantity: r.quantity, contact_phone, contact_address, notes };
      try { txIds.push(await createRequestTx(conn, user, d)); }
      catch (e) {
        const name = (await q1('SELECT i.name FROM item_variants v JOIN items i ON i.id=v.item_id WHERE v.id = ?', [r.variant_id], conn))?.name;
        e.message = `${name ?? 'An item'}: ${e.message}`; throw e;
      }
    }
    await q(`DELETE FROM cart_items WHERE id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id), conn);
    return txIds;
  });
  return { transaction_ids: created, cart: await listCart(user.id) };
}
