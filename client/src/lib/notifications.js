/** Notification helpers shared by the bell dropdown and the full notifications page. */

// type -> [group, unused, title]. Groups drive the filter tabs and the "sender" column.
const TYPES = {
  REQUEST_SUBMITTED: ['requests', 'New request', 'New request received'],
  REQUEST_APPROVED: ['requests', 'Approved', 'Request approved'],
  REQUEST_REJECTED: ['requests', 'Rejected', 'Request rejected'],
  REQUEST_CANCELLED: ['requests', 'Cancelled', 'Request cancelled'],
  ITEM_RELEASED: ['rentals', 'Released', 'Item released'],
  ITEM_RETURNED: ['rentals', 'Returned', 'Item returned'],
  PURCHASE_COMPLETED: ['rentals', 'Purchase', 'Purchase completed'],
  RETURN_DUE_SOON: ['reminders', 'Due soon', 'Return due soon'],
  RENTAL_OVERDUE: ['reminders', 'Overdue', 'Rental overdue'],
};

export const NOTIFICATION_GROUPS = [['requests', 'Requests'], ['rentals', 'Rentals'], ['reminders', 'Reminders']];

export function describeNotification(n) {
  const [group, , title] = TYPES[n.type] ?? ['other', '', 'Update'];
  const label = NOTIFICATION_GROUPS.find(([k]) => k === group)?.[1] ?? 'Update';
  return { group, label, title, urgent: n.type === 'RENTAL_OVERDUE' };
}

const BASE = { admin: '/admin', owner: '/owner', staff: '/owner', renter: '/renter' };
export const notificationsPath = (role) => (BASE[role] ? `${BASE[role]}/notifications` : null);

/** Where a notification should take the user. ref_id is always a transaction id (request, reminder or status change). */
export function notificationTarget(n, role) {
  const tx = n.ref_id ? `?tx=${n.ref_id}` : '';
  if (role === 'owner' || role === 'staff') return n.ref_id ? `/owner/transactions${tx}` : '/owner/dashboard';
  if (role === 'renter') return `/renter/dashboard${tx}`;
  if (role === 'admin') return '/admin/dashboard';
  return null;
}

// The bell badge lives in the layout; this keeps it in sync after changes made on the full page.
const EVENT = 'notifications:changed';
export const announceNotificationsChanged = () => window.dispatchEvent(new Event(EVENT));
export const onNotificationsChanged = (fn) => { window.addEventListener(EVENT, fn); return () => window.removeEventListener(EVENT, fn); };

/** Gmail-style stamp: time for today, "Nov 21" this year, full date otherwise. */
export function shortStamp(d) {
  const date = new Date(String(d).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString(undefined, date.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}
