import { pool } from '../config/db.js';

/** Record an activity log entry. Never throws (logging must not break requests). */
export async function logActivity({ actorId = null, targetUserId = null, action, description }, conn = pool) {
  try {
    await conn.execute(
      'INSERT INTO activity_logs (actor_id, target_user_id, action, description) VALUES (?,?,?,?)',
      [actorId, targetUserId, action, String(description).slice(0, 255)]
    );
  } catch (e) {
    console.error('audit log failed', e.message);
  }
}

/** Notifies the owner and every active staff member of that owner's shop. */
export async function notifyShop(ownerId, type, message, refId = null, conn = pool) {
  try {
    const [rows] = await conn.execute("SELECT id FROM users WHERE id = ? OR (owner_id = ? AND role = 'staff' AND status = 'active')", [ownerId, ownerId]);
    for (const r of rows) await notify(r.id, type, message, refId, conn);
  } catch (e) {
    console.error('notifyShop failed', e.message);
  }
}

export async function notify(userId, type, message, refId = null, conn = pool) {
  try {
    await conn.execute(
      'INSERT INTO notifications (user_id, type, message, ref_id) VALUES (?,?,?,?)',
      [userId, type, String(message).slice(0, 255), refId]
    );
  } catch (e) {
    console.error('notify failed', e.message);
  }
}
