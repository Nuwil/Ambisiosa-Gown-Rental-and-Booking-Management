/**
 * Demo backend entry point (loaded only when VITE_DEMO_MODE === 'true'). `dispatch` takes what client.js would send to
 * fetch() and answers with `{ status, data }` (JSON) or `{ status, blob, filename }` (downloads); it never throws for
 * HTTP errors, exactly like a fetch Response. Nothing here touches the network.
 */
import { getDb, resetDb, save } from './store.js';
import { match, mount, setRoutes } from './router.js';
import { HttpError, FileReply, Reply } from './util.js';
import { routes as auth } from './auth.js';
import { routes as inventory } from './inventory.js';
import { routes as customers } from './customers.js';
import { routes as transactions } from './transactions.js';
import { routes as cart } from './cart.js';
import { routes as notifications } from './notifications.js';
import { routes as stats } from './dashboard.js';
import { routes as reports } from './reports.js';
import { routes as staff } from './staff.js';
import { routes as admin } from './admin.js';
import { checkLimits, recordUsage } from './limits.js';

setRoutes([
  ...mount('/health', [], [['GET', '/', [], () => ({ ok: true })]]),
  ...auth, ...inventory, ...customers, ...transactions, ...notifications, ...stats, ...cart, ...reports, ...staff, ...admin,
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const latency = () => sleep(80 + Math.random() * 120);
const json = (v) => JSON.parse(JSON.stringify(v ?? null)); // detach from live state, like a serialised response

export async function dispatch(method, path, { body, params, form } = {}) {
  await latency();
  getDb(); // make sure the store is loaded (or seeded) before any handler runs
  const query = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
  const hit = match(method, path);
  try {
    if (!hit) throw new HttpError(404, 'Route not found');
    const ctx = { method, path, params: hit.params, query, body: body === undefined ? undefined : json(body), form };
    for (const guard of hit.route.guards) guard(ctx);
    checkLimits(method, path);
    const out = await hit.route.handler(ctx);
    recordUsage(method, path);
    if (method !== 'GET') save();
    if (out instanceof FileReply) return { status: 200, blob: out.blob, filename: out.filename };
    if (out instanceof Reply) return { status: out.status, data: json(out.data) };
    return { status: 200, data: json(out) };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, data: { message: e.message, details: e.details } };
    console.error('[demo]', e);
    return { status: 500, data: { message: e.message || 'Internal server error' } };
  }
}

/** Throw away every edit and reseed (keeps the signed-in user if they still exist). */
export const resetDemo = () => resetDb();
