import { getDemoUser } from './session.js';

const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const revenueByMonth = months.map((month, i) => ({ month, revenue: [8400, 9200, 7800, 11400, 12700, 11900, 14600, 13800, 15900, 17100, 16300, 18400][i] }));
const statusBreakdown = [
  { status: 'pending', type: 'rental', count: 3 },
  { status: 'pending', type: 'purchase', count: 1 },
  { status: 'approved', type: 'rental', count: 4 },
  { status: 'active', type: 'rental', count: 6 },
  { status: 'completed', type: 'rental', count: 12 },
  { status: 'completed', type: 'purchase', count: 5 },
];

const recentTransactions = [
  { id: 21, customer_name: 'Ana Reyes', item_name: 'Emerald Evening Gown', size: 'M', type: 'rental', created_at: '2026-11-12 10:30:00', amount: 3600, display_status: 'approved' },
  { id: 20, customer_name: 'Luis Garcia', item_name: 'Classic Black Tuxedo', size: 'L', type: 'rental', created_at: '2026-11-10 14:15:00', amount: 3000, display_status: 'active' },
  { id: 19, customer_name: 'Carla Mendoza', item_name: 'Pearl Necklace Set', size: 'One Size', type: 'purchase', created_at: '2026-11-08 09:00:00', amount: 2200, display_status: 'completed' },
];

function dashboard(role) {
  if (role === 'admin') {
    return {
      stats: { revenue: 84250, pending_requests: 4, overdue: 2, staff: 3, renters: 18, items: 26, active_rentals: 6, completed_rentals: 24, purchases: 7 },
      recentUsers: [
        { id: 18, name: 'Ana Reyes', role: 'renter', status: 'active', created_at: '2026-11-13 09:00:00' },
        { id: 17, name: 'Rico Valdez', role: 'staff', status: 'active', created_at: '2026-11-10 11:30:00' },
        { id: 16, name: 'Maria Santos', role: 'owner', status: 'active', created_at: '2026-10-28 15:20:00' },
      ],
      activity: [
        { id: 3, description: 'Approved a rental request', target_name: 'Ana Reyes', created_at: '2026-11-12 10:30:00' },
        { id: 2, description: 'Added an inventory item', target_name: 'Emerald Evening Gown', created_at: '2026-11-11 13:15:00' },
        { id: 1, description: 'Created a staff account', target_name: 'Rico Valdez', created_at: '2026-11-10 11:30:00' },
      ],
      revenueByMonth,
      statusBreakdown,
    };
  }

  if (role === 'renter') {
    return {
      stats: { total_spending: 12600, active_rentals: 1, pending_requests: 1, rented_items: 3, purchased_items: 1, overdue: 0, completed_rentals: 2 },
      recentTransactions: recentTransactions.filter((tx) => tx.customer_name === 'Ana Reyes'),
      upcomingReturns: [{ id: 21, item_name: 'Emerald Evening Gown', size: 'M', expected_return: '2026-11-20', level: 'upcoming', days_left: 6 }],
      spendByMonth: months.slice(-6).map((month, i) => ({ month, spent: [1200, 0, 2200, 1800, 3000, 3600][i] })),
    };
  }

  return {
    stats: { revenue: 48250, pending_requests: 3, overdue: 1, total_units: 64, available_units: 47, rented_units: 9, reserved_units: 8, pending_return_units: 2, customers: 18, items: 26, rental_transactions: 31, purchase_transactions: 7 },
    recentTransactions,
    upcomingReturns: [{ id: 20, customer_name: 'Luis Garcia', item_name: 'Classic Black Tuxedo', size: 'L', expected_return: '2026-11-18' }],
    lowStock: [
      { name: 'Emerald Evening Gown', size: 'S', available: 1, total: 4 },
      { name: 'Classic Black Tuxedo', size: 'M', available: 0, total: 3 },
    ],
    revenueByMonth,
    statusBreakdown,
  };
}

export async function demoRequest(method, path) {
  if (method === 'GET' && path === '/stats/dashboard') {
    const user = getDemoUser();
    if (!user) throw new Error('Select a demo role to continue.');
    return dashboard(user.role);
  }
  if (method === 'GET' && path === '/notifications') return { data: [], unread: 0 };
  if (method === 'GET' && path === '/cart/count') return { count: 0 };
  throw new Error('This screen or action is not available in the read-only showcase.');
}
