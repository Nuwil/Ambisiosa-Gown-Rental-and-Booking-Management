import { authenticate, mount, requireRole } from './router.js';
import { atomic, getDb, insert } from './store.js';
import { availableOf, find, primaryImage, shopName, urlFor } from './model.js';
import { badRequest, conflict, created, inclusiveDays, notFound, stamp, today } from './util.js';
import { array, date, id, idParam, int, object, oneOf, optStr, parse, union } from './validate.js';
import { createRequestTx, validateDates } from './transactions.js';

const MAX_LINES = 50;
const quantity = int({ min: 1, max: 100 });
const addSchema = union('type', {
  rental: object({ type: oneOf(['rental']), variant_id: id(), quantity, start_date: date(), expected_return: date() }),
  purchase: object({ type: oneOf(['purchase']), variant_id: id(), quantity }),
});
const updateSchema = object({ quantity: int({ min: 1, max: 100, optional: true }), start_date: date({ optional: true }), expected_return: date({ optional: true }) },
  { refine: (v) => (Object.keys(v).length ? null : 'Nothing to update') });
const checkoutSchema = object({ ids: array(id(), { min: 1, max: 50, optional: true }), contact_phone: optStr(30), contact_address: optStr(255), notes: optStr(1000) });

/** Price + validity of one line; the authoritative re-check happens at checkout. */
function evaluate(c) {
  const v = find('variants', c.variant_id); const item = find('items', v.item_id); const owner = find('users', item.owner_id);
  const start = c.start_date ?? null; const end = c.expected_return ?? null;
  let issue = null; let days = null; let unit = null;
  if (!item.is_published || item.archived_at || owner.status !== 'active') issue = 'No longer available';
  else if (c.type === 'purchase') { unit = item.purchase_price; if (unit == null) issue = 'Not available for purchase'; }
  else {
    unit = item.rental_price;
    if (start < today()) issue = 'Start date is in the past — update the dates';
    else if (end < start) issue = 'Return date is before the start date';
    else days = inclusiveDays(start, end);
  }
  const available = availableOf(v, c.type === 'rental' ? start : today(), c.type === 'rental' ? end : today());
  if (!issue && available < c.quantity) issue = available > 0 ? `Only ${available} available for these dates` : 'Not available for these dates';
  const img = primaryImage(item.id);
  return {
    id: c.id, variant_id: c.variant_id, item_id: item.id, type: c.type, quantity: c.quantity, start_date: start, expected_return: end, days,
    item_name: item.name, size: v.size, shop_name: shopName(owner), image_url: img ? urlFor(img, item) : null,
    unit_price: unit, line_total: unit == null ? 0 : unit * c.quantity * (c.type === 'rental' ? days ?? 0 : 1), available, issue,
  };
}

const mine = (userId) => getDb().cart.filter((c) => c.renter_id === userId);
function listCart(userId) {
  const lines = mine(userId).sort((a, b) => b.id - a.id).map(evaluate);
  return {
    lines, count: lines.reduce((n, l) => n + l.quantity, 0), total: lines.reduce((n, l) => n + l.line_total, 0),
    valid_total: lines.filter((l) => !l.issue).reduce((n, l) => n + l.line_total, 0), has_issues: lines.some((l) => l.issue),
  };
}
const line = (userId, lineId) => {
  const c = mine(userId).find((x) => x.id === lineId);
  if (!c) throw notFound('Cart line not found');
  return c;
};

export const routes = mount('/cart', [authenticate, requireRole('renter')], [
  ['GET', '/', [], ({ user }) => listCart(user.id)],
  ['GET', '/count', [], ({ user }) => ({ count: mine(user.id).length })],
  ['POST', '/', [], ({ user, body }) => {
    const d = parse(addSchema, body);
    validateDates(d);
    const v = find('variants', d.variant_id); const item = v && find('items', v.item_id);
    if (!item || !item.is_published || item.archived_at || find('users', item.owner_id).status !== 'active' || (d.type === 'purchase' && item.purchase_price == null)) throw notFound('Item not available');
    const existing = mine(user.id).find((c) => c.variant_id === d.variant_id && c.type === d.type);
    if (!existing && mine(user.id).length >= MAX_LINES) throw conflict(`Your cart is full (${MAX_LINES} lines)`);
    const dates = d.type === 'rental' ? { start_date: d.start_date, expected_return: d.expected_return } : { start_date: null, expected_return: null };
    if (existing) Object.assign(existing, { quantity: Math.min(existing.quantity + d.quantity, 100), ...dates, updated_at: stamp() });
    else insert('cart', { renter_id: user.id, variant_id: d.variant_id, type: d.type, quantity: d.quantity, ...dates, created_at: stamp(), updated_at: stamp() });
    return created(listCart(user.id));
  }],
  ['POST', '/checkout', [], ({ user, body }) => {
    const d = parse(checkoutSchema, body);
    return atomic(() => {
      const rows = mine(user.id).filter((c) => !d.ids?.length || d.ids.includes(c.id)).sort((a, b) => a.variant_id - b.variant_id || a.id - b.id);
      if (!rows.length) throw badRequest('Select at least one item to check out');
      if (d.ids?.length && rows.length !== new Set(d.ids).size) throw notFound('Some cart lines no longer exist — refresh your cart');
      const ids = rows.map((r) => {
        const req = r.type === 'rental'
          ? { type: 'rental', variant_id: r.variant_id, quantity: r.quantity, start_date: r.start_date, expected_return: r.expected_return, notes: d.notes }
          : { type: 'purchase', variant_id: r.variant_id, quantity: r.quantity, contact_phone: d.contact_phone, contact_address: d.contact_address, notes: d.notes };
        try { return createRequestTx(user, req); } catch (e) {
          e.message = `${find('items', find('variants', r.variant_id).item_id).name}: ${e.message}`; throw e;
        }
      });
      const db = getDb();
      db.cart = db.cart.filter((c) => !rows.includes(c));
      return created({ transaction_ids: ids, cart: listCart(user.id) });
    });
  }],
  ['PATCH', '/:id', [], ({ user, params, body }) => {
    const { id: lineId } = parse(idParam, params); const d = parse(updateSchema, body);
    const cur = line(user.id, lineId);
    if (cur.type === 'purchase' && (d.start_date || d.expected_return)) throw badRequest('Purchases have no dates');
    const next = { type: cur.type, quantity: d.quantity ?? cur.quantity, start_date: d.start_date ?? cur.start_date, expected_return: d.expected_return ?? cur.expected_return };
    validateDates(next);
    Object.assign(cur, { quantity: next.quantity, updated_at: stamp(), ...(cur.type === 'rental' ? { start_date: next.start_date, expected_return: next.expected_return } : {}) });
    return listCart(user.id);
  }],
  ['DELETE', '/:id', [], ({ user, params }) => {
    const c = line(user.id, parse(idParam, params).id); const db = getDb();
    db.cart.splice(db.cart.indexOf(c), 1);
    return listCart(user.id);
  }],
  ['DELETE', '/', [], ({ user }) => { const db = getDb(); db.cart = db.cart.filter((c) => c.renter_id !== user.id); return listCart(user.id); }],
]);
