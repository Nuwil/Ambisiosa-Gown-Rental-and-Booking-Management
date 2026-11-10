import { q, q1 } from '../../config/db.js';
import { RESERVED_SUBQUERY, today } from '../inventory/availability.js';
import { forecastMonthly, monthKey, monthRange } from '../../utils/forecast.js';
import { badRequest } from '../../utils/http.js';

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(new Date(s + 'T00:00:00Z').getTime() + n * DAY));

/** Resolve the ?range= preset (or custom from/to) into concrete dates and a bucket size. */
export function resolveRange({ range = 'monthly', from, to }) {
  const end = today();
  if (range === 'custom') {
    if (!from || !to) throw badRequest('Custom range requires from and to');
    if (from > to) throw badRequest('"from" must be before "to"');
    const days = (new Date(to) - new Date(from)) / DAY + 1;
    if (days > 3660) throw badRequest('Range too large (max 10 years)');
    const bucket = days <= 92 ? 'day' : days <= 730 ? 'month' : 'year';
    return { from, to, bucket, range };
  }
  const presets = {
    daily: { from: addDays(end, -29), bucket: 'day' },
    weekly: { from: addDays(end, -7 * 12 + 1), bucket: 'week' },
    monthly: { from: addDays(end, -365 + 1), bucket: 'month' },
    yearly: { from: addDays(end, -365 * 5 + 1), bucket: 'year' },
  };
  const p = presets[range];
  if (!p) throw badRequest('Invalid range');
  return { from: p.from, to: end, bucket: p.bucket, range };
}

const BUCKET_SQL = {
  day: (c) => `DATE_FORMAT(${c}, '%Y-%m-%d')`,
  week: (c) => `DATE_FORMAT(DATE_SUB(DATE(${c}), INTERVAL WEEKDAY(${c}) DAY), '%Y-%m-%d')`,
  month: (c) => `DATE_FORMAT(${c}, '%Y-%m')`,
  year: (c) => `DATE_FORMAT(${c}, '%Y')`,
};

function bucketKeys(from, to, bucket) {
  const keys = [];
  if (bucket === 'day' || bucket === 'week') {
    let cur = from;
    if (bucket === 'week') { const d = new Date(from + 'T00:00:00Z'); cur = addDays(from, -((d.getUTCDay() + 6) % 7)); }
    const step = bucket === 'day' ? 1 : 7;
    for (; cur <= to; cur = addDays(cur, step)) keys.push(cur);
  } else if (bucket === 'month') {
    const e = to.slice(0, 7);
    for (let k = from.slice(0, 7); k <= e; ) {
      keys.push(k);
      const [y, m] = k.split('-').map(Number);
      k = monthKey(new Date(Date.UTC(y, m, 1)));
    }
  } else {
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) keys.push(String(y));
  }
  return keys;
}

const fill = (keys, rows, fields) => keys.map((k) => {
  const r = rows.find((x) => x.bucket === k);
  return Object.fromEntries([['bucket', k], ...fields.map((f) => [f, Number(r?.[f] ?? 0)])]);
});

/**
 * Revenue = money actually recorded in `payments` (cash-basis). Demand counts use confirmed transactions
 * (approved/active/completed): rentals by start_date, purchases by request date.
 * `ownerId = null` → system-wide (admin).
 */
export async function buildAnalytics(ownerId, opts) {
  const { from, to, bucket } = resolveRange(opts);
  const oc = ownerId ? 'AND t.owner_id = ?' : '';
  const op = ownerId ? [ownerId] : [];
  const CONF = "t.status IN ('approved','active','completed')";
  const keys = bucketKeys(from, to, bucket);

  const [revRows, rentRows, buyRows, summary, topRented, topPurchased, categories, customers, overdueNow, lateReturns, upcoming, inventory] = await Promise.all([
    q(`SELECT ${BUCKET_SQL[bucket]('p.paid_at')} AS bucket,
         SUM(p.amount) AS total, SUM(CASE WHEN t.type='rental' THEN p.amount ELSE 0 END) AS rental,
         SUM(CASE WHEN t.type='purchase' THEN p.amount ELSE 0 END) AS purchase
       FROM payments p JOIN transactions t ON t.id = p.transaction_id
       WHERE DATE(p.paid_at) BETWEEN ? AND ? ${oc} GROUP BY bucket`, [from, to, ...op]),
    q(`SELECT ${BUCKET_SQL[bucket]('t.start_date')} AS bucket, COUNT(*) AS count FROM transactions t
       WHERE t.type='rental' AND ${CONF} AND t.start_date BETWEEN ? AND ? ${oc} GROUP BY bucket`, [from, to, ...op]),
    q(`SELECT ${BUCKET_SQL[bucket]('t.created_at')} AS bucket, COUNT(*) AS count FROM transactions t
       WHERE t.type='purchase' AND ${CONF} AND DATE(t.created_at) BETWEEN ? AND ? ${oc} GROUP BY bucket`, [from, to, ...op]),
    q1(`SELECT
         (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN transactions t ON t.id=p.transaction_id WHERE DATE(p.paid_at) BETWEEN ? AND ? ${oc}) AS revenue,
         (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN transactions t ON t.id=p.transaction_id WHERE t.type='rental' AND DATE(p.paid_at) BETWEEN ? AND ? ${oc}) AS rental_revenue,
         (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN transactions t ON t.id=p.transaction_id WHERE t.type='purchase' AND DATE(p.paid_at) BETWEEN ? AND ? ${oc}) AS purchase_revenue,
         (SELECT COUNT(*) FROM transactions t WHERE t.type='rental' AND ${CONF} AND t.start_date BETWEEN ? AND ? ${oc}) AS rental_count,
         (SELECT COUNT(*) FROM transactions t WHERE t.type='purchase' AND ${CONF} AND DATE(t.created_at) BETWEEN ? AND ? ${oc}) AS purchase_count,
         (SELECT COUNT(*) FROM transactions t WHERE t.status='pending' ${oc}) AS pending_requests,
         (SELECT COUNT(*) FROM transactions t WHERE t.status IN ('rejected','cancelled') AND DATE(t.created_at) BETWEEN ? AND ? ${oc}) AS declined_count`,
      [from, to, ...op, from, to, ...op, from, to, ...op, from, to, ...op, from, to, ...op, ...op, from, to, ...op]),
    q(`SELECT i.id, i.name, cat.name AS category, COUNT(*) AS transactions, SUM(t.quantity) AS units
       FROM transactions t JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id JOIN categories cat ON cat.id=i.category_id
       WHERE t.type='rental' AND ${CONF} AND t.start_date BETWEEN ? AND ? ${oc} GROUP BY i.id, i.name, cat.name ORDER BY units DESC, transactions DESC LIMIT 10`, [from, to, ...op]),
    q(`SELECT i.id, i.name, cat.name AS category, COUNT(*) AS transactions, SUM(t.quantity) AS units
       FROM transactions t JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id JOIN categories cat ON cat.id=i.category_id
       WHERE t.type='purchase' AND ${CONF} AND DATE(t.created_at) BETWEEN ? AND ? ${oc} GROUP BY i.id, i.name, cat.name ORDER BY units DESC, transactions DESC LIMIT 10`, [from, to, ...op]),
    q(`SELECT cat.name AS category, SUM(t.type='rental') AS rentals, SUM(t.type='purchase') AS purchases, COUNT(*) AS total
       FROM transactions t JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id JOIN categories cat ON cat.id=i.category_id
       WHERE ${CONF} AND DATE(t.created_at) BETWEEN ? AND ? ${oc} GROUP BY cat.name ORDER BY total DESC`, [from, to, ...op]),
    q1(`SELECT COUNT(DISTINCT t.customer_id) AS active_customers,
         COUNT(DISTINCT CASE WHEN rc.cnt >= 2 THEN t.customer_id END) AS repeat_customers
       FROM transactions t JOIN (SELECT customer_id, COUNT(*) AS cnt FROM transactions WHERE ${CONF.replaceAll('t.', '')} GROUP BY customer_id) rc ON rc.customer_id = t.customer_id
       WHERE ${CONF} AND DATE(t.created_at) BETWEEN ? AND ? ${oc}`, [from, to, ...op]),
    q1(`SELECT COUNT(*) AS count, COALESCE(AVG(DATEDIFF(CURDATE(), t.expected_return)),0) AS avg_days_overdue, COALESCE(SUM(t.quantity),0) AS units
        FROM transactions t WHERE t.type='rental' AND t.status='active' AND t.expected_return < CURDATE() ${oc}`, op),
    q1(`SELECT COUNT(*) AS returned, COALESCE(SUM(t.actual_return > t.expected_return),0) AS late
        FROM transactions t WHERE t.type='rental' AND t.status='completed' AND t.actual_return BETWEEN ? AND ? ${oc}`, [from, to, ...op]),
    q(`SELECT t.id, t.expected_return, t.quantity, i.name AS item_name, v.size, c.name AS customer_name,
         DATEDIFF(t.expected_return, CURDATE()) AS days_left
       FROM transactions t JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id JOIN customers c ON c.id=t.customer_id
       WHERE t.type='rental' AND t.status='active' AND t.expected_return BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY) ${oc}
       ORDER BY t.expected_return LIMIT 50`, op),
    inventoryStats(ownerId, from, to),
  ]);

  const totalRevenue = Number(summary.revenue);
  const repeatRate = customers.active_customers ? Number(customers.repeat_customers) / Number(customers.active_customers) : 0;

  const result = {
    range: { from, to, bucket, range: opts.range ?? 'monthly' },
    summary: {
      revenue: totalRevenue, rental_revenue: Number(summary.rental_revenue), purchase_revenue: Number(summary.purchase_revenue),
      rental_count: Number(summary.rental_count), purchase_count: Number(summary.purchase_count),
      pending_requests: Number(summary.pending_requests), declined_count: Number(summary.declined_count),
      avg_transaction_value: (Number(summary.rental_count) + Number(summary.purchase_count)) ? totalRevenue / (Number(summary.rental_count) + Number(summary.purchase_count)) : 0,
    },
    revenueSeries: fill(keys, revRows, ['total', 'rental', 'purchase']),
    rentalTrend: fill(keys, rentRows, ['count']).map((r, i) => ({ ...r, purchases: Number(buyRows.find((b) => b.bucket === r.bucket)?.count ?? 0), key: keys[i] })),
    topRented, topPurchased, categories,
    customers: { active: Number(customers.active_customers), repeat: Number(customers.repeat_customers), retention_rate: repeatRate },
    overdue: { current: Number(overdueNow.count), units: Number(overdueNow.units), avg_days_overdue: Math.round(Number(overdueNow.avg_days_overdue) * 10) / 10, returned_in_range: Number(lateReturns.returned), returned_late: Number(lateReturns.late) },
    upcomingReturns: upcoming,
    inventory,
    predictions: await buildPredictions(ownerId, inventory.items),
  };
  if (!ownerId) result.ownerPerformance = await ownerPerformance(from, to);
  if (!ownerId) result.renterActivity = await renterActivity(from, to);
  return result;
}

async function inventoryStats(ownerId, from, to) {
  const oc = ownerId ? 'AND i.owner_id = ?' : '';
  const op = ownerId ? [ownerId] : [];
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / DAY) + 1);
  const t = today();
  const [totals, items] = await Promise.all([
    q1(`SELECT COUNT(DISTINCT x.item_id) AS items, COALESCE(SUM(x.total),0) AS units, COALESCE(SUM(GREATEST(x.total - x.reserved,0)),0) AS available_now
        FROM (SELECT v.item_id, v.total_quantity AS total, ${RESERVED_SUBQUERY} AS reserved FROM item_variants v JOIN items i ON i.id=v.item_id WHERE i.archived_at IS NULL ${oc}) x`, [t, t, ...op]),
    // per-item utilisation = rented unit-days within range / (units × days in range)
    q(`SELECT i.id, i.name, cat.name AS category, SUM(v.total_quantity) AS units,
         COALESCE((SELECT SUM(t.quantity * (DATEDIFF(LEAST(COALESCE(t.actual_return, t.expected_return), CAST(? AS DATE)), GREATEST(t.start_date, CAST(? AS DATE))) + 1))
           FROM transactions t JOIN item_variants v2 ON v2.id = t.variant_id
           WHERE v2.item_id = i.id AND t.type='rental' AND t.status IN ('active','completed')
             AND t.start_date <= ? AND COALESCE(t.actual_return, t.expected_return) >= ?), 0) AS unit_days,
         (SELECT COUNT(*) FROM transactions t JOIN item_variants v3 ON v3.id=t.variant_id WHERE v3.item_id = i.id AND t.type='rental' AND t.status IN ('approved','active','completed') AND t.start_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)) AS rentals_90d
       FROM items i JOIN categories cat ON cat.id=i.category_id JOIN item_variants v ON v.item_id = i.id
       WHERE i.archived_at IS NULL ${oc} GROUP BY i.id, i.name, cat.name ORDER BY unit_days DESC LIMIT 200`, [to, from, to, from, ...op]),
  ]);
  const list = items.map((r) => ({
    id: r.id, name: r.name, category: r.category, units: Number(r.units), rentals_90d: Number(r.rentals_90d),
    utilization: Math.min(1, Number(r.unit_days) / (Number(r.units || 1) * days)),
  }));
  const avg = list.length ? list.reduce((a, b) => a + b.utilization, 0) / list.length : 0;
  return {
    items: list, total_items: Number(totals.items), total_units: Number(totals.units), available_now: Number(totals.available_now),
    average_utilization: avg,
  };
}

/** Predictions are always derived from ALL history (not just the selected range) and labelled as estimates. */
async function buildPredictions(ownerId, itemStats) {
  const oc = ownerId ? 'AND t.owner_id = ?' : '';
  const op = ownerId ? [ownerId] : [];
  const months = monthRange(monthKey(new Date()), 24);
  const start = `${months[0]}-01`;
  const [revRows, demandRows, catRows] = await Promise.all([
    q(`SELECT DATE_FORMAT(p.paid_at,'%Y-%m') AS m, SUM(p.amount) AS v FROM payments p JOIN transactions t ON t.id=p.transaction_id WHERE DATE(p.paid_at) >= ? ${oc} GROUP BY m`, [start, ...op]),
    q(`SELECT DATE_FORMAT(t.start_date,'%Y-%m') AS m, SUM(t.quantity) AS v FROM transactions t WHERE t.type='rental' AND t.status IN ('approved','active','completed') AND t.start_date >= ? ${oc} GROUP BY m`, [start, ...op]),
    q(`SELECT cat.name AS category, DATE_FORMAT(t.start_date,'%Y-%m') AS m, SUM(t.quantity) AS v
       FROM transactions t JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id JOIN categories cat ON cat.id=i.category_id
       WHERE t.type='rental' AND t.status IN ('approved','active','completed') AND t.start_date >= ? ${oc} GROUP BY cat.name, m`, [start, ...op]),
  ]);
  const series = (rows) => months.map((m) => ({ month: m, value: Number(rows.find((r) => r.m === m)?.v ?? 0) }));
  const catNames = [...new Set(catRows.map((r) => r.category))];

  const recommendations = (itemStats || [])
    .filter((i) => i.rentals_90d >= 3 && i.utilization >= 0.6)
    .map((i) => ({ item_id: i.id, name: i.name, category: i.category, units: i.units, utilization: i.utilization, rentals_90d: i.rentals_90d,
      suggestion: `High demand: ${i.rentals_90d} rentals in 90 days at ${(i.utilization * 100).toFixed(0)}% utilisation. Consider adding ${Math.max(1, Math.ceil(i.units * 0.25))} more unit(s).` }))
    .slice(0, 10);

  return {
    disclaimer: 'Estimates derived from your recorded history. They are not actual figures.',
    revenue: forecastMonthly(series(revRows), 3),
    rentalDemand: forecastMonthly(series(demandRows), 3),
    categoryDemand: catNames.map((name) => ({ category: name, ...forecastMonthly(series(catRows.filter((r) => r.category === name)), 3) })),
    frequentlyRented: (itemStats || []).filter((i) => i.rentals_90d > 0).sort((a, b) => b.rentals_90d - a.rentals_90d).slice(0, 5),
    replenishment: recommendations,
  };
}

const ownerPerformance = (from, to) => q(
  `SELECT u.id, COALESCE(u.shop_name, u.name) AS shop,
     COALESCE((SELECT SUM(p.amount) FROM payments p JOIN transactions t ON t.id=p.transaction_id WHERE t.owner_id=u.id AND DATE(p.paid_at) BETWEEN ? AND ?),0) AS revenue,
     (SELECT COUNT(*) FROM transactions t WHERE t.owner_id=u.id AND t.status IN ('approved','active','completed') AND DATE(t.created_at) BETWEEN ? AND ?) AS transactions,
     (SELECT COUNT(*) FROM items i WHERE i.owner_id=u.id AND i.archived_at IS NULL) AS items,
     (SELECT COUNT(*) FROM transactions t WHERE t.owner_id=u.id AND t.status='active' AND t.expected_return < CURDATE()) AS overdue
   FROM users u WHERE u.role='owner' ORDER BY revenue DESC LIMIT 50`, [from, to, from, to]);

const renterActivity = (from, to) => q(
  `SELECT u.id, u.name, u.email, COUNT(t.id) AS transactions, COALESCE(SUM(t.amount),0) AS value, MAX(t.created_at) AS last_activity
   FROM users u JOIN customers c ON c.user_id = u.id JOIN transactions t ON t.customer_id = c.id
   WHERE u.role='renter' AND t.status IN ('approved','active','completed') AND DATE(t.created_at) BETWEEN ? AND ?
   GROUP BY u.id, u.name, u.email ORDER BY transactions DESC LIMIT 20`, [from, to]);
