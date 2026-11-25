const DAY = 86400000;
const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole days from today (local) until a YYYY-MM-DD date; negative when past. */
export const daysUntil = (iso) => Math.round((Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) - Date.parse(`${localISO()}T00:00:00Z`)) / DAY);

export const DUE_SOON_DAYS = 2;

/**
 * Due-date state for a rental that is out with the renter. Returns null when nothing needs attention.
 * tone: 'red' = overdue, 'amber' = due within DUE_SOON_DAYS.
 */
export function dueInfo(t) {
  if (t.type !== 'rental' || !t.expected_return || !['active', 'overdue'].includes(t.display_status ?? t.status)) return null;
  const days = daysUntil(t.expected_return);
  if (t.display_status === 'overdue' || days < 0) return { tone: 'red', level: 'overdue', label: days < 0 ? `Overdue ${-days}d` : 'Overdue', days };
  if (days === 0) return { tone: 'amber', level: 'soon', label: 'Due today', days };
  if (days <= DUE_SOON_DAYS) return { tone: 'amber', level: 'soon', label: days === 1 ? 'Due tomorrow' : `Due in ${days}d`, days };
  return null;
}
