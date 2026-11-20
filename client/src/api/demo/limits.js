/**
 * Restrictions for the demo accounts. Every role still sees and opens every feature, but seeded (core) data is
 * read-only: edits, deletes and workflow actions only work on records created during the current session, and
 * creating is capped. State lives in `db.demo`, so it resets with the rest of the demo data.
 */
import { getDb } from './store.js';
import { forbidden, HttpError } from './util.js';

// [method, path, usage key, label, max new records per session]
const QUOTAS = [
  ['POST', '/inventory/manage/items', 'items', 'items', 10],
  ['POST', '/inventory/manage/categories', 'categories', 'categories', 5],
  ['POST', '/customers', 'customers', 'customers', 10],
  ['POST', '/transactions/request', 'transactions', 'transactions', 10],
  ['POST', '/transactions/manual', 'transactions', 'transactions', 10],
  ['POST', '/cart', 'cart', 'cart items', 15],
  ['POST', '/staff', 'staff', 'staff accounts', 3],
  ['POST', '/admin/users', 'users', 'user accounts', 5],
  ['POST', '/admin/backups', 'backups', 'backups', 3],
].map(([method, path, key, label, max]) => ({ method, re: new RegExp(`^${path}/?$`), key, label, max }));

// Any non-GET request on /<resource>/:id[/...] changes that record (edit, delete, restore, action, payment, reset...).
const RECORD = /^\/(inventory\/manage\/items|inventory\/manage\/categories|customers|transactions|staff|admin\/users|admin\/backups)\/(\d+)(\/.*)?$/;
const TABLE = { 'inventory/manage/items': 'items', 'inventory/manage/categories': 'categories', customers: 'customers', transactions: 'transactions', staff: 'users', 'admin/users': 'users', 'admin/backups': 'backups' };

const BLOCKED = [
  ['PUT', /^\/auth\/password\/?$/, 'Password changes are disabled for demo accounts.'],
  ['POST', /^\/admin\/backups\/\d+\/restore\/?$/, 'Restoring backups is disabled in the demo.'],
];

// `seedSeq` = id counters right after seeding; any record with a higher id was created in this session.
const state = () => (getDb().demo ??= { usage: {}, seedSeq: { ...getDb().seq } });
const isSeeded = (table, id) => Number(id) <= (state().seedSeq[table] ?? 0);

/** Runs before the handler; throws the same HttpError shape as any other failure. */
export function checkLimits(method, path) {
  if (method === 'GET') return;
  for (const [m, re, msg] of BLOCKED) if (m === method && re.test(path)) throw forbidden(msg);
  const rec = RECORD.exec(path);
  if (rec && isSeeded(TABLE[rec[1]], rec[2])) throw forbidden('Demo mode is read-only for existing data. Create a new record to try this action, or reset the demo.');
  const q = method === 'POST' && QUOTAS.find((r) => r.re.test(path));
  if (q && (state().usage[q.key] ?? 0) >= q.max) throw new HttpError(429, `Demo limit reached: up to ${q.max} new ${q.label} per session. Use "Reset demo data" to start over.`);
}

/** Runs after a successful request: counts the new record against its quota. */
export function recordUsage(method, path) {
  const q = method === 'POST' && QUOTAS.find((r) => r.re.test(path));
  if (q) state().usage[q.key] = (state().usage[q.key] ?? 0) + 1;
}
