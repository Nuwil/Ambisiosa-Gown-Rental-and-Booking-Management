import { q, q1 } from '../../config/db.js';
import { RESERVED_SUBQUERY, today } from '../inventory/availability.js';
import { monthRange, monthKey } from '../../utils/forecast.js';

const n = (v) => Number(v ?? 0);
const monthlyRevenue = async (ownerId) => {
  const months = monthRange(monthKey(new Date()), 12);
  const oc = ownerId ? 'AND t.owner_id = ?' : '';
  const rows = await q(
    `SELECT DATE_FORMAT(p.paid_at,'%Y-%m') AS m, SUM(p.amount) AS v FROM payments p JOIN transactions t ON t.id = p.transaction_id
     WHERE p.paid_at >= ? ${oc} GROUP BY m`, [`${months[0]}-01`, ...(ownerId ? [ownerId] : [])]);
  return months.map((m) => ({ month: m, revenue: n(rows.find((r) => r.m === m)?.v) }));
};

const statusBreakdown = (where, params) =>
  q(`SELECT t.type, t.status, COUNT(*) AS count FROM transactions t WHERE ${where} GROUP BY t.type, t.status`, params);

const TX_LIST = `
  SELECT t.id, t.type, t.status, t.amount, t.created_at, t.expected_return, t.start_date, t.quantity,
    c.name AS customer_name, i.name AS item_name, v.size,
    (t.type='rental' AND t.status='active' AND t.expected_return < CURDATE()) AS is_overdue
  FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id`;
const withDisplay = (r) => ({ ...r, is_overdue: !!r.is_overdue, display_status: r.is_overdue ? 'overdue' : r.status });

export async function adminDashboard() {
  const [c, recentUsers, activity, rev, breakdown] = await Promise.all([
    q1(`SELECT
      (SELECT COUNT(*) FROM users WHERE role='owner') AS owners,
      (SELECT COUNT(*) FROM users WHERE role='staff') AS staff,
      (SELECT COUNT(*) FROM users WHERE role='renter') AS renters,
      (SELECT COUNT(*) FROM items WHERE archived_at IS NULL) AS items,
      (SELECT COUNT(*) FROM transactions WHERE type='rental' AND status='active') AS active_rentals,
      (SELECT COUNT(*) FROM transactions WHERE type='rental' AND status='completed') AS completed_rentals,
      (SELECT COUNT(*) FROM transactions WHERE type='purchase' AND status='completed') AS purchases,
      (SELECT COALESCE(SUM(amount),0) FROM payments) AS revenue,
      (SELECT COUNT(*) FROM transactions WHERE type='rental' AND status='pending') AS pending_requests,
      (SELECT COUNT(*) FROM transactions WHERE type='rental' AND status='active' AND expected_return < CURDATE()) AS overdue`),
    q('SELECT id, name, email, role, status, created_at FROM users ORDER BY id DESC LIMIT 6'),
    q(`SELECT l.id, l.action, l.description, l.created_at, a.name AS actor_name, tu.name AS target_name
       FROM activity_logs l LEFT JOIN users a ON a.id = l.actor_id LEFT JOIN users tu ON tu.id = l.target_user_id
       ORDER BY l.id DESC LIMIT 12`),
    monthlyRevenue(null),
    statusBreakdown('1=1', []),
  ]);
  return {
    stats: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, n(v)])),
    recentUsers, activity, revenueByMonth: rev, statusBreakdown: breakdown,
  };
}

export async function ownerDashboard(ownerId) {
  const t = today();
  const [c, inv, recent, upcoming, lowStock, rev, breakdown] = await Promise.all([
    q1(`SELECT
      (SELECT COUNT(*) FROM customers WHERE owner_id = ?) AS customers,
      (SELECT COUNT(*) FROM items WHERE owner_id = ? AND archived_at IS NULL) AS items,
      (SELECT COALESCE(SUM(t.quantity),0) FROM transactions t WHERE t.owner_id = ? AND t.type='rental' AND t.status='active') AS rented_units,
      (SELECT COALESCE(SUM(t.quantity),0) FROM transactions t WHERE t.owner_id = ? AND t.status='approved') AS reserved_units,
      (SELECT COALESCE(SUM(t.quantity),0) FROM transactions t WHERE t.owner_id = ? AND t.type='rental' AND t.status='active' AND t.expected_return BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)) AS pending_return_units,
      (SELECT COUNT(*) FROM transactions t WHERE t.owner_id = ? AND t.type='rental' AND t.status='active' AND t.expected_return < CURDATE()) AS overdue,
      (SELECT COUNT(*) FROM transactions t WHERE t.owner_id = ? AND t.type='rental' AND t.status IN ('approved','active','completed')) AS rental_transactions,
      (SELECT COUNT(*) FROM transactions t WHERE t.owner_id = ? AND t.type='purchase' AND t.status IN ('approved','completed')) AS purchase_transactions,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN transactions t ON t.id=p.transaction_id WHERE t.owner_id = ?) AS revenue,
      (SELECT COUNT(*) FROM transactions t WHERE t.owner_id = ? AND t.status='pending') AS pending_requests`,
      Array(10).fill(ownerId)),
    q1(`SELECT COALESCE(SUM(x.total),0) AS total_units, COALESCE(SUM(GREATEST(x.total - x.reserved,0)),0) AS available_units
        FROM (SELECT v.total_quantity AS total, ${RESERVED_SUBQUERY} AS reserved FROM item_variants v JOIN items i ON i.id=v.item_id
              WHERE i.archived_at IS NULL AND i.owner_id = ?) x`, [t, t, ownerId]),
    q(`${TX_LIST} WHERE t.owner_id = ? ORDER BY t.id DESC LIMIT 8`, [ownerId]),
    q(`${TX_LIST} WHERE t.owner_id = ? AND t.type='rental' AND t.status='active' AND t.expected_return BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) ORDER BY t.expected_return LIMIT 10`, [ownerId]),
    q(`SELECT i.id AS item_id, i.name, x.size, x.available, x.total FROM (
         SELECT v.id, v.item_id, v.size, v.total_quantity AS total, GREATEST(v.total_quantity - ${RESERVED_SUBQUERY},0) AS available FROM item_variants v) x
       JOIN items i ON i.id = x.item_id WHERE i.owner_id = ? AND i.archived_at IS NULL AND i.is_published = 1 AND x.available <= 1 ORDER BY x.available, i.name LIMIT 10`, [t, t, ownerId]),
    monthlyRevenue(ownerId),
    statusBreakdown('t.owner_id = ?', [ownerId]),
  ]);
  const stats = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, n(v)]));
  return {
    stats: { ...stats, total_units: n(inv.total_units), available_units: n(inv.available_units) },
    recentTransactions: recent.map(withDisplay), upcomingReturns: upcoming.map(withDisplay),
    lowStock: lowStock.map((r) => ({ ...r, available: n(r.available), total: n(r.total) })),
    revenueByMonth: rev, statusBreakdown: breakdown,
  };
}

export async function renterDashboard(userId) {
  const base = 'FROM transactions t JOIN customers c ON c.id = t.customer_id WHERE c.user_id = ?';
  const [c, recent, upcoming, spendByMonth] = await Promise.all([
    q1(`SELECT
      (SELECT COALESCE(SUM(t.quantity),0) ${base} AND t.type='rental' AND t.status IN ('approved','active','completed')) AS rented_items,
      (SELECT COALESCE(SUM(t.quantity),0) ${base} AND t.type='purchase' AND t.status='completed') AS purchased_items,
      (SELECT COUNT(*) ${base} AND t.type='rental' AND t.status='active') AS active_rentals,
      (SELECT COUNT(*) ${base} AND t.status='pending') AS pending_requests,
      (SELECT COUNT(*) ${base} AND t.type='rental' AND t.status='active' AND t.expected_return < CURDATE()) AS overdue,
      (SELECT COUNT(*) ${base} AND t.type='rental' AND t.status='completed') AS completed_rentals,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN transactions t ON t.id=p.transaction_id JOIN customers c ON c.id=t.customer_id WHERE c.user_id = ?) AS total_spending`,
      Array(7).fill(userId)),
    q(`${TX_LIST} WHERE c.user_id = ? ORDER BY t.id DESC LIMIT 6`, [userId]),
    q(`SELECT t.id, t.expected_return, i.name AS item_name, v.size, DATEDIFF(t.expected_return, CURDATE()) AS days_left
       FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id
       WHERE c.user_id = ? AND t.type='rental' AND t.status='active' ORDER BY t.expected_return LIMIT 10`, [userId]),
    (async () => {
      const months = monthRange(monthKey(new Date()), 6);
      const rows = await q(`SELECT DATE_FORMAT(p.paid_at,'%Y-%m') AS m, SUM(p.amount) AS v FROM payments p JOIN transactions t ON t.id=p.transaction_id JOIN customers c ON c.id=t.customer_id WHERE c.user_id = ? AND p.paid_at >= ? GROUP BY m`, [userId, `${months[0]}-01`]);
      return months.map((m) => ({ month: m, spent: n(rows.find((r) => r.m === m)?.v) }));
    })(),
  ]);
  const reminders = upcoming.map((u) => ({
    ...u, days_left: n(u.days_left),
    level: n(u.days_left) < 0 ? 'overdue' : n(u.days_left) <= 2 ? 'due_soon' : 'upcoming',
  }));
  return {
    stats: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, n(v)])),
    recentTransactions: recent.map(withDisplay), upcomingReturns: reminders, spendByMonth,
  };
}
