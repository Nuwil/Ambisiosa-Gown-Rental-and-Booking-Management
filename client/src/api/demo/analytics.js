/** Port of server/src/modules/stats/analytics.js, computed from the in-memory data. */
import { requireRole } from './router.js';
import { getDb } from './store.js';
import { availableOf, find, itemCategory, isOverdue } from './model.js';
import { addDays, badRequest, dayOf, diffDays, groupBy, monthOf, round2, sumBy, today } from './util.js';
import { forecastMonthly, monthKey, monthRange } from './forecast.js';
import { date, object, oneOf, parse } from './validate.js';

const query = object({ range: oneOf(['daily', 'weekly', 'monthly', 'yearly', 'custom'], { default: 'monthly' }), from: date({ plain: true, optional: true }), to: date({ plain: true, optional: true }) });
const CONF = ['approved', 'active', 'completed'];

export function resolveRange({ range = 'monthly', from, to }) {
  const end = today();
  if (range === 'custom') {
    if (!from || !to) throw badRequest('Custom range requires from and to');
    if (from > to) throw badRequest('"from" must be before "to"');
    const days = diffDays(to, from) + 1;
    if (days > 3660) throw badRequest('Range too large (max 10 years)');
    return { from, to, bucket: days <= 92 ? 'day' : days <= 730 ? 'month' : 'year', range };
  }
  const p = { daily: [-29, 'day'], weekly: [-7 * 12 + 1, 'week'], monthly: [-365 + 1, 'month'], yearly: [-365 * 5 + 1, 'year'] }[range];
  if (!p) throw badRequest('Invalid range');
  return { from: addDays(end, p[0]), to: end, bucket: p[1], range };
}

const mondayOf = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const bucketOf = (d, bucket) => ({ day: d.slice(0, 10), week: mondayOf(d.slice(0, 10)), month: d.slice(0, 7), year: d.slice(0, 4) })[bucket];

function bucketKeys(from, to, bucket) {
  const keys = [];
  if (bucket === 'day' || bucket === 'week') for (let cur = bucket === 'week' ? mondayOf(from) : from; cur <= to; cur = addDays(cur, bucket === 'day' ? 1 : 7)) keys.push(cur);
  else if (bucket === 'month') { for (let k = from.slice(0, 7), e = to.slice(0, 7); k <= e; ) { keys.push(k); const [y, m] = k.split('-').map(Number); k = monthKey(new Date(Date.UTC(y, m, 1))); } }
  else for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) keys.push(String(y));
  return keys;
}
const fill = (keys, rows, fields) => keys.map((k) => ({ bucket: k, ...Object.fromEntries(fields.map((f) => [f, Number(rows.get(k)?.[f] ?? 0)])) }));
const tally = (items, keyFn, valFn) => { const m = new Map(); items.forEach((x) => { const k = keyFn(x); m.set(k, { ...(m.get(k) ?? {}), ...valFn(x, m.get(k) ?? {}) }); }); return m; };
const inRange = (d, from, to) => d >= from && d <= to;

function topItems(txs, type, dateOf, from, to) {
  const rows = txs.filter((t) => t.type === type && CONF.includes(t.status) && inRange(dateOf(t), from, to));
  return [...groupBy(rows, (t) => find('variants', t.variant_id).item_id)].map(([itemId, ts]) => {
    const it = find('items', itemId);
    return { id: itemId, name: it.name, category: itemCategory(it), transactions: ts.length, units: sumBy(ts, (t) => t.quantity) };
  }).sort((a, b) => b.units - a.units || b.transactions - a.transactions).slice(0, 10);
}

function inventoryStats(ownerId, from, to) {
  const db = getDb(); const t0 = today(); const days = Math.max(1, Math.round(diffDays(to, from)) + 1);
  const owned = db.items.filter((i) => !i.archived_at && (!ownerId || i.owner_id === ownerId));
  const variants = db.variants.filter((v) => owned.some((i) => i.id === v.item_id));
  const items = owned.filter((i) => variants.some((v) => v.item_id === i.id));
  const rented = db.transactions.filter((t) => t.type === 'rental');
  const list = items.map((it) => {
    const vs = variants.filter((v) => v.item_id === it.id); const vids = new Set(vs.map((v) => v.id));
    const mine = rented.filter((t) => vids.has(t.variant_id));
    const unitDays = sumBy(mine.filter((t) => ['active', 'completed'].includes(t.status) && t.start_date <= to && (t.actual_return ?? t.expected_return) >= from),
      (t) => t.quantity * (diffDays([(t.actual_return ?? t.expected_return), to].sort()[0], [t.start_date, from].sort()[1]) + 1));
    const units = sumBy(vs, (v) => v.total_quantity);
    return { id: it.id, name: it.name, category: itemCategory(it), units, unit_days: unitDays, rentals_90d: mine.filter((t) => CONF.includes(t.status) && t.start_date >= addDays(t0, -90)).length, utilization: Math.min(1, unitDays / ((units || 1) * days)) };
  }).sort((a, b) => b.unit_days - a.unit_days).slice(0, 200)
    .map(({ unit_days, ...r }) => r);
  return {
    items: list, total_items: new Set(variants.map((v) => v.item_id)).size, total_units: sumBy(variants, (v) => v.total_quantity), available_now: sumBy(variants, (v) => availableOf(v, t0, t0)),
    average_utilization: list.length ? list.reduce((a, b) => a + b.utilization, 0) / list.length : 0,
  };
}

function predictions(txs, pays, itemStats) {
  const months = monthRange(monthKey(new Date()), 24); const start = `${months[0]}-01`;
  const demand = txs.filter((t) => t.type === 'rental' && CONF.includes(t.status) && t.start_date >= start);
  const series = (rows, mf, vf) => months.map((m) => ({ month: m, value: sumBy(rows.filter((r) => mf(r) === m), vf) }));
  const catOf = (t) => itemCategory(find('items', find('variants', t.variant_id).item_id));
  const catNames = [...new Set(demand.map(catOf))];
  return {
    disclaimer: 'Estimates derived from your recorded history. They are not actual figures.',
    revenue: forecastMonthly(series(pays.filter((p) => dayOf(p.paid_at) >= start), (p) => monthOf(p.paid_at), (p) => p.amount), 3),
    rentalDemand: forecastMonthly(series(demand, (t) => monthOf(t.start_date), (t) => t.quantity), 3),
    categoryDemand: catNames.map((name) => ({ category: name, ...forecastMonthly(series(demand.filter((t) => catOf(t) === name), (t) => monthOf(t.start_date), (t) => t.quantity), 3) })),
    frequentlyRented: itemStats.filter((i) => i.rentals_90d > 0).sort((a, b) => b.rentals_90d - a.rentals_90d).slice(0, 5),
    replenishment: itemStats.filter((i) => i.rentals_90d >= 3 && i.utilization >= 0.6).slice(0, 10).map((i) => ({
      item_id: i.id, name: i.name, category: i.category, units: i.units, utilization: i.utilization, rentals_90d: i.rentals_90d,
      suggestion: `High demand: ${i.rentals_90d} rentals in 90 days at ${(i.utilization * 100).toFixed(0)}% utilisation. Consider adding ${Math.max(1, Math.ceil(i.units * 0.25))} more unit(s).`,
    })),
  };
}

export function buildAnalytics(ownerId, opts) {
  const db = getDb(); const { from, to, bucket } = resolveRange(opts); const t0 = today();
  const txs = db.transactions.filter((t) => !ownerId || t.owner_id === ownerId);
  const typeOf = new Map(txs.map((t) => [t.id, t.type]));
  const pays = db.payments.filter((p) => typeOf.has(p.transaction_id));
  const keys = bucketKeys(from, to, bucket);
  const rangePays = pays.filter((p) => inRange(dayOf(p.paid_at), from, to));
  const rentals = txs.filter((t) => t.type === 'rental' && CONF.includes(t.status) && inRange(t.start_date, from, to));
  const purchases = txs.filter((t) => t.type === 'purchase' && CONF.includes(t.status) && inRange(dayOf(t.created_at), from, to));
  const revMap = tally(rangePays, (p) => bucketOf(dayOf(p.paid_at), bucket), (p, cur) => ({
    total: (cur.total ?? 0) + p.amount, rental: (cur.rental ?? 0) + (typeOf.get(p.transaction_id) === 'rental' ? p.amount : 0), purchase: (cur.purchase ?? 0) + (typeOf.get(p.transaction_id) === 'purchase' ? p.amount : 0),
  }));
  const countMap = (rows, dateOf) => tally(rows, (t) => bucketOf(dateOf(t), bucket), (t, cur) => ({ count: (cur.count ?? 0) + 1 }));
  const buyMap = countMap(purchases, (t) => dayOf(t.created_at));
  const revenue = sumBy(rangePays, (p) => p.amount); const nRent = rentals.length; const nBuy = purchases.length;
  const confInRange = txs.filter((t) => CONF.includes(t.status) && inRange(dayOf(t.created_at), from, to));
  const allConf = groupBy(txs.filter((t) => CONF.includes(t.status)), (t) => t.customer_id);
  const activeCust = new Set(confInRange.map((t) => t.customer_id));
  const repeat = [...activeCust].filter((c) => (allConf.get(c)?.length ?? 0) >= 2).length;
  const overdueNow = txs.filter(isOverdue);
  const returned = txs.filter((t) => t.type === 'rental' && t.status === 'completed' && t.actual_return && inRange(t.actual_return, from, to));
  const inventory = inventoryStats(ownerId, from, to);
  const info = (t) => { const v = find('variants', t.variant_id); return { item: find('items', v.item_id), size: v.size, cust: find('customers', t.customer_id) }; };

  const result = {
    range: { from, to, bucket, range: opts.range ?? 'monthly' },
    summary: {
      revenue, rental_revenue: sumBy(rangePays.filter((p) => typeOf.get(p.transaction_id) === 'rental'), (p) => p.amount), purchase_revenue: sumBy(rangePays.filter((p) => typeOf.get(p.transaction_id) === 'purchase'), (p) => p.amount),
      rental_count: nRent, purchase_count: nBuy, pending_requests: txs.filter((t) => t.status === 'pending').length,
      declined_count: txs.filter((t) => ['rejected', 'cancelled'].includes(t.status) && inRange(dayOf(t.created_at), from, to)).length,
      avg_transaction_value: nRent + nBuy ? revenue / (nRent + nBuy) : 0,
    },
    revenueSeries: fill(keys, revMap, ['total', 'rental', 'purchase']),
    rentalTrend: fill(keys, countMap(rentals, (t) => t.start_date), ['count']).map((r) => ({ ...r, purchases: buyMap.get(r.bucket)?.count ?? 0, key: r.bucket })),
    topRented: topItems(txs, 'rental', (t) => t.start_date, from, to), topPurchased: topItems(txs, 'purchase', (t) => dayOf(t.created_at), from, to),
    categories: [...groupBy(confInRange, (t) => itemCategory(info(t).item))].map(([category, ts]) => ({ category, rentals: ts.filter((t) => t.type === 'rental').length, purchases: ts.filter((t) => t.type === 'purchase').length, total: ts.length })).sort((a, b) => b.total - a.total),
    customers: { active: activeCust.size, repeat, retention_rate: activeCust.size ? repeat / activeCust.size : 0 },
    overdue: {
      current: overdueNow.length, units: sumBy(overdueNow, (t) => t.quantity), avg_days_overdue: overdueNow.length ? Math.round((sumBy(overdueNow, (t) => diffDays(t0, t.expected_return)) / overdueNow.length) * 10) / 10 : 0,
      returned_in_range: returned.length, returned_late: returned.filter((t) => t.actual_return > t.expected_return).length,
    },
    upcomingReturns: txs.filter((t) => t.type === 'rental' && t.status === 'active' && inRange(t.expected_return, t0, addDays(t0, 14))).sort((a, b) => a.expected_return.localeCompare(b.expected_return)).slice(0, 50)
      .map((t) => ({ id: t.id, expected_return: t.expected_return, quantity: t.quantity, item_name: info(t).item.name, size: info(t).size, customer_name: info(t).cust.name, days_left: diffDays(t.expected_return, t0) })),
    inventory,
    predictions: predictions(txs, pays, inventory.items),
  };
  if (!ownerId) {
    result.ownerPerformance = db.users.filter((u) => u.role === 'owner').map((u) => {
      const mine = db.transactions.filter((t) => t.owner_id === u.id); const ids = new Set(mine.map((t) => t.id));
      return {
        id: u.id, shop: u.shop_name || u.name, revenue: sumBy(db.payments.filter((p) => ids.has(p.transaction_id) && inRange(dayOf(p.paid_at), from, to)), (p) => p.amount),
        transactions: mine.filter((t) => CONF.includes(t.status) && inRange(dayOf(t.created_at), from, to)).length, items: db.items.filter((i) => i.owner_id === u.id && !i.archived_at).length, overdue: mine.filter(isOverdue).length,
      };
    }).sort((a, b) => b.revenue - a.revenue);
    result.renterActivity = db.users.filter((u) => u.role === 'renter').map((u) => {
      const ts = db.transactions.filter((t) => find('customers', t.customer_id)?.user_id === u.id && CONF.includes(t.status) && inRange(dayOf(t.created_at), from, to));
      return { id: u.id, name: u.name, email: u.email, transactions: ts.length, value: round2(sumBy(ts, (t) => t.amount)), last_activity: ts.map((t) => t.created_at).sort().pop() ?? null };
    }).filter((r) => r.transactions).sort((a, b) => b.transactions - a.transactions).slice(0, 20);
  }
  return result;
}

export const analyticsRoute = ['GET', '/analytics', [requireRole('admin', 'owner')], ({ user, query: q }) => buildAnalytics(user.role === 'owner' ? user.id : null, parse(query, q))];
