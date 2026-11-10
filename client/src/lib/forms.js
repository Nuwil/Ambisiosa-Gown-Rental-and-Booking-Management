/** Maps API validation details ([{ field, message }]) to { field: message } for inline form errors. */
export const fieldErrors = (err) => {
  const out = {};
  (err?.details || []).forEach((d) => { if (d.field && !out[d.field]) out[d.field] = d.message; });
  return out;
};

export const DEFAULT_CATEGORY_NAMES = ['Gowns', 'Suits', 'Costumes', 'Traditional Wear', 'Accessories', 'Other'];
export const CONDITIONS = [['new', 'New'], ['good', 'Good'], ['fair', 'Fair'], ['needs_repair', 'Needs repair']];

/** Reads/writes a small UI preference without ever throwing (storage can be blocked). */
export const pref = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

/** Staff access areas (mirrors server/src/utils/permissions.js). The owner always has all of them. */
export const ACCESS_AREAS = [
  { key: 'inventory', label: 'Inventory', hint: 'Add and edit items, sizes, stock and photos' },
  { key: 'customers', label: 'Customers', hint: 'View, register and edit customers and renter accounts' },
  { key: 'transactions', label: 'Transactions', hint: 'Approve requests, release/return items, record payments' },
];
export const ACCESS_PRESETS = [
  { key: 'full', label: 'Full access', perms: ['inventory', 'customers', 'transactions'] },
  { key: 'front', label: 'Front desk', perms: ['customers', 'transactions'] },
  { key: 'stock', label: 'Inventory clerk', perms: ['inventory'] },
  { key: 'view', label: 'No access (paused)', perms: [] },
];
export const presetFor = (perms = []) => ACCESS_PRESETS.find((p) => p.perms.length === perms.length && p.perms.every((x) => perms.includes(x)))?.label || 'Custom';
