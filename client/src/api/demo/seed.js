/**
 * Demo data mirroring server/scripts/seed.js (one owner with staff, renters, ~40 items, a year of history),
 * but larger. Every date is relative to "now" and the PRNG is seeded, so each fresh load looks the same.
 */
import { addDays, stamp } from './util.js';

export const DEMO_PASSWORD = 'Demo12345';
export const ADMIN_PASSWORD = 'Admin12345';
export const DEFAULT_CATEGORIES = ['Gowns', 'Suits', 'Costumes', 'Traditional Wear', 'Accessories', 'Other'];

const CATALOG = {
  Gowns: [
    ['Emerald Evening Gown', 'Emerald', 1800, 14000], ['Blush Ball Gown', 'Blush', 2500, 22000], ['Midnight Satin Gown', 'Navy', 2200, 18000],
    ['Ivory Wedding Gown', 'Ivory', 4500, 38000], ['Burgundy Velvet Gown', 'Burgundy', 2000, 16000], ['Champagne Sequin Gown', 'Champagne', 2600, 21000],
    ['Sapphire Mermaid Gown', 'Blue', 2400, 19500], ['Lavender Tulle Gown', 'Lavender', 1700, 13000],
  ],
  Suits: [
    ['Classic Black Tuxedo', 'Black', 1500, 12000], ['Navy Three-Piece Suit', 'Navy', 1300, 10500], ['Charcoal Slim Suit', 'Charcoal', 1200, 9500],
    ['Ivory Dinner Jacket', 'Ivory', 1400, 11000], ['Burgundy Velvet Blazer', 'Burgundy', 1100, 8500], ['Grey Morning Suit', 'Grey', 1600, null],
    ['Forest Green Suit', 'Green', 1250, 9800],
  ],
  Costumes: [
    ['Venetian Masquerade Costume', 'Gold', 1000, null], ['Pirate Captain Costume', 'Brown', 800, 5500], ['Medieval Knight Armor Set', 'Silver', 1500, null],
    ['Victorian Lady Costume', 'Plum', 1200, 8000], ['Fairy Tale Princess Costume', 'Pink', 900, 6000], ['Renaissance Doublet', 'Maroon', 950, null],
    ['Mascot Bear Costume', 'Brown', 700, null],
  ],
  'Traditional Wear': [
    ['Barong Tagalog Premium', 'Cream', 1100, 7500], ['Filipiniana Terno', 'Rose', 1600, 11000], ['Kimono Set', 'Red', 1400, null],
    ['Maria Clara Gown', 'Teal', 1800, 12500], ["Baro't Saya Set", 'Mustard', 1300, 8800], ['Hanbok Set', 'Pink', 1500, null],
    ['Cheongsam Dress', 'Red', 1400, 9000], ['Sherwani Set', 'Ivory', 2000, 15000],
  ],
  Accessories: [
    ['Pearl Necklace Set', 'White', 300, 2200], ['Silk Bow Tie Pack', 'Assorted', 150, 900], ['Crystal Tiara', 'Silver', 500, 3500],
    ['Velvet Evening Clutch', 'Black', 250, 1800], ['Opera Gloves', 'White', 200, 1200], ['Gold Cufflink Set', 'Gold', 180, 1500],
    ['Feather Fascinator', 'Ivory', 220, null],
  ],
  Other: [['Ceremonial Sash Set', 'Red', 350, null], ['Photo Backdrop Cape', 'Gold', 600, null], ['Event Umbrella Set', 'Black', 150, 900]],
};
const BLURB = {
  Gowns: 'Floor-length gown with a tailored bodice, ready for galas, proms and weddings.',
  Suits: 'Sharp, well-fitted suit pressed and cleaned between every rental.',
  Costumes: 'Complete costume with accessories, popular for themed parties and school events.',
  'Traditional Wear': 'Traditional attire made for cultural celebrations and formal occasions.',
  Accessories: 'Finishing touch to complete the look; sold and rented as a set.',
  Other: 'Event essential available by the day.',
};
const RENTERS = ['Ana Reyes', 'Luis Garcia', 'Carla Mendoza', 'Paolo Ramos', 'Bea Navarro', 'Miguel Torres', 'Sofia Dela Cruz', 'Marco Villanueva', 'Isabel Aquino'];
const WALK_INS = ['Grace Lim', 'Ben Cruz', 'Joy Fernandez', 'Ramon Bautista', 'Lea Soriano', 'Dennis Pascual', 'Mae Castillo', 'Oscar Domingo'];
const STAFF = [['Rico Valdez', 'inventory,customers,transactions'], ['Tina Lim', 'customers,transactions'], ['Jun Cruz', 'inventory']];

export function seedDb() {
  let s = 42; // deterministic LCG, same as server/scripts/seed.js
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const day = (offset) => addDays(new Date().toISOString().slice(0, 10), offset);
  const at = (d, h = int(9, 18)) => `${d} ${String(h).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00`;

  const db = { seq: {}, users: [], categories: [], items: [], variants: [], images: [], customers: [], transactions: [], payments: [], notifications: [], logs: [], backups: [], cart: [] };
  const add = (table, row) => { const r = { id: (db.seq[table] = (db.seq[table] ?? 0) + 1), ...row }; db[table].push(r); return r; };

  // ---- users ----
  const user = (role, name, email, extra = {}) => add('users', {
    role, owner_id: null, name, email, phone: null, address: null, shop_name: null, status: 'active', theme: 'light', staff_permissions: null,
    password: role === 'admin' ? ADMIN_PASSWORD : DEMO_PASSWORD, is_seed: role !== 'admin', created_at: at(day(-int(300, 440))), ...extra,
  });
  user('admin', 'System Administrator', 'admin@example.com', { created_at: at(day(-450)) });
  const owner = user('owner', 'Maria Santos', 'owner@demo.test', { shop_name: 'Santos Gowns & Suits', phone: '0917-000-0001', address: '12 Mabini St., Quezon City', created_at: at(day(-440)) });
  const staff = STAFF.map(([n, perms], i) => user('staff', n, `staff${i + 1}@demo.test`, { owner_id: owner.id, staff_permissions: perms, phone: `0917-000-010${i}`, created_at: at(day(-400 + i * 30)) }));
  const renters = RENTERS.map((n, i) => user('renter', n, `renter${i + 1}@demo.test`, {
    phone: `0918-000-00${i}0`, address: `${int(10, 99)} ${pick(['Rizal', 'Bonifacio', 'Luna', 'Mabini'])} St., ${pick(['Manila', 'Pasig', 'Makati', 'Taguig'])}`,
    status: i === 7 ? 'suspended' : i === 8 ? 'inactive' : 'active',
  }));

  // ---- catalogue ----
  DEFAULT_CATEGORIES.forEach((name) => add('categories', { owner_id: owner.id, name }));
  const catId = Object.fromEntries(db.categories.map((c) => [c.name, c.id]));
  const vs = []; // { variantId, rent, buy }
  for (const [cat, items] of Object.entries(CATALOG)) {
    for (const [name, color, rent, buy] of items) {
      const it = add('items', {
        owner_id: owner.id, category_id: catId[cat], name, description: `${name}. ${BLURB[cat]}`, color, rental_price: rent, purchase_price: buy,
        condition_status: pick(['new', 'good', 'good', 'fair']), is_published: true, archived_at: null, created_at: at(day(-int(300, 420)), 9),
      });
      [1, 2].forEach((n) => add('images', { item_id: it.id, path: `gen:${n}`, is_primary: n === 1 }));
      const sizes = ['Accessories', 'Other'].includes(cat) ? ['One Size'] : cat === 'Suits' ? ['S', 'M', 'L', 'XL'] : ['S', 'M', 'L'];
      sizes.forEach((size) => vs.push({ variantId: add('variants', { item_id: it.id, size, total_quantity: int(3, 6) }).id, rent, buy }));
    }
  }
  db.items.find((i) => i.name === 'Mascot Bear Costume').is_published = false; // one unpublished item for the inventory view

  // ---- customers: linked renter accounts + walk-ins ----
  const cs = [
    ...renters.map((r) => add('customers', { owner_id: owner.id, user_id: r.id, name: r.name, phone: r.phone, email: r.email, address: r.address, notes: null, created_at: at(day(-int(200, 400))) })),
    ...WALK_INS.map((n, i) => add('customers', { owner_id: owner.id, user_id: null, name: `Walk-in: ${n}`, phone: `0920-111-22${10 + i}`, email: null, address: `${int(10, 99)} Rizal St., Quezon City`, notes: i % 3 === 0 ? 'Prefers pickup in the afternoon.' : null, created_at: at(day(-int(10, 250))) })),
  ];

  // ---- transactions (about 13 months of history with growth and a busy prom/wedding season) ----
  const recorders = [owner.id, staff[0].id, staff[1].id];
  const insertTx = (cust, v, o) => {
    const qty = o.qty ?? 1;
    const days = o.type === 'rental' ? Math.round((new Date(o.end) - new Date(o.start)) / 86400000) + 1 : 0;
    const amount = o.type === 'rental' ? v.rent * qty * days : v.buy * qty;
    const created = at(o.created);
    const tx = add('transactions', {
      owner_id: owner.id, customer_id: cust.id, variant_id: v.variantId, type: o.type, quantity: qty, start_date: o.start ?? null, expected_return: o.end ?? null,
      actual_return: o.actual ?? null, amount, status: o.status, payment_status: o.pay ?? 'unpaid', notes: o.notes ?? null, created_at: created, updated_at: created,
    });
    if (o.pay === 'paid' || o.pay === 'partial') {
      add('payments', { transaction_id: tx.id, amount: o.pay === 'paid' ? amount : Math.round(amount / 2), method: pick(['cash', 'gcash', 'bank']), paid_at: at(o.paidOn ?? o.created, 13), recorded_by: pick(recorders) });
    }
    if (o.type === 'purchase' && o.status === 'completed') { const row = db.variants.find((x) => x.id === v.variantId); if (row.total_quantity > qty) row.total_quantity -= qty; }
    return tx;
  };
  const popular = () => vs[Math.floor(rnd() ** 1.6 * vs.length)]; // earlier catalogue items are rented more often
  for (let back = 420; back > 10; back -= int(1, 2)) {
    const start = day(-back);
    const month = new Date(start).getUTCMonth() + 1;
    const season = [3, 4, 5, 11, 12].includes(month) ? 1.6 : 1;
    if (rnd() > 0.5 * season * (1 + (420 - back) / 700)) continue;
    const v = popular(); const cust = pick(cs);
    if (v.buy && rnd() < 0.35) insertTx(cust, v, { type: 'purchase', status: 'completed', created: start, pay: 'paid' });
    else {
      const end = day(-back + int(1, 4));
      insertTx(cust, v, { type: 'rental', status: 'completed', created: day(-back - int(2, 7)), start, end, actual: rnd() < 0.15 ? day(-back + int(5, 7)) : end, pay: 'paid', paidOn: start });
    }
  }
  const cust = (i) => cs[i % cs.length];
  // current state: active, overdue, due soon, approved (upcoming), pending
  insertTx(cust(0), vs[0], { type: 'rental', status: 'active', created: day(-6), start: day(-3), end: day(2), pay: 'partial', paidOn: day(-3) });
  insertTx(cust(1), vs[3], { type: 'rental', status: 'active', created: day(-12), start: day(-9), end: day(-2), pay: 'partial', paidOn: day(-9) });
  insertTx(cust(2), vs[5], { type: 'rental', status: 'active', created: day(-4), start: day(-1), end: day(1), pay: 'paid', paidOn: day(-1) });
  insertTx(cust(3), vs[7], { type: 'rental', status: 'approved', created: day(-2), start: day(5), end: day(8) });
  insertTx(cust(4), vs[2], { type: 'rental', status: 'pending', created: day(-1), start: day(10), end: day(12) });
  insertTx(cust(0), vs[4], { type: 'rental', status: 'pending', created: day(0), start: day(14), end: day(15) });
  const buyable = vs.find((x) => x.buy);
  insertTx(cust(1), buyable, { type: 'purchase', status: 'pending', created: day(0) });
  insertTx(cust(6), vs[1], { type: 'rental', status: 'pending', created: day(0), start: day(20), end: day(22) });
  insertTx(cust(5), vs[6], { type: 'rental', status: 'approved', created: day(-1), start: day(3), end: day(4) });
  const buyables = vs.filter((x) => x.buy);
  const bv = (i) => buyables[i % buyables.length];
  for (let i = 0; i < 8; i++) insertTx(cust(i + 3), bv(i), { type: 'purchase', status: 'completed', created: day(-int(1, 40)), pay: 'paid', qty: i % 4 === 0 ? 2 : 1 });
  insertTx(cust(7), bv(1), { type: 'purchase', status: 'approved', created: day(-2), pay: 'partial', paidOn: day(-1) });
  insertTx(cust(8), bv(2), { type: 'purchase', status: 'approved', created: day(-1) });
  insertTx(cust(9), bv(3), { type: 'purchase', status: 'pending', created: day(0) });
  insertTx(cust(10), bv(4), { type: 'purchase', status: 'pending', created: day(-1), qty: 2 });
  insertTx(cust(11), bv(5), { type: 'purchase', status: 'cancelled', created: day(-9) });
  insertTx(cust(12), bv(6), { type: 'purchase', status: 'rejected', created: day(-6) });
  for (let i = 0; i < 6; i++) { // recent returns (two of them late)
    const st = -int(8, 30);
    insertTx(cust(i + 2), vs[(i * 3 + 1) % vs.length], { type: 'rental', status: 'completed', created: day(st - 3), start: day(st), end: day(st + 2), actual: i % 3 === 0 ? day(st + 5) : day(st + 2), pay: 'paid', paidOn: day(st) });
  }
  insertTx(cust(13), vs[2], { type: 'rental', status: 'rejected', created: day(-5), start: day(4), end: day(6) });
  insertTx(cust(14), vs[4], { type: 'rental', status: 'cancelled', created: day(-7), start: day(9), end: day(10) });
  insertTx(cust(9), vs[5], { type: 'rental', status: 'active', created: day(-3), start: day(-2), end: day(3), pay: 'paid', paidOn: day(-2) });
  insertTx(cust(10), vs[7], { type: 'rental', status: 'approved', created: day(-1), start: day(6), end: day(9), pay: 'partial', paidOn: day(0) });

  // ---- carts (renter1 and renter2) ----
  [[0, vs[8], 'rental', 1, day(25), day(27)], [0, vs[9], 'rental', 2, day(25), day(27)], [1, vs[10], 'rental', 1, day(30), day(31)], [1, buyable, 'purchase', 1, null, null]]
    .forEach(([ri, v, type, quantity, a, b]) => add('cart', { renter_id: renters[ri].id, variant_id: v.variantId, type, quantity, start_date: a, expected_return: b, created_at: stamp(), updated_at: stamp() }));

  // ---- notifications, derived from recent transactions ----
  const info = (t) => { const v = db.variants.find((x) => x.id === t.variant_id); return { item: db.items.find((i) => i.id === v.item_id).name, size: v.size, cust: db.customers.find((c) => c.id === t.customer_id) }; };
  const notes = [];
  const shop = [owner, ...staff];
  db.transactions.filter((t) => t.created_at.slice(0, 10) >= day(-14)).forEach((t) => {
    const { item, size, cust: c } = info(t);
    if (t.status === 'pending') shop.forEach((u, i) => notes.push({ user_id: u.id, type: 'REQUEST_SUBMITTED', message: `New ${t.type} request for "${item}" (${size}) from ${c.name}`, ref_id: t.id, read_at: i && t.created_at.slice(0, 10) < day(0) ? t.created_at : null, created_at: t.created_at }));
    const msg = { approved: ['REQUEST_APPROVED', `Your ${t.type} request for "${item}" was approved`], active: ['ITEM_RELEASED', `"${item}" has been released to you. Return by ${t.expected_return}`], rejected: ['REQUEST_REJECTED', `Your ${t.type} request for "${item}" was rejected`], completed: ['PURCHASE_COMPLETED', `Your purchase of "${item}" is complete`] }[t.status];
    if (c.user_id && msg && !(t.status === 'completed' && t.type === 'rental')) notes.push({ user_id: c.user_id, type: msg[0], message: msg[1], ref_id: t.id, read_at: rnd() < 0.5 ? t.created_at : null, created_at: t.created_at });
  });
  notes.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((n) => add('notifications', n));

  // ---- activity log ----
  const logs = [];
  const log = (created_at, actor, target, action, description) => logs.push({ actor_id: actor?.id ?? null, target_user_id: target?.id ?? null, action, description, created_at });
  renters.forEach((r) => log(r.created_at, r, r, 'USER_REGISTER', `Renter ${r.name} registered`));
  staff.forEach((u) => log(u.created_at, owner, u, 'ACCOUNT_CREATE', `${owner.name} created staff account for ${u.name}`));
  db.items.slice(0, 12).forEach((it) => log(it.created_at, owner, null, 'INVENTORY_CREATE', `${owner.name} added item "${it.name}"`));
  db.transactions.filter((t) => t.created_at.slice(0, 10) >= day(-45)).forEach((t) => {
    const { item, cust: c } = info(t);
    const renter = c.user_id ? db.users.find((u) => u.id === c.user_id) : null;
    const who = renter ?? owner;
    log(t.created_at, who, owner, renter ? `${t.type.toUpperCase()}_REQUEST` : `${t.type.toUpperCase()}_CREATE`, renter ? `${who.name} requested ${t.type} of "${item}" x${t.quantity}` : `${owner.name} recorded ${t.type} of "${item}" for ${c.name}`);
    if (['approved', 'active', 'completed'].includes(t.status)) log(at(t.created_at.slice(0, 10), 19), pick(shop), renter, 'TX_APPROVE', `${owner.name}: approve ${t.type} #${t.id} "${item}"`);
    if (t.status === 'active') log(at(t.start_date, 10), pick(shop), renter, 'TX_RELEASE', `${owner.name}: release rental #${t.id} "${item}"`);
  });
  db.payments.filter((p) => p.paid_at.slice(0, 10) >= day(-45)).forEach((p) => log(p.paid_at, db.users.find((u) => u.id === p.recorded_by), null, 'PAYMENT_UPDATE', `${db.users.find((u) => u.id === p.recorded_by).name} recorded payment of ${p.amount.toFixed(2)} on transaction #${p.transaction_id}`));
  for (let i = 0; i < 40; i++) { const u = pick([...db.users.filter((x) => x.status === 'active'), owner]); log(at(day(-int(0, 40))), u, u, 'USER_LOGIN', `${u.name} logged in`); }
  [5, 12, 26].forEach((n) => log(at(day(-n), 8), owner, null, 'REPORT_EXPORT', `${owner.name} exported Revenue (payments received) (xlsx)`));
  logs.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((l) => add('logs', l));

  // ---- backups (fake) ----
  [[28, 'success', 1.31], [21, 'success', 1.34], [14, 'failed', null], [7, 'success', 1.4], [1, 'success', 1.43]].forEach(([n, status, mb], i) => {
    const created_at = at(day(-n), 2);
    add('backups', {
      file_name: `backup-${created_at.replace(' ', 'T').replace(/:/g, '-')}.sql`, size_bytes: mb ? Math.round(mb * 1048576) : null, status,
      error: status === 'failed' ? 'mysqldump exited with 2' : null, created_by: i % 2 ? 1 : null, created_at,
    });
  });
  return db;
}
