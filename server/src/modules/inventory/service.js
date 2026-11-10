import fs from 'node:fs/promises';
import path from 'node:path';
import { q, q1, withTransaction, pool } from '../../config/db.js';
import { notFound, badRequest, conflict } from '../../utils/http.js';
import { logActivity } from '../../utils/audit.js';
import { variantsWithAvailability, today } from './availability.js';

export const DEFAULT_CATEGORIES = ['Gowns', 'Suits', 'Costumes', 'Traditional Wear', 'Accessories', 'Other'];
export const UPLOAD_DIR = path.resolve('uploads');

export async function ensureDefaultCategories(ownerId, conn) {
  for (const name of DEFAULT_CATEGORIES) {
    await q('INSERT IGNORE INTO categories (owner_id, name) VALUES (?,?)', [ownerId, name], conn);
  }
}

/** Attach images + variants (with live availability) to item rows. */
async function hydrate(items, { start = today(), end = start } = {}) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id);
  const ph = ids.map(() => '?').join(',');
  const [variants, images] = await Promise.all([
    variantsWithAvailability(ids, start, end),
    q(`SELECT id, item_id, path, is_primary FROM item_images WHERE item_id IN (${ph}) ORDER BY is_primary DESC, id`, ids),
  ]);
  return items.map((it) => {
    const vs = variants.filter((v) => v.item_id === it.id);
    const total = vs.reduce((s, v) => s + v.total_quantity, 0);
    const available = vs.reduce((s, v) => s + v.available, 0);
    return {
      ...it,
      is_published: !!it.is_published,
      variants: vs,
      images: images.filter((i) => i.item_id === it.id).map((i) => ({ ...i, is_primary: !!i.is_primary, url: `/uploads/${i.path}` })),
      total_quantity: total,
      available_quantity: available,
      availability_status: it.archived_at ? 'archived' : !it.is_published ? 'unpublished' : available > 0 ? 'available' : 'unavailable',
    };
  });
}

const ITEM_COLS = `i.id, i.owner_id, i.category_id, c.name AS category, i.name, i.description, i.color,
  i.rental_price, i.purchase_price, i.condition_status, i.is_published, i.archived_at, i.created_at,
  u.shop_name, u.name AS owner_name`;
const ITEM_FROM = `FROM items i JOIN categories c ON c.id = i.category_id JOIN users u ON u.id = i.owner_id`;

// ---------- Owner ----------
export async function listOwnerItems(ownerId, { limit, offset }, f) {
  const where = ['i.owner_id = ?', f.archived === '1' ? 'i.archived_at IS NOT NULL' : 'i.archived_at IS NULL'];
  const params = [ownerId];
  if (f.q) { where.push('(i.name LIKE ? OR i.color LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }
  if (f.category_id) { where.push('i.category_id = ?'); params.push(f.category_id); }
  const w = where.join(' AND ');
  const [{ total }] = await q(`SELECT COUNT(*) AS total ${ITEM_FROM} WHERE ${w}`, params);
  const rows = await q(`SELECT ${ITEM_COLS} ${ITEM_FROM} WHERE ${w} ORDER BY i.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  return { rows: await hydrate(rows), total };
}

export async function getOwnerItem(ownerId, id) {
  const row = await q1(`SELECT ${ITEM_COLS} ${ITEM_FROM} WHERE i.id = ? AND i.owner_id = ?`, [id, ownerId]);
  if (!row) throw notFound('Item not found');
  return (await hydrate([row]))[0];
}

async function assertCategory(conn, ownerId, categoryId) {
  const cat = await q1('SELECT id FROM categories WHERE id = ? AND owner_id = ?', [categoryId, ownerId], conn);
  if (!cat) throw badRequest('Invalid category');
}

export async function createItem(user, data) {
  const id = await withTransaction(async (conn) => {
    await assertCategory(conn, user.shopId, data.category_id);
    const [res] = await conn.execute(
      `INSERT INTO items (owner_id, category_id, name, description, color, rental_price, purchase_price, condition_status, is_published)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [user.shopId, data.category_id, data.name, data.description ?? null, data.color ?? null, data.rental_price,
       data.purchase_price ?? null, data.condition_status, data.is_published ? 1 : 0]
    );
    for (const v of data.variants) {
      await conn.execute('INSERT INTO item_variants (item_id, size, total_quantity) VALUES (?,?,?)', [res.insertId, v.size, v.total_quantity]);
    }
    return res.insertId;
  });
  await logActivity({ actorId: user.id, action: 'INVENTORY_CREATE', description: `${user.name} added item "${data.name}"` });
  return getOwnerItem(user.shopId, id);
}

export async function updateItem(user, id, data) {
  await withTransaction(async (conn) => {
    const item = await q1('SELECT id FROM items WHERE id = ? AND owner_id = ? FOR UPDATE', [id, user.shopId], conn);
    if (!item) throw notFound('Item not found');
    await assertCategory(conn, user.shopId, data.category_id);
    await conn.execute(
      `UPDATE items SET category_id=?, name=?, description=?, color=?, rental_price=?, purchase_price=?, condition_status=?, is_published=? WHERE id=?`,
      [data.category_id, data.name, data.description ?? null, data.color ?? null, data.rental_price,
       data.purchase_price ?? null, data.condition_status, data.is_published ? 1 : 0, id]
    );
    // Sync variants: update by size, insert new, remove only those with no transaction history.
    const existing = await q('SELECT id, size FROM item_variants WHERE item_id = ?', [id], conn);
    const incoming = new Map(data.variants.map((v) => [v.size.toLowerCase(), v]));
    for (const ex of existing) {
      const inc = incoming.get(ex.size.toLowerCase());
      if (inc) {
        await conn.execute('UPDATE item_variants SET size=?, total_quantity=? WHERE id=?', [inc.size, inc.total_quantity, ex.id]);
        incoming.delete(ex.size.toLowerCase());
      } else {
        const used = await q1('SELECT 1 AS x FROM transactions WHERE variant_id = ? LIMIT 1', [ex.id], conn);
        if (used) throw conflict(`Size ${ex.size} has transaction history; set its quantity to 0 instead of removing it`);
        await conn.execute('DELETE FROM item_variants WHERE id = ?', [ex.id]);
      }
    }
    for (const v of incoming.values()) {
      await conn.execute('INSERT INTO item_variants (item_id, size, total_quantity) VALUES (?,?,?)', [id, v.size, v.total_quantity]);
    }
  });
  await logActivity({ actorId: user.id, action: 'INVENTORY_UPDATE', description: `${user.name} updated item "${data.name}"` });
  return getOwnerItem(user.shopId, id);
}

export async function setArchived(user, id, archived) {
  const item = await q1('SELECT name FROM items WHERE id = ? AND owner_id = ?', [id, user.shopId]);
  if (!item) throw notFound('Item not found');
  if (archived) {
    const open = await q1(
      `SELECT 1 AS x FROM transactions t JOIN item_variants v ON v.id = t.variant_id
       WHERE v.item_id = ? AND t.status IN ('pending','approved','active') LIMIT 1`, [id]);
    if (open) throw conflict('Item has pending, approved or active transactions');
  }
  await q('UPDATE items SET archived_at = ? WHERE id = ?', [archived ? new Date() : null, id]);
  await logActivity({ actorId: user.id, action: archived ? 'INVENTORY_ARCHIVE' : 'INVENTORY_RESTORE', description: `${user.name} ${archived ? 'archived' : 'restored'} item "${item.name}"` });
}

export async function addImages(user, id, files) {
  const item = await q1('SELECT id FROM items WHERE id = ? AND owner_id = ?', [id, user.shopId]);
  if (!item) {
    await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})));
    throw notFound('Item not found');
  }
  const hasPrimary = await q1('SELECT 1 AS x FROM item_images WHERE item_id = ? AND is_primary = 1', [id]);
  let first = !hasPrimary;
  for (const f of files) {
    await q('INSERT INTO item_images (item_id, path, is_primary) VALUES (?,?,?)', [id, f.filename, first ? 1 : 0]);
    first = false;
  }
  return getOwnerItem(user.shopId, id);
}

export async function setPrimaryImage(user, id, imageId) {
  await getOwnerItem(user.shopId, id);
  await withTransaction(async (conn) => {
    await q('UPDATE item_images SET is_primary = 0 WHERE item_id = ?', [id], conn);
    const [r] = await conn.execute('UPDATE item_images SET is_primary = 1 WHERE id = ? AND item_id = ?', [imageId, id]);
    if (!r.affectedRows) throw notFound('Image not found');
  });
  return getOwnerItem(user.shopId, id);
}

export async function deleteImage(user, id, imageId) {
  await getOwnerItem(user.shopId, id);
  const img = await q1('SELECT * FROM item_images WHERE id = ? AND item_id = ?', [imageId, id]);
  if (!img) throw notFound('Image not found');
  await q('DELETE FROM item_images WHERE id = ?', [imageId]);
  await fs.unlink(path.join(UPLOAD_DIR, path.basename(img.path))).catch(() => {});
  if (img.is_primary) await q('UPDATE item_images SET is_primary = 1 WHERE item_id = ? ORDER BY id LIMIT 1', [id]);
  return getOwnerItem(user.shopId, id);
}

// ---------- Categories (per owner) ----------
export const listCategories = (ownerId) =>
  q(`SELECT c.id, c.name, (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id AND i.archived_at IS NULL) AS item_count
     FROM categories c WHERE c.owner_id = ? ORDER BY c.name`, [ownerId]);

export async function createCategory(ownerId, name) {
  await q('INSERT INTO categories (owner_id, name) VALUES (?,?)', [ownerId, name]);
  return listCategories(ownerId);
}
export async function renameCategory(ownerId, id, name) {
  const [r] = await pool.execute('UPDATE categories SET name = ? WHERE id = ? AND owner_id = ?', [name, id, ownerId]);
  if (!r.affectedRows) throw notFound('Category not found');
  return listCategories(ownerId);
}
export async function deleteCategory(ownerId, id) {
  const used = await q1('SELECT 1 AS x FROM items WHERE category_id = ? LIMIT 1', [id]);
  if (used) throw conflict('Category still has items (including archived). Move them first.');
  const [r] = await pool.execute('DELETE FROM categories WHERE id = ? AND owner_id = ?', [id, ownerId]);
  if (!r.affectedRows) throw notFound('Category not found');
  return listCategories(ownerId);
}

// ---------- Renter catalog (read-only) & admin oversight ----------
export async function browseCatalog({ limit, offset }, f) {
  const where = ['i.is_published = 1', 'i.archived_at IS NULL', "u.status = 'active'"];
  const params = [];
  if (f.q) { where.push('(i.name LIKE ? OR i.description LIKE ? OR i.color LIKE ? OR u.shop_name LIKE ?)'); params.push(...Array(4).fill(`%${f.q}%`)); }
  if (f.category) { where.push('c.name = ?'); params.push(f.category); }
  if (f.color) { where.push('i.color LIKE ?'); params.push(`%${f.color}%`); }
  if (f.owner_id) { where.push('i.owner_id = ?'); params.push(f.owner_id); }
  if (f.condition) { where.push('i.condition_status = ?'); params.push(f.condition); }
  if (f.min_rent != null) { where.push('i.rental_price >= ?'); params.push(f.min_rent); }
  if (f.max_rent != null) { where.push('i.rental_price <= ?'); params.push(f.max_rent); }
  if (f.min_buy != null) { where.push('i.purchase_price >= ?'); params.push(f.min_buy); }
  if (f.max_buy != null) { where.push('i.purchase_price <= ?'); params.push(f.max_buy); }
  if (f.size) { where.push('EXISTS (SELECT 1 FROM item_variants v WHERE v.item_id = i.id AND v.size = ?)'); params.push(f.size); }
  const w = where.join(' AND ');
  const order = { rent_asc: 'i.rental_price ASC', rent_desc: 'i.rental_price DESC', name: 'i.name ASC' }[f.sort] || 'i.id DESC';
  const start = f.start || today();
  const end = f.end || start;

  // "available" filter needs computed stock, so filter after hydrate when requested.
  if (f.available === '1') {
    const all = await q(`SELECT ${ITEM_COLS} ${ITEM_FROM} WHERE ${w} ORDER BY ${order}`, params);
    const hydrated = (await hydrate(all, { start, end })).filter((i) => i.available_quantity > 0);
    return { rows: hydrated.slice(offset, offset + limit), total: hydrated.length };
  }
  const [{ total }] = await q(`SELECT COUNT(*) AS total ${ITEM_FROM} WHERE ${w}`, params);
  const rows = await q(`SELECT ${ITEM_COLS} ${ITEM_FROM} WHERE ${w} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
  return { rows: await hydrate(rows, { start, end }), total };
}

export async function getCatalogItem(id, { start, end } = {}) {
  const row = await q1(
    `SELECT ${ITEM_COLS}, u.phone AS owner_phone, u.address AS owner_address ${ITEM_FROM}
     WHERE i.id = ? AND i.is_published = 1 AND i.archived_at IS NULL AND u.status = 'active'`, [id]);
  if (!row) throw notFound('Item not found');
  return (await hydrate([row], { start: start || today(), end: end || start || today() }))[0];
}

/** Filter options for the renter catalogue, built from what is actually published (so the UI never offers empty choices). */
export async function catalogFacets() {
  const base = "i.is_published = 1 AND i.archived_at IS NULL AND u.status = 'active'";
  const from = 'FROM items i JOIN users u ON u.id = i.owner_id';
  const [categories, colors, sizes, [range]] = await Promise.all([
    q(`SELECT c.name, COUNT(*) AS count ${from} JOIN categories c ON c.id = i.category_id WHERE ${base} GROUP BY c.name ORDER BY count DESC, c.name`),
    q(`SELECT i.color AS name, COUNT(*) AS count ${from} WHERE ${base} AND i.color IS NOT NULL AND i.color <> '' GROUP BY i.color ORDER BY count DESC, i.color`),
    q(`SELECT v.size AS name, COUNT(DISTINCT i.id) AS count ${from} JOIN item_variants v ON v.item_id = i.id WHERE ${base} GROUP BY v.size ORDER BY FIELD(v.size,'XS','S','M','L','XL','XXL'), v.size`),
    q(`SELECT MIN(i.rental_price) AS min_rent, MAX(i.rental_price) AS max_rent, MIN(i.purchase_price) AS min_buy, MAX(i.purchase_price) AS max_buy ${from} WHERE ${base}`),
  ]);
  return { categories, colors, sizes, price: range };
}

export const listShops = () =>
  q(`SELECT u.id, COALESCE(u.shop_name, u.name) AS name FROM users u
     WHERE u.role = 'owner' AND u.status = 'active'
       AND EXISTS (SELECT 1 FROM items i WHERE i.owner_id = u.id AND i.is_published = 1 AND i.archived_at IS NULL)
     ORDER BY name`);

export async function adminListItems({ limit, offset }, f) {
  const where = ['1=1']; const params = [];
  if (f.q) { where.push('(i.name LIKE ? OR u.shop_name LIKE ? OR u.name LIKE ?)'); params.push(...Array(3).fill(`%${f.q}%`)); }
  const w = where.join(' AND ');
  const [{ total }] = await q(`SELECT COUNT(*) AS total ${ITEM_FROM} WHERE ${w}`, params);
  const rows = await q(`SELECT ${ITEM_COLS} ${ITEM_FROM} WHERE ${w} ORDER BY i.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  return { rows: await hydrate(rows), total };
}
