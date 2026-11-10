import { q } from '../../config/db.js';

/**
 * Availability is DERIVED, never stored: total_quantity minus overlapping reservations.
 *  - approved/active rentals overlapping [start, end] reserve stock
 *  - an active rental already past its return date keeps reserving until it is returned
 *  - approved (not yet finalized) purchases reserve stock regardless of dates
 * Finalized purchases permanently reduce total_quantity (see transactions/service.js).
 */
export const RESERVED_SUBQUERY = `
  COALESCE((
    SELECT SUM(t.quantity) FROM transactions t
    WHERE t.variant_id = v.id AND (
      (t.type = 'rental' AND t.status IN ('approved','active')
        AND t.start_date <= ?
        AND (CASE WHEN t.status = 'active' THEN GREATEST(t.expected_return, CURDATE()) ELSE t.expected_return END) >= ?)
      OR (t.type = 'purchase' AND t.status = 'approved')
    )
  ), 0)`;

export const today = () => new Date().toISOString().slice(0, 10);

/** Returns variants (with `reserved` and `available`) for the given item ids over [start, end]. */
export async function variantsWithAvailability(itemIds, start = today(), end = start, conn) {
  if (!itemIds.length) return [];
  const ph = itemIds.map(() => '?').join(',');
  const rows = await q(
    `SELECT v.id, v.item_id, v.size, v.total_quantity, ${RESERVED_SUBQUERY} AS reserved
     FROM item_variants v WHERE v.item_id IN (${ph}) ORDER BY v.id`,
    [end, start, ...itemIds],
    conn
  );
  return rows.map((r) => ({ ...r, reserved: Number(r.reserved), available: Math.max(0, r.total_quantity - Number(r.reserved)) }));
}

/**
 * Authoritative check used inside a transaction. Locks the variant row so concurrent
 * approvals serialise. Optionally ignore one transaction (the one being approved).
 */
export async function lockedAvailable(conn, variantId, start, end, ignoreTxId = 0) {
  const [[variant]] = await conn.execute('SELECT id, total_quantity FROM item_variants WHERE id = ? FOR UPDATE', [variantId]);
  if (!variant) return null;
  const [[{ reserved }]] = await conn.execute(
    `SELECT COALESCE(SUM(t.quantity),0) AS reserved FROM transactions t
     WHERE t.variant_id = ? AND t.id <> ? AND (
       (t.type='rental' AND t.status IN ('approved','active') AND t.start_date <= ?
         AND (CASE WHEN t.status='active' THEN GREATEST(t.expected_return, CURDATE()) ELSE t.expected_return END) >= ?)
       OR (t.type='purchase' AND t.status='approved'))`,
    [variantId, ignoreTxId, end, start]
  );
  return { total: variant.total_quantity, reserved: Number(reserved), available: variant.total_quantity - Number(reserved) };
}
