/**
 * In-memory "database" for the demo backend. State lives in module memory and is mirrored to sessionStorage
 * (best effort) so a page refresh keeps the signed-in user and any edits; closing the tab discards everything.
 */
import { seedDb } from './seed.js';
import { stamp } from './util.js';

const DB_KEY = 'demo.db.v1';
const SESSION_KEY = 'demo.session.v1';

const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* quota or blocked: memory only */ } },
  del: (k) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

let db = null;
let memorySession = null; // used when sessionStorage is unavailable

function load() {
  try { const raw = store.get(DB_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export const getDb = () => (db ??= load() ?? seedDb());

let timer = 0;
const flush = () => { clearTimeout(timer); timer = 0; if (db) store.set(DB_KEY, JSON.stringify(db)); };
/** Debounced write-through after every mutating request; also flushed when the page is hidden/closed so a refresh never loses edits. */
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 100);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (timer) flush(); });
  document.addEventListener('visibilitychange', () => { if (timer) flush(); });
}

/** Replace the contents of the live db object in place (references held by handlers stay valid). */
const replace = (next) => { const d = getDb(); Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, next); };

export function resetDb() {
  replace(seedDb());
  clearTimeout(timer);
  store.set(DB_KEY, JSON.stringify(db));
  if (!db.users.some((u) => u.id === getSessionId())) setSessionId(null);
}

/** All-or-nothing, like a SQL transaction: any throw restores the pre-call state. */
export async function atomic(fn) {
  const snapshot = JSON.stringify(getDb());
  try { return await fn(); } catch (e) { replace(JSON.parse(snapshot)); throw e; }
}

export const nextId = (table) => { const d = getDb(); d.seq[table] = (d.seq[table] ?? 0) + 1; return d.seq[table]; };
export const insert = (table, row) => { const r = { id: nextId(table), ...row }; getDb()[table].push(r); return r; };

// ---- session (current user id) ----
export function getSessionId() {
  const raw = store.get(SESSION_KEY);
  return raw ? Number(raw) : memorySession;
}
export function setSessionId(id) {
  memorySession = id;
  if (id) store.set(SESSION_KEY, String(id)); else store.del(SESSION_KEY);
}

// ---- audit + notifications (server/src/utils/audit.js) ----
export function logActivity({ actorId = null, targetUserId = null, action, description }) {
  insert('logs', { actor_id: actorId, target_user_id: targetUserId, action, description: String(description).slice(0, 255), created_at: stamp() });
}
export function notify(userId, type, message, refId = null) {
  insert('notifications', { user_id: userId, type, message: String(message).slice(0, 255), ref_id: refId, read_at: null, created_at: stamp() });
}
/** Notifies the owner and every active staff member of that owner's shop. */
export function notifyShop(ownerId, type, message, refId = null) {
  getDb().users.filter((u) => u.id === ownerId || (u.owner_id === ownerId && u.role === 'staff' && u.status === 'active'))
    .forEach((u) => notify(u.id, type, message, refId));
}
