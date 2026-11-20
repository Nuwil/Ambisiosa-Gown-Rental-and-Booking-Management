/** Route table + guards: the equivalent of server/src/app.js and middleware/auth.js. */
import { getSessionId } from './store.js';
import { find, permissionsFor, shopName } from './model.js';
import { forbidden, unauthorized } from './util.js';

/** Loads the signed-in user fresh on every request so suspension / role changes apply immediately. */
export function authenticate(ctx) {
  const id = getSessionId();
  if (!id) throw unauthorized();
  const u = find('users', id);
  if (!u) throw unauthorized();
  if (u.status !== 'active') throw forbidden(`Account is ${u.status}`);
  const owner = u.owner_id ? find('users', u.owner_id) : null;
  if (u.role === 'staff' && owner?.status !== 'active') throw forbidden('The shop account is not active');
  const isShop = u.role === 'owner' || u.role === 'staff';
  ctx.user = {
    ...u, isShop, permissions: permissionsFor(u), shopId: u.role === 'owner' ? u.id : u.role === 'staff' ? u.owner_id : null,
    shop_name: u.shop_name ?? (owner ? shopName(owner) : null),
  };
}

export const requireShop = (ctx) => { if (!ctx.user.isShop) throw forbidden(); };
export const requireRole = (...roles) => (ctx) => { if (!roles.includes(ctx.user.role)) throw forbidden(); };
export const staffNeeds = (area) => (ctx) => {
  if (ctx.user.role === 'staff' && !ctx.user.permissions.includes(area)) throw forbidden('Your account does not have access to this area');
};

const compile = (pattern) => {
  const names = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; })}/?$`);
  return { re, names };
};

/** Each domain exports [method, pattern, guards, handler] tuples; `mount` prefixes them and prepends shared guards. */
export const mount = (prefix, shared, list) => list.map(([method, pattern, guards, handler]) => ({
  method, ...compile(prefix + (pattern === '/' ? '' : pattern)), guards: [...shared, ...guards], handler,
}));

let table = [];
export const setRoutes = (routes) => { table = routes; };

export function match(method, path) {
  for (const r of table) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) return { route: r, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}
