/** End-to-end API smoke test. Requires the server running and `npm run seed -- --demo` data. */
const BASE = process.env.API || 'http://localhost:4000/api';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

async function session(email, password) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.arrayBuffer(), headers: res.headers };
  };
  if (email) { const r = await call('POST', '/auth/login', { email, password }); if (r.status !== 200) throw new Error(`login failed ${email}: ${r.status}`); }
  return call.bind(null) && Object.assign(call, { raw: () => cookie });
}
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const anon = await session();
ok((await anon('GET', '/inventory/catalog')).status === 401, 'anonymous cannot browse catalog');
ok((await anon('POST', '/auth/login', { email: 'admin@example.com', password: 'wrong' })).status === 401, 'bad password rejected');

const admin = await session('admin@example.com', 'Admin12345');
const o1 = await session('owner@demo.test', 'Demo12345');
const st = await session('staff1@demo.test', 'Demo12345');
const r1 = await session('renter1@demo.test', 'Demo12345');
const r2 = await session('renter2@demo.test', 'Demo12345');

// ---- RBAC ----
ok((await r1('GET', '/admin/users')).status === 403, 'renter blocked from admin users');
ok((await o1('GET', '/admin/backups')).status === 403, 'owner blocked from backups');
ok((await r1('GET', '/stats/analytics')).status === 403, 'renter blocked from analytics');
ok((await admin('GET', '/inventory/manage/items')).status === 403, 'admin cannot use owner inventory CRUD');
ok((await r1('POST', '/inventory/manage/items', {})).status === 403, 'renter cannot create inventory');
ok((await r1('GET', '/customers')).status === 403, 'renter blocked from customers module');

// ---- dashboards ----
const ad = await admin('GET', '/stats/dashboard'); ok(ad.status === 200 && ad.body.stats.owners === 1, `admin dashboard (owners=${ad.body.stats?.owners})`);
const od = await o1('GET', '/stats/dashboard'); ok(od.status === 200 && od.body.stats.total_units > 0, `owner dashboard (units=${od.body.stats?.total_units}, available=${od.body.stats?.available_units})`);
const rd = await r1('GET', '/stats/dashboard'); ok(rd.status === 200 && 'total_spending' in rd.body.stats, 'renter dashboard');

// ---- single-owner model: staff work on the owner's shop ----
const o1items = await o1('GET', '/inventory/manage/items?pageSize=100');
const stItems = await st('GET', '/inventory/manage/items?pageSize=100');
ok(o1items.body.data.length > 0 && stItems.body.meta.total === o1items.body.meta.total, 'staff see the same shop inventory as the owner');
const o1c = await o1('GET', '/customers'); const stc = await st('GET', '/customers');
ok(stc.status === 200 && stc.body.meta.total === o1c.body.meta.total, 'staff see the shop customers');
const o1tx = await o1('GET', '/transactions?pageSize=100'); const sttx = await st('GET', '/transactions?pageSize=100');
ok(sttx.status === 200 && sttx.body.meta.total === o1tx.body.meta.total, 'staff see the shop transactions');
ok(new Set(o1tx.body.data.map((t) => t.owner_id)).size === 1, 'all transactions belong to the single shop');
ok((await st('GET', '/stats/dashboard')).body.stats.total_units > 0, 'staff get the shop dashboard');
// staff are operators, not managers
ok((await st('GET', '/stats/analytics')).status === 403, 'staff blocked from analytics');
ok((await st('GET', '/reports/rentals')).status === 403, 'staff blocked from reports');
ok((await st('GET', '/staff')).status === 403, 'staff cannot manage staff accounts');
ok((await st('GET', '/admin/users')).status === 403, 'staff blocked from admin users');
ok((await st('DELETE', `/customers/${o1c.body.data[0].id}`)).status === 403, 'staff cannot delete customers');
ok((await st('DELETE', `/inventory/manage/items/${o1items.body.data[0].id}`)).status === 403, 'staff cannot archive items');
ok((await st('POST', '/inventory/manage/categories', { name: 'Staff Cat' })).status === 403, 'staff cannot manage categories');
ok((await r1('GET', '/staff')).status === 403 && (await admin('GET', '/staff')).status === 403, 'only the owner can open staff management');
const r1tx = await r1('GET', '/transactions?pageSize=100');
const r2tx = await r2('GET', '/transactions?pageSize=100');
ok(r1tx.body.data.every((t) => t.renter_user_id === r1tx.body.data[0].renter_user_id), 'renter sees only own transactions');
ok((await r1('GET', `/transactions/${r2tx.body.data[0].id}`)).status === 404, "renter1 cannot read renter2's transaction");

// ---- catalog + availability + request lifecycle ----
const cat = await r1('GET', '/inventory/catalog?pageSize=60'); ok(cat.status === 200 && cat.body.data.length > 0, `renter catalog (${cat.body.meta.total} items)`);
const me1 = (await o1('GET', '/auth/me')).body.user.id;
const item = cat.body.data.find((i) => i.owner_id === me1 && i.name.includes('Classic Black Tuxedo'));
const variant = item.variants.find((v) => v.size === 'M');
const start = day(40), end = day(42);
const before = (await r1('GET', `/inventory/catalog/${item.id}?start=${start}&end=${end}`)).body.variants.find((v) => v.id === variant.id).available;

ok((await r1('POST', '/transactions/request', { type: 'rental', variant_id: variant.id, quantity: 1, start_date: day(-3), expected_return: day(1) })).status === 400, 'rental in the past rejected');
ok((await r1('POST', '/transactions/request', { type: 'rental', variant_id: variant.id, quantity: 1, start_date: day(5), expected_return: day(2) })).status === 400, 'return before start rejected');
ok((await r1('POST', '/transactions/request', { type: 'rental', variant_id: variant.id, quantity: 999, start_date: start, expected_return: end })).status === 409, 'quantity above stock rejected');
const req = await r1('POST', '/transactions/request', { type: 'rental', variant_id: variant.id, quantity: 1, start_date: start, expected_return: end, notes: 'smoke' });
ok(req.status === 201 && req.body.status === 'pending' && req.body.amount === item.rental_price * 3, `rental request created, 3 days × price = ${req.body.amount}`);
ok([403, 404].includes((await r2('POST', `/transactions/${req.body.id}/action`, { action: 'approve' })).status), "another renter cannot act on someone else's request");
ok((await r1('POST', `/transactions/${req.body.id}/action`, { action: 'approve' })).status === 403, 'renter cannot approve own request');
ok((await o1('POST', `/transactions/${req.body.id}/action`, { action: 'release' })).status === 409, 'cannot release before approval');
const appr = await o1('POST', `/transactions/${req.body.id}/action`, { action: 'approve' });
ok(appr.status === 200 && appr.body.status === 'approved', 'owner approves');
const during = (await r1('GET', `/inventory/catalog/${item.id}?start=${start}&end=${end}`)).body.variants.find((v) => v.id === variant.id).available;
ok(during === before - 1, `approval reserves stock for the period (${before} -> ${during})`);
const outside = (await r1('GET', `/inventory/catalog/${item.id}?start=${day(60)}&end=${day(61)}`)).body.variants.find((v) => v.id === variant.id).available;
ok(outside === before, 'stock unaffected outside the reserved period');
ok((await o1('POST', `/transactions/${req.body.id}/payments`, { amount: 999999 })).status === 400, 'overpayment rejected');
const pay = await o1('POST', `/transactions/${req.body.id}/payments`, { amount: req.body.amount, method: 'cash' });
ok(pay.status === 201 && pay.body.payment_status === 'paid', 'full payment recorded');
ok((await o1('POST', `/transactions/${req.body.id}/action`, { action: 'return' })).status === 409, 'cannot return a rental that is not active');
ok((await o1('POST', `/transactions/${req.body.id}/action`, { action: 'release' })).body.status === 'active', 'owner releases -> active');
const done = await o1('POST', `/transactions/${req.body.id}/action`, { action: 'return', actual_return: end });
ok(done.body.status === 'completed' && done.body.actual_return === end, 'return recorded -> completed');
const after = (await r1('GET', `/inventory/catalog/${item.id}?start=${start}&end=${end}`)).body.variants.find((v) => v.id === variant.id).available;
ok(after === before, 'availability restored after return');
const notes = await r1('GET', '/notifications'); ok(notes.body.data.some((n) => n.type === 'ITEM_RETURNED'), 'renter received return notification');

// concurrency: two simultaneous requests for the last unit
const itemB = cat.body.data.find((i) => i.owner_id === me1 && i.name.includes('Navy Three-Piece Suit'));
const vB = [...itemB.variants].sort((x, y) => y.available - x.available)[0]; // any variant that still has stock (purchases in earlier runs deplete it)
const off = 200 + Math.floor(Math.random() * 3000); // unique window per run so leftover reservations from earlier runs don't interfere
const mk = (s) => s('POST', '/transactions/request', { type: 'rental', variant_id: vB.id, quantity: vB.available, start_date: day(off), expected_return: day(off + 1) });
const [a, b] = await Promise.all([mk(r1), mk(r2)]);
const approvals = await Promise.all([a, b].filter((x) => x.status === 201).map((x) => o1('POST', `/transactions/${x.body.id}/action`, { action: 'approve' })));
ok(approvals.filter((r) => r.status === 200).length === 1 && approvals.filter((r) => r.status === 409).length === approvals.length - 1, `concurrent approvals cannot oversell (${approvals.map((r) => r.status).join(',')})`);

// purchase flow
const pItem = cat.body.data.find((i) => i.purchase_price && i.owner_id === item.owner_id);
const pv = pItem.variants[0];
const preq = await r1('POST', '/transactions/request', { type: 'purchase', variant_id: pv.id, quantity: 1, contact_phone: '0999' });
ok(preq.status === 201 && preq.body.amount === pItem.purchase_price, 'purchase request created');
await o1('POST', `/transactions/${preq.body.id}/action`, { action: 'approve' });
const fin = await o1('POST', `/transactions/${preq.body.id}/action`, { action: 'finalize', mark_paid: true });
ok(fin.body.status === 'completed' && fin.body.payment_status === 'paid', 'purchase finalized and paid');
const stockAfter = (await o1('GET', `/inventory/manage/items/${pItem.id}`)).body.variants.find((v) => v.id === pv.id).total_quantity;
ok(stockAfter === pv.total_quantity - 1, `purchase deducted stock (${pv.total_quantity} -> ${stockAfter})`);
const cancelReq = await r1('POST', '/transactions/request', { type: 'rental', variant_id: variant.id, quantity: 1, start_date: day(100), expected_return: day(101) });
ok((await r1('POST', `/transactions/${cancelReq.body.id}/action`, { action: 'cancel' })).body.status === 'cancelled', 'renter cancels own pending request');

// ---- customers CRUD ----
const nc = await o1('POST', '/customers', { name: 'Smoke Tester', phone: '123', email: '' }); ok(nc.status === 201, 'owner creates customer');
ok((await o1('PUT', `/customers/${nc.body.id}`, { name: 'Smoke Tester 2' })).body.name === 'Smoke Tester 2', 'owner updates customer');
const hist = await o1('GET', `/customers/${o1c.body.data[0].id}/transactions?type=rental&status=completed`); ok(hist.status === 200 && hist.body.data.every((t) => t.type === 'rental' && t.status === 'completed'), 'customer history filters work');
ok((await o1('DELETE', `/customers/${nc.body.id}`)).status === 200, 'owner deletes customer without history');
ok((await o1('DELETE', `/customers/${o1c.body.data[0].id}`)).status === 409, 'customer with history cannot be deleted');

const sc = await st('POST', '/customers', { name: 'Staff Added', phone: '555' }); ok(sc.status === 201, 'staff register a customer');
ok((await st('PUT', `/customers/${sc.body.id}`, { name: 'Staff Added 2' })).status === 200, 'staff update a customer');
ok((await o1('DELETE', `/customers/${sc.body.id}`)).status === 200, 'owner can delete it');

// ---- inventory CRUD + validation ----
const bad = await o1('POST', '/inventory/manage/items', { category_id: 1, name: 'x', rental_price: -5, variants: [] }); ok(bad.status === 400, 'inventory validation rejects bad payload');
const cats = (await o1('GET', '/inventory/manage/categories')).body;
const created = await o1('POST', '/inventory/manage/items', { category_id: cats[0].id, name: 'Smoke Gown', rental_price: 100, purchase_price: 900, color: 'Teal', variants: [{ size: 'S', total_quantity: 2 }, { size: 'M', total_quantity: 1 }] });
ok(created.status === 201 && created.body.total_quantity === 3, 'item created with variants');
ok((await o1('PUT', `/inventory/manage/items/${created.body.id}`, { category_id: cats[0].id, name: 'Smoke Gown II', rental_price: 120, variants: [{ size: 'S', total_quantity: 5 }] })).body.total_quantity === 5, 'item updated, variant removed');
ok((await o1('DELETE', `/inventory/manage/items/${created.body.id}`)).status === 200, 'item archived');
ok(!(await r1('GET', '/inventory/catalog?q=Smoke')).body.data.some((i) => i.id === created.body.id), 'archived item hidden from renters');

// ---- analytics, predictions, exports ----
for (const [who, s] of [['admin', admin], ['owner', o1]]) {
  const an = await s('GET', '/stats/analytics?range=monthly');
  ok(an.status === 200 && an.body.revenueSeries.length > 0, `${who} analytics (${an.body.revenueSeries.length} buckets, revenue ${an.body.summary?.revenue})`);
  ok(an.body.predictions.revenue.forecast.every((f) => f.predicted === true), `${who} forecasts flagged as predicted (${an.body.predictions.revenue.method ?? 'insufficient data'})`);
}
ok((await admin('GET', '/stats/analytics?range=custom&from=2026-01-01&to=2026-03-01')).status === 200, 'custom range');
ok((await admin('GET', '/stats/analytics?range=custom&from=2026-03-01&to=2026-01-01')).status === 400, 'invalid custom range rejected');
const x = await o1('GET', '/reports/rentals?format=xlsx'); ok(x.status === 200 && x.headers.get('content-type').includes('spreadsheetml') && x.body.byteLength > 1000, 'xlsx export');
const p = await o1('GET', '/reports/overdue?format=pdf'); ok(p.status === 200 && p.headers.get('content-type').includes('pdf') && Buffer.from(p.body).subarray(0, 4).toString() === '%PDF', 'pdf export');
ok((await r1('GET', '/reports/rentals')).status === 403, 'renter cannot export reports');

// ---- admin: one admin, one owner, many staff ----
const stamp = Date.now();
ok((await admin('POST', '/admin/users', { role: 'owner', name: 'Second Owner', email: `o${stamp}@test.dev`, password: 'Smoke12345', shop_name: 'X' })).status === 409, 'a second owner is refused');
ok((await admin('POST', '/admin/users', { role: 'admin', name: 'Second Admin', email: `a${stamp}@test.dev`, password: 'Smoke12345' })).status === 409, 'a second admin is refused');
const u = await admin('POST', '/admin/users', { role: 'staff', name: 'Smoke Staff', email: `smoke${stamp}@test.dev`, password: 'Smoke12345' });
ok(u.status === 201 && u.body.owner_id, 'admin creates staff attached to the owner'); const newStaff = await session(u.body.email, 'Smoke12345');
ok((await newStaff('GET', '/inventory/manage/items')).status === 200, 'new staff can work on the shop');
// owner-managed staff
const ns = await o1('POST', '/staff', { name: 'Owner Staff', email: `os${stamp}@test.dev`, password: 'Smoke12345' }); ok(ns.status === 201, 'owner creates a staff account');
ok((await o1('GET', '/staff')).body.data.some((x) => x.id === ns.body.id), 'owner lists their staff');
ok((await o1('PATCH', `/staff/${ns.body.id}/status`, { status: 'suspended' })).status === 200, 'owner suspends staff');
ok((await (await session(null))('POST', '/auth/login', { email: ns.body.email, password: 'Smoke12345' })).status === 403, 'suspended staff cannot log in');
ok((await o1('DELETE', `/staff/${ns.body.id}`)).status === 200, 'owner deletes staff without history');
ok((await admin('PATCH', `/admin/users/${u.body.id}/status`, { status: 'suspended' })).status === 200, 'admin suspends user');
ok((await newStaff('GET', '/stats/dashboard')).status === 403, 'suspended user is locked out immediately');
const reset = await admin('POST', `/admin/users/${u.body.id}/reset-password`); ok(!!reset.body.temporaryPassword, 'admin password reset');
ok((await admin('DELETE', `/admin/users/${u.body.id}`)).status === 200, 'admin deletes user without history');
// shop suspended => its staff are locked out too
const ownerId = (await o1('GET', '/auth/me')).body.user.id;
await admin('PATCH', `/admin/users/${ownerId}/status`, { status: 'suspended' });
ok((await st('GET', '/stats/dashboard')).status === 403, 'staff locked out while the owner account is suspended');
await admin('PATCH', `/admin/users/${ownerId}/status`, { status: 'active' });
ok((await st('GET', '/stats/dashboard')).status === 200, 'staff regain access when the owner is reactivated');
ok((await admin('DELETE', `/admin/users/${ownerId}`)).status === 409, 'the owner account cannot be deleted');
ok((await admin('PATCH', '/admin/users/1/status', { status: 'inactive' })).status === 400, 'admin cannot deactivate self');
ok((await admin('GET', '/admin/logs?pageSize=5')).body.data.length === 5, 'activity logs listed');
ok((await r1('PUT', '/auth/password', { currentPassword: 'wrong', newPassword: 'Newpass123' })).status === 400, 'password change requires current password');
ok((await r1('PUT', '/auth/theme', { theme: 'dark' })).status === 200 && (await r1('GET', '/auth/me')).body.user.theme === 'dark', 'theme persists server-side');
await r1('PUT', '/auth/theme', { theme: 'light' });

// ---- cart: server-side, per renter, atomic checkout ----
const r3 = await session('renter3@demo.test', 'Demo12345');
const r4 = await session('renter4@demo.test', 'Demo12345'); // renter1/2 carry demo carts
await r3('DELETE', '/cart');
ok((await o1('GET', '/cart')).status === 403 && (await anon('GET', '/cart')).status === 401, 'cart is renter-only');
const cartCat = (await r3('GET', '/inventory/catalog?pageSize=50')).body.data;
const pick = cartCat.filter((i) => i.variants.some((v) => v.available >= 3)).slice(0, 2);
const [va, vb] = pick.map((i) => i.variants.find((v) => v.available >= 3).id);
const cw = { start_date: day(40), expected_return: day(42) };
ok((await r3('POST', '/cart', { type: 'rental', variant_id: va, quantity: 1, start_date: day(-3), expected_return: day(-2) })).status === 400, 'cart rejects past rental dates');
const c1 = await r3('POST', '/cart', { type: 'rental', variant_id: va, quantity: 1, ...cw });
ok(c1.status === 201 && c1.body.lines.length === 1 && c1.body.total > 0, 'add to cart prices the line');
const c2 = await r3('POST', '/cart', { type: 'rental', variant_id: va, quantity: 1, ...cw });
ok(c2.body.lines.length === 1 && c2.body.lines[0].quantity === 2, 'adding the same item merges quantities');
await r3('POST', '/cart', { type: 'rental', variant_id: vb, quantity: 1, ...cw });
ok((await r3('GET', '/cart/count')).body.count === 2, 'cart count = lines');
ok((await r4('GET', '/cart')).body.lines.length === 0, "one renter cannot see another's cart");
const line = (await r3('GET', '/cart')).body.lines[0];
ok((await r4('PATCH', `/cart/${line.id}`, { quantity: 1 })).status === 404 && (await r4('DELETE', `/cart/${line.id}`)).status === 404, "cannot edit or remove another renter's line");
ok((await r3('PATCH', `/cart/${line.id}`, { quantity: 99 })).body.lines.find((l) => l.id === line.id).issue != null, 'over-stock line is flagged with an issue');
ok((await r3('POST', '/cart/checkout', {})).status === 409, 'checkout is refused while a line is unavailable');
ok((await r3('GET', '/cart')).body.lines.length === 2, 'failed checkout leaves the cart untouched (all-or-nothing)');
await r3('PATCH', `/cart/${line.id}`, { quantity: 1 });
const txBefore = (await r3('GET', '/transactions?pageSize=1')).body.meta.total;
const co = await r3('POST', '/cart/checkout', { notes: 'cart checkout' });
ok(co.status === 201 && co.body.transaction_ids.length === 2 && co.body.cart.lines.length === 0, 'checkout creates one pending request per line and empties the cart');
ok((await r3('GET', '/transactions?pageSize=1')).body.meta.total === txBefore + 2, 'requests appear in the renter history');
ok((await r3('POST', '/cart/checkout', {})).status === 400, 'empty checkout rejected');

// ---- renter accounts directory ----
const renterDir = await o1('GET', '/customers/renters?pageSize=50');
ok(renterDir.status === 200 && renterDir.body.data.length >= 6 && renterDir.body.data.every((x) => !('password_hash' in x)), 'owner lists registered renter accounts (no secrets)');
ok((await o1('GET', '/customers/renters?q=renter3')).body.data.some((x) => x.email === 'renter3@demo.test' && x.total_transactions >= 2), 'directory search + per-shop history');
ok((await r1('GET', '/customers/renters')).status === 403, 'renters cannot open the directory');

// ---- staff access roles ----
const perm = await o1('POST', '/staff', { name: 'Perm Staff', email: `perm${stamp}@test.dev`, password: 'Smoke12345', permissions: ['customers'] });
ok(perm.status === 201 && perm.body.permissions.join() === 'customers', 'owner creates staff with a limited access role');
const ps = await session(perm.body.email, 'Smoke12345');
ok((await ps('GET', '/auth/me')).body.user.permissions.join() === 'customers', 'session exposes staff permissions');
ok((await ps('GET', '/customers')).status === 200 && (await ps('GET', '/customers/renters')).status === 200, 'staff with customers access can use customers');
ok((await ps('GET', '/inventory/manage/items')).status === 403 && (await ps('GET', '/transactions')).status === 403, 'staff without inventory/transactions access are blocked');
ok((await ps('POST', '/inventory/manage/items', {})).status === 403, 'staff without inventory access cannot write inventory');
ok((await ps('GET', '/inventory/catalog')).status === 200, 'catalog stays readable');
ok((await o1('PUT', `/staff/${perm.body.id}`, { name: 'Perm Staff', email: perm.body.email, permissions: ['transactions'] })).body.permissions.join() === 'transactions', 'owner changes access role');
ok((await ps('POST', '/customers', { name: 'X' })).status === 403 && (await ps('GET', '/transactions')).status === 200, 'role change applies on the next request');
ok((await ps('GET', '/inventory/manage/items')).status === 200, 'transactions staff can view stock to pick items');
ok((await o1('POST', '/staff', { name: 'Bad', email: `bad${stamp}@test.dev`, password: 'Smoke12345', permissions: ['root'] })).status === 400, 'unknown permissions rejected');
await o1('DELETE', `/staff/${perm.body.id}`);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
