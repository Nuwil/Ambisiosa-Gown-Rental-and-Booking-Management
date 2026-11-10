/**
 * Usage:
 *   npm run seed                 -> ensures the admin account exists (ADMIN_EMAIL / ADMIN_PASSWORD, see below)
 *   npm run seed:demo            -> additionally loads DEVELOPMENT sample data
 *
 * Sample data is for development only. Users and transactions carry is_seed = 1 so they can be told apart from
 * (and purged without touching) real records:  DELETE FROM users WHERE is_seed = 1;
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';
import { DEFAULT_CATEGORIES } from '../src/modules/inventory/service.js';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin12345';
const DEMO_PASSWORD = 'Demo12345';
const demo = process.argv.includes('--demo');
const reset = process.argv.includes('--reset'); // purge previous demo data (is_seed = 1) before reseeding

const hash = (p) => bcrypt.hash(p, 12);
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// deterministic PRNG so repeated seeds look the same
let s = 42;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

async function ensureAdmin() {
  const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
  if (rows.length) return console.log(`Admin ${ADMIN_EMAIL} already exists`);
  await pool.execute("INSERT INTO users (role, name, email, password_hash) VALUES ('admin','System Administrator',?,?)", [ADMIN_EMAIL, await hash(ADMIN_PASSWORD)]);
  console.log(`Created admin ${ADMIN_EMAIL}${process.env.ADMIN_PASSWORD ? '' : ` (default password "${ADMIN_PASSWORD}" — change it after first login)`}`);
}

const CATALOG = {
  Gowns: [['Emerald Evening Gown', 'Emerald', 1800, 14000], ['Blush Ball Gown', 'Blush', 2500, 22000], ['Midnight Satin Gown', 'Navy', 2200, 18000], ['Ivory Wedding Gown', 'Ivory', 4500, 38000]],
  Suits: [['Classic Black Tuxedo', 'Black', 1500, 12000], ['Navy Three-Piece Suit', 'Navy', 1300, 10500], ['Charcoal Slim Suit', 'Charcoal', 1200, 9500]],
  Costumes: [['Venetian Masquerade Costume', 'Gold', 1000, null], ['Pirate Captain Costume', 'Brown', 800, 5500]],
  'Traditional Wear': [['Barong Tagalog Premium', 'Cream', 1100, 7500], ['Filipiniana Terno', 'Rose', 1600, 11000], ['Kimono Set', 'Red', 1400, null]],
  Accessories: [['Pearl Necklace Set', 'White', 300, 2200], ['Silk Bow Tie Pack', 'Assorted', 150, 900]],
};

const ASSETS = path.resolve('seed-assets');
const UPLOADS = path.resolve('uploads');
const slugify = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Copies the bundled sample photos (seed-assets/<item-slug>-1.jpg, -2.jpg) into uploads and links them to the item. */
async function attachSamplePhotos(itemId, name) {
  fs.mkdirSync(UPLOADS, { recursive: true });
  for (const n of [1, 2]) {
    const src = path.join(ASSETS, `${slugify(name)}-${n}.jpg`);
    if (!fs.existsSync(src)) continue;
    const file = `${crypto.randomUUID()}.jpg`;
    fs.copyFileSync(src, path.join(UPLOADS, file));
    await pool.execute('INSERT INTO item_images (item_id, path, is_primary) VALUES (?,?,?)', [itemId, file, n === 1 ? 1 : 0]);
  }
}

async function resetDemo() {
  const seededItems = "description LIKE '%[DEMO SEED]%'";
  const [[{ transactions }]] = await pool.query(
    `SELECT COUNT(*) AS transactions FROM transactions t
     JOIN item_variants v ON v.id = t.variant_id
     JOIN items i ON i.id = v.item_id
     WHERE ${seededItems.replaceAll('description', 'i.description')} AND t.is_seed = 0`,
  );
  const [[{ cartItems }]] = await pool.query(
    `SELECT COUNT(*) AS cartItems FROM cart_items c
     JOIN item_variants v ON v.id = c.variant_id
     JOIN items i ON i.id = v.item_id
     WHERE ${seededItems.replaceAll('description', 'i.description')}
       AND c.renter_id NOT IN (SELECT id FROM users WHERE is_seed = 1)`,
  );
  if (transactions || cartItems) {
    throw new Error('Cannot reset demo data: a non-demo transaction or cart uses a demo item. Remove or move it first.');
  }

  const seedUsers = '(SELECT id FROM users WHERE is_seed = 1)';
  const seedOwners = `(SELECT id FROM users WHERE is_seed = 1 AND role = 'owner')`;
  const [old] = await pool.query(
    `SELECT path FROM item_images WHERE item_id IN (SELECT id FROM items WHERE ${seededItems} OR owner_id IN ${seedOwners})`,
  );
  for (const { path: f } of old) fs.rmSync(path.join(UPLOADS, path.basename(f)), { force: true });

  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const sql of [
      `DELETE FROM payments WHERE transaction_id IN (SELECT id FROM transactions WHERE is_seed = 1 OR owner_id IN ${seedOwners})`,
      `DELETE FROM transactions WHERE is_seed = 1 OR owner_id IN ${seedOwners}`,
      `DELETE FROM cart_items WHERE renter_id IN ${seedUsers}`,
      `DELETE FROM customers WHERE notes = '[DEMO SEED]' OR user_id IN ${seedUsers} OR owner_id IN ${seedOwners}`,
      `DELETE FROM item_images WHERE item_id IN (SELECT id FROM items WHERE ${seededItems} OR owner_id IN ${seedOwners})`,
      `DELETE FROM item_variants WHERE item_id IN (SELECT id FROM items WHERE ${seededItems} OR owner_id IN ${seedOwners})`,
      `DELETE FROM items WHERE ${seededItems} OR owner_id IN ${seedOwners}`,
      `DELETE FROM categories WHERE owner_id IN ${seedOwners}`,
      `DELETE FROM notifications WHERE user_id IN ${seedUsers}`,
      `DELETE FROM activity_logs WHERE actor_id IN ${seedUsers} OR target_user_id IN ${seedUsers}`,
      'DELETE FROM users WHERE is_seed = 1',
    ]) await conn.query(sql);
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
  }
  console.log('Purged previous demo data');
}

async function seedDemo() {
  const [[{ c }]] = await pool.query("SELECT COUNT(*) AS c FROM users WHERE is_seed = 1");
  if (c > 0) return console.log('Demo data already present (is_seed rows found) — skipping');
  const pw = await hash(DEMO_PASSWORD);
  const mkUser = async (role, name, email, shop = null, phone = null) => {
    const [r] = await pool.execute('INSERT INTO users (role, name, email, phone, shop_name, password_hash, is_seed) VALUES (?,?,?,?,?,?,1)', [role, name, email, phone, shop, pw]);
    return r.insertId;
  };

  // Reuse an existing shop owner instead of violating the single-owner constraint.
  const [[existingOwner]] = await pool.query("SELECT id FROM users WHERE role = 'owner' LIMIT 1");
  const owners = [existingOwner?.id ?? await mkUser('owner', 'Maria Santos', 'owner@demo.test', 'Santos Gowns & Suits', '0917-000-0001')];
  // Staff with different access roles so the Staff directory shows the range.
  const staffDemo = [['Rico Valdez', 'inventory,customers,transactions'], ['Tina Lim', 'customers,transactions'], ['Jun Cruz', 'inventory']];
  for (const [i, [n, perms]] of staffDemo.entries()) {
    const id = await mkUser('staff', n, `staff${i + 1}@demo.test`, null, `0917-000-010${i}`);
    await pool.execute('UPDATE users SET owner_id = ?, staff_permissions = ? WHERE id = ?', [owners[0], perms, id]);
  }
  const renterNames = ['Ana Reyes', 'Luis Garcia', 'Carla Mendoza', 'Paolo Ramos', 'Bea Navarro', 'Miguel Torres', 'Sofia Dela Cruz', 'Marco Villanueva', 'Isabel Aquino'];
  const renters = [];
  for (const [i, n] of renterNames.entries()) renters.push({ id: await mkUser('renter', n, `renter${i + 1}@demo.test`, null, `0918-000-00${i}0`), name: n, email: `renter${i + 1}@demo.test` });
  await pool.execute("UPDATE users SET status = 'suspended' WHERE email = 'renter8@demo.test'");
  await pool.execute("UPDATE users SET status = 'inactive' WHERE email = 'renter9@demo.test'");

  const variants = {}; // ownerId -> [{variantId, itemId, rental, buy}]
  const customers = {}; // ownerId -> [{id, userId}]
  for (const [oi, ownerId] of owners.entries()) {
    variants[ownerId] = []; customers[ownerId] = [];
    const catIds = {};
    for (const name of DEFAULT_CATEGORIES) {
      await pool.execute('INSERT IGNORE INTO categories (owner_id, name) VALUES (?,?)', [ownerId, name]);
    }
    const [cats] = await pool.execute('SELECT id, name FROM categories WHERE owner_id = ?', [ownerId]);
    cats.forEach((c) => { catIds[c.name] = c.id; });

    for (const [cat, items] of Object.entries(CATALOG)) {
      const mine = Object.keys(CATALOG); // the single shop carries the full catalog
      if (!mine.includes(cat)) continue;
      for (const [name, color, rent, buy] of items) {
        const [r] = await pool.execute(
          'INSERT INTO items (owner_id, category_id, name, description, color, rental_price, purchase_price, condition_status, is_published, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
          [ownerId, catIds[cat], name, `${name} — sample item for development. [DEMO SEED]`, color, rent, buy, pick(['new', 'good', 'good', 'fair']), `${day(-int(300, 420))} 09:00:00`]);
        await attachSamplePhotos(r.insertId, name);
        const sizes = cat === 'Accessories' ? ['One Size'] : ['S', 'M', 'L'];
        for (const size of sizes) {
          const [v] = await pool.execute('INSERT INTO item_variants (item_id, size, total_quantity) VALUES (?,?,?)', [r.insertId, size, int(3, 6)]);
          variants[ownerId].push({ variantId: v.insertId, itemId: r.insertId, rent, buy });
        }
      }
    }
    // customers: linked renter accounts + walk-ins
    for (const rt of renters) {
      const [r] = await pool.execute('INSERT INTO customers (owner_id, user_id, name, email, phone, notes, created_at) VALUES (?,?,?,?,?,?,?)', [ownerId, rt.id, rt.name, rt.email, '0918-000-0000', '[DEMO SEED]', `${day(-int(200, 400))} 10:00:00`]);
      customers[ownerId].push({ id: r.insertId, userId: rt.id });
    }
    const walkIns = ['Grace Lim', 'Ben Cruz', 'Joy Fernandez', 'Ramon Bautista', 'Lea Soriano', 'Dennis Pascual', 'Mae Castillo', 'Oscar Domingo'];
    for (const [i, n] of walkIns.entries()) {
      const [r] = await pool.execute('INSERT INTO customers (owner_id, name, phone, address, notes, created_at) VALUES (?,?,?,?,?,?)', [ownerId, `Walk-in: ${n}`, `0920-111-22${10 + i}`, `${int(10, 99)} Rizal St., Quezon City`, '[DEMO SEED]', `${day(-int(10, 250))} 10:00:00`]);
      customers[ownerId].push({ id: r.insertId, userId: null });
    }
  }

  // ---- transactions: ~14 months of history with mild growth + seasonality (prom/wedding season) ----
  const insertTx = async (ownerId, cust, v, o) => {
    const qty = o.qty ?? 1;
    const days = o.type === 'rental' ? Math.round((new Date(o.end) - new Date(o.start)) / 86400000) + 1 : 0;
    const amount = o.type === 'rental' ? v.rent * qty * days : v.buy * qty;
    const [r] = await pool.execute(
      `INSERT INTO transactions (owner_id, customer_id, variant_id, type, quantity, start_date, expected_return, actual_return, amount, status, payment_status, is_seed, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`,
      [ownerId, cust.id, v.variantId, o.type, qty, o.start ?? null, o.end ?? null, o.actual ?? null, amount, o.status, o.pay ?? 'unpaid', `${o.created} 12:00:00`]);
    if (o.pay === 'paid' || o.pay === 'partial') {
      const paid = o.pay === 'paid' ? amount : Math.round(amount / 2);
      await pool.execute('INSERT INTO payments (transaction_id, amount, method, paid_at, recorded_by) VALUES (?,?,?,?,?)', [r.insertId, paid, pick(['cash', 'gcash', 'bank']), `${o.paidOn ?? o.created} 13:00:00`, ownerId]);
    }
    if (o.type === 'purchase' && o.status === 'completed') await pool.execute('UPDATE item_variants SET total_quantity = total_quantity - ? WHERE id = ? AND total_quantity >= ?', [qty, v.variantId, qty]);
  };

  for (const ownerId of owners) {
    const vs = variants[ownerId]; const cs = customers[ownerId];
    for (let back = 420; back > 10; back -= int(1, 3)) {
      const start = day(-back);
      const month = new Date(start).getUTCMonth() + 1;
      const season = [3, 4, 5, 11, 12].includes(month) ? 1.6 : 1;
      const growth = 1 + (420 - back) / 700;
      if (rnd() > 0.55 * season * growth * 0.6) continue;
      const v = pick(vs); const cust = pick(cs);
      if (v.buy && rnd() < 0.4) {
        await insertTx(ownerId, cust, v, { type: 'purchase', status: 'completed', created: start, pay: 'paid' });
      } else {
        const end = day(-back + int(1, 4));
        await insertTx(ownerId, cust, v, { type: 'rental', status: 'completed', created: day(-back - int(2, 7)), start, end, actual: rnd() < 0.15 ? day(-back + int(5, 7)) : end, pay: 'paid', paidOn: start });
      }
    }
    // current state: active, overdue, due soon, approved (upcoming), pending
    const cust = (i) => cs[i % cs.length];
    await insertTx(ownerId, cust(0), vs[0], { type: 'rental', status: 'active', created: day(-6), start: day(-3), end: day(2), pay: 'partial', paidOn: day(-3) });
    await insertTx(ownerId, cust(1), vs[3], { type: 'rental', status: 'active', created: day(-12), start: day(-9), end: day(-2), pay: 'partial', paidOn: day(-9) });
    await insertTx(ownerId, cust(2), vs[5], { type: 'rental', status: 'active', created: day(-4), start: day(-1), end: day(1), pay: 'paid', paidOn: day(-1) });
    await insertTx(ownerId, cust(3), vs[7], { type: 'rental', status: 'approved', created: day(-2), start: day(5), end: day(8) });
    await insertTx(ownerId, cust(4), vs[2], { type: 'rental', status: 'pending', created: day(-1), start: day(10), end: day(12) });
    await insertTx(ownerId, cust(0), vs[4], { type: 'rental', status: 'pending', created: day(0), start: day(14), end: day(15) });
    const buyable = vs.find((x) => x.buy);
    if (buyable) await insertTx(ownerId, cust(1), buyable, { type: 'purchase', status: 'pending', created: day(0) });
    await insertTx(ownerId, cust(6), vs[1], { type: 'rental', status: 'pending', created: day(0), start: day(20), end: day(22) });
    await insertTx(ownerId, cust(5), vs[6], { type: 'rental', status: 'approved', created: day(-1), start: day(3), end: day(4) });

    // Purchases in every state + more customer activity, spread over walk-ins and renter accounts.
    const buyables = vs.filter((x) => x.buy);
    const bv = (i) => buyables[i % buyables.length];
    if (buyables.length) {
      for (let i = 0; i < 8; i++) await insertTx(ownerId, cust(i + 3), bv(i), { type: 'purchase', status: 'completed', created: day(-int(1, 40)), pay: 'paid', qty: i % 4 === 0 ? 2 : 1 });
      await insertTx(ownerId, cust(7), bv(1), { type: 'purchase', status: 'approved', created: day(-2), pay: 'partial', paidOn: day(-1) });
      await insertTx(ownerId, cust(8), bv(2), { type: 'purchase', status: 'approved', created: day(-1) });
      await insertTx(ownerId, cust(9), bv(3), { type: 'purchase', status: 'pending', created: day(0) });
      await insertTx(ownerId, cust(10), bv(4), { type: 'purchase', status: 'pending', created: day(-1), qty: 2 });
      await insertTx(ownerId, cust(11), bv(5), { type: 'purchase', status: 'cancelled', created: day(-9) });
      await insertTx(ownerId, cust(12), bv(6), { type: 'purchase', status: 'rejected', created: day(-6) });
    }
    for (let i = 0; i < 6; i++) { // recent returns (two of them late) and a few that never went through
      const st = -int(8, 30);
      await insertTx(ownerId, cust(i + 2), vs[(i * 3 + 1) % vs.length], { type: 'rental', status: 'completed', created: day(st - 3), start: day(st), end: day(st + 2), actual: i % 3 === 0 ? day(st + 5) : day(st + 2), pay: 'paid', paidOn: day(st) });
    }
    await insertTx(ownerId, cust(13), vs[2], { type: 'rental', status: 'rejected', created: day(-5), start: day(4), end: day(6) });
    await insertTx(ownerId, cust(14), vs[4], { type: 'rental', status: 'cancelled', created: day(-7), start: day(9), end: day(10) });
    await insertTx(ownerId, cust(9), vs[5], { type: 'rental', status: 'active', created: day(-3), start: day(-2), end: day(3), pay: 'paid', paidOn: day(-2) });
    await insertTx(ownerId, cust(10), vs[7], { type: 'rental', status: 'approved', created: day(-1), start: day(6), end: day(9), pay: 'partial', paidOn: day(0) });

    // Pre-filled carts so the renter Cart page has something to show (renter1 and renter2).
    const cartRows = [[0, vs[8], 'rental', 1, day(25), day(27)], [0, vs[9], 'rental', 2, day(25), day(27)], [1, vs[10], 'rental', 1, day(30), day(31)]];
    if (buyable) cartRows.push([1, buyable, 'purchase', 1, null, null]);
    for (const [ri, v, type, qty, a, b] of cartRows) {
      await pool.execute('INSERT INTO cart_items (renter_id, variant_id, type, quantity, start_date, expected_return) VALUES (?,?,?,?,?,?)', [renters[ri].id, v.variantId, type, qty, a, b]);
    }
  }
  console.log(`Demo data loaded. ${existingOwner ? 'Using the existing owner account' : 'Owner: owner@demo.test'} · Staff: staff1..3@demo.test · Renters: renter1..9@demo.test · demo password "${DEMO_PASSWORD}"`);
}

await ensureAdmin();
if (demo) {
  if (reset) await resetDemo();
  await seedDemo();
}
await pool.end();
