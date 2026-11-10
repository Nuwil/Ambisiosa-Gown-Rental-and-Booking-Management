import cron from 'node-cron';
import { q } from '../config/db.js';
import { notify, notifyShop } from '../utils/audit.js';

/** Idempotent per day: one notification per (user, type, transaction, day). */
async function notifyOnce(userId, type, message, refId) {
  const dup = await q(
    'SELECT 1 AS x FROM notifications WHERE user_id = ? AND type = ? AND ref_id = ? AND DATE(created_at) = CURDATE() LIMIT 1',
    [userId, type, refId]);
  if (!dup.length) await notify(userId, type, message, refId);
}

/** Same, but for the whole shop team (owner + active staff). */
async function notifyShopOnce(ownerId, type, message, refId) {
  const team = await q("SELECT id FROM users WHERE id = ? OR (owner_id = ? AND role = 'staff' AND status = 'active')", [ownerId, ownerId]);
  for (const t of team) await notifyOnce(t.id, type, message, refId);
}

export async function runReminders() {
  const due = await q(
    `SELECT t.id, t.owner_id, t.expected_return, DATEDIFF(t.expected_return, CURDATE()) AS days_left,
       c.user_id AS renter_id, c.name AS customer_name, i.name AS item_name
     FROM transactions t JOIN customers c ON c.id = t.customer_id JOIN item_variants v ON v.id = t.variant_id JOIN items i ON i.id = v.item_id
     WHERE t.type = 'rental' AND t.status = 'active' AND t.expected_return <= DATE_ADD(CURDATE(), INTERVAL 2 DAY)`);
  for (const r of due) {
    const d = Number(r.days_left);
    if (d < 0) {
      const msg = `"${r.item_name}" is overdue by ${-d} day(s)`;
      if (r.renter_id) await notifyOnce(r.renter_id, 'RENTAL_OVERDUE', `Your rental: ${msg}. Please return it as soon as possible.`, r.id);
      await notifyShopOnce(r.owner_id, 'RENTAL_OVERDUE', `${r.customer_name}: ${msg}`, r.id);
    } else if (r.renter_id) {
      await notifyOnce(r.renter_id, 'RETURN_DUE_SOON', `"${r.item_name}" is due ${d === 0 ? 'today' : `in ${d} day(s)`} (${r.expected_return})`, r.id);
    }
  }
  return due.length;
}

export function startReminderJob() {
  runReminders().catch((e) => console.error('reminder run failed', e.message));
  cron.schedule('0 8 * * *', () => runReminders().catch((e) => console.error('reminder run failed', e.message)));
}
