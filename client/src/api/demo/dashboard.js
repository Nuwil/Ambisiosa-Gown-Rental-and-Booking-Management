import { authenticate, mount } from './router.js';
import { getDb } from './store.js';
import { availableOf, find, isOverdue, scopeFor } from './model.js';
import { addDays, diffDays, monthOf, today } from './util.js';
import { monthKey, monthRange } from './forecast.js';
import { txRow } from './model.js';
import { analyticsRoute } from './analytics.js';

const sumOf = (rows, f = (r) => r.amount) => rows.reduce((n, r) => n + Number(f(r) ?? 0), 0);

/** Last 12 (or n) months of payments as [{month, [key]}]. */
export const monthlyPayments = (txFilter, key, n = 12) => {
  const db = getDb(); const months = monthRange(monthKey(new Date()), n);
  const ok = new Set(db.transactions.filter(txFilter).map((t) => t.id));
  const pays = db.payments.filter((p) => ok.has(p.transaction_id) && p.paid_at.slice(0, 10) >= `${months[0]}-01`);
  return months.map((m) => ({ month: m, [key]: sumOf(pays.filter((p) => monthOf(p.paid_at) === m)) }));
};
const breakdown = (txs) => {
  const m = new Map();
  txs.forEach((t) => { const k = `${t.type}|${t.status}`; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m].map(([k, count]) => ({ type: k.split('|')[0], status: k.split('|')[1], count }));
};
const listRow = (t) => {
  const r = txRow(t);
  return { id: r.id, type: r.type, status: r.status, amount: r.amount, created_at: r.created_at, expected_return: r.expected_return, start_date: r.start_date, quantity: r.quantity, customer_name: r.customer_name, item_name: r.item_name, size: r.size, is_overdue: r.is_overdue, display_status: r.display_status };
};
const newest = (a, b) => b.id - a.id;

function adminDashboard() {
  const db = getDb(); const rentals = db.transactions.filter((t) => t.type === 'rental');
  const count = (role) => db.users.filter((u) => u.role === role).length;
  const nm = (id) => db.users.find((u) => u.id === id)?.name ?? null;
  return {
    stats: {
      owners: count('owner'), staff: count('staff'), renters: count('renter'), items: db.items.filter((i) => !i.archived_at).length,
      active_rentals: rentals.filter((t) => t.status === 'active').length, completed_rentals: rentals.filter((t) => t.status === 'completed').length,
      purchases: db.transactions.filter((t) => t.type === 'purchase' && t.status === 'completed').length, revenue: sumOf(db.payments),
      pending_requests: rentals.filter((t) => t.status === 'pending').length, overdue: rentals.filter(isOverdue).length,
    },
    recentUsers: [...db.users].sort(newest).slice(0, 6).map(({ id, name, email, role, status, created_at }) => ({ id, name, email, role, status, created_at })),
    activity: [...db.logs].sort(newest).slice(0, 12).map((l) => ({ id: l.id, action: l.action, description: l.description, created_at: l.created_at, actor_name: nm(l.actor_id), target_name: nm(l.target_user_id) })),
    revenueByMonth: monthlyPayments(() => true, 'revenue'), statusBreakdown: breakdown(db.transactions),
  };
}

function ownerDashboard(ownerId) {
  const db = getDb(); const t0 = today();
  const txs = db.transactions.filter((t) => t.owner_id === ownerId); const rentals = txs.filter((t) => t.type === 'rental');
  const ids = new Set(txs.map((t) => t.id));
  const liveItems = db.items.filter((i) => i.owner_id === ownerId && !i.archived_at);
  const variants = db.variants.filter((v) => liveItems.some((i) => i.id === v.item_id));
  const units = (rows) => sumOf(rows, (t) => t.quantity);
  return {
    stats: {
      customers: db.customers.filter((c) => c.owner_id === ownerId).length, items: liveItems.length,
      rented_units: units(rentals.filter((t) => t.status === 'active')), reserved_units: units(txs.filter((t) => t.status === 'approved')),
      pending_return_units: units(rentals.filter((t) => t.status === 'active' && t.expected_return >= t0 && t.expected_return <= addDays(t0, 3))),
      overdue: rentals.filter(isOverdue).length, rental_transactions: rentals.filter((t) => ['approved', 'active', 'completed'].includes(t.status)).length,
      purchase_transactions: txs.filter((t) => t.type === 'purchase' && ['approved', 'completed'].includes(t.status)).length,
      revenue: sumOf(db.payments.filter((p) => ids.has(p.transaction_id)), (p) => p.amount), pending_requests: txs.filter((t) => t.status === 'pending').length,
      total_units: sumOf(variants, (v) => v.total_quantity), available_units: sumOf(variants, (v) => availableOf(v, t0, t0)),
    },
    recentTransactions: [...txs].sort(newest).slice(0, 8).map(listRow),
    upcomingReturns: rentals.filter((t) => t.status === 'active' && t.expected_return >= t0 && t.expected_return <= addDays(t0, 7)).sort((a, b) => a.expected_return.localeCompare(b.expected_return)).slice(0, 10).map(listRow),
    lowStock: variants.map((v) => ({ v, item: find('items', v.item_id), available: availableOf(v, t0, t0) })).filter((x) => x.item.is_published && x.available <= 1)
      .sort((a, b) => a.available - b.available || a.item.name.localeCompare(b.item.name)).slice(0, 10).map((x) => ({ item_id: x.item.id, name: x.item.name, size: x.v.size, available: x.available, total: x.v.total_quantity })),
    revenueByMonth: monthlyPayments((t) => t.owner_id === ownerId, 'revenue'), statusBreakdown: breakdown(txs),
  };
}

function renterDashboard(userId) {
  const db = getDb();
  const txs = db.transactions.filter(scopeFor({ role: 'renter', id: userId }));
  const rentals = txs.filter((t) => t.type === 'rental'); const ids = new Set(txs.map((t) => t.id));
  const units = (rows) => sumOf(rows, (t) => t.quantity);
  const upcoming = rentals.filter((t) => t.status === 'active').sort((a, b) => a.expected_return.localeCompare(b.expected_return)).slice(0, 10).map((t) => {
    const r = txRow(t); const days_left = diffDays(t.expected_return, today());
    return { id: t.id, expected_return: t.expected_return, item_name: r.item_name, size: r.size, days_left, level: days_left < 0 ? 'overdue' : days_left <= 2 ? 'due_soon' : 'upcoming' };
  });
  return {
    stats: {
      rented_items: units(rentals.filter((t) => ['approved', 'active', 'completed'].includes(t.status))), purchased_items: units(txs.filter((t) => t.type === 'purchase' && t.status === 'completed')),
      active_rentals: rentals.filter((t) => t.status === 'active').length, pending_requests: txs.filter((t) => t.status === 'pending').length, overdue: rentals.filter(isOverdue).length,
      completed_rentals: rentals.filter((t) => t.status === 'completed').length, total_spending: sumOf(db.payments.filter((p) => ids.has(p.transaction_id)), (p) => p.amount),
    },
    recentTransactions: [...txs].sort(newest).slice(0, 6).map(listRow), upcomingReturns: upcoming,
    spendByMonth: monthlyPayments((t) => ids.has(t.id), 'spent', 6),
  };
}

export const routes = mount('/stats', [authenticate], [
  ['GET', '/dashboard', [], ({ user }) => (user.role === 'admin' ? adminDashboard() : user.isShop ? ownerDashboard(user.shopId) : renterDashboard(user.id))],
  analyticsRoute,
]);
