import { authenticate, mount, requireRole, requireShop, staffNeeds } from './router.js';
import { atomic, getDb, insert, logActivity } from './store.js';
import { find, itemCategory, reserved, shopName, urlFor } from './model.js';
import { badRequest, conflict, created, groupBy, HttpError, like, notFound, paged, paginate, stamp, today } from './util.js';
import { array, bool, date, id, idParam, int, number, object, oneOf, optStr, pageQuery, parse, string } from './validate.js';
import { fileToDataUrl } from './images.js';

const CONDITIONS = ['new', 'good', 'fair', 'needs_repair'];
const itemSchema = object({
  category_id: id(), name: string({ min: 2, max: 150 }), description: optStr(5000), color: optStr(40),
  rental_price: number({ min: 0, max: 1_000_000 }), purchase_price: number({ min: 0, max: 10_000_000, optional: true, nullable: true }),
  condition_status: oneOf(CONDITIONS, { default: 'good' }), is_published: bool({ default: true }),
  variants: array(object({ size: string({ min: 1, max: 20 }), total_quantity: int({ min: 0, max: 100000 }) }), {
    min: 1, max: 30, minMsg: 'At least one size is required',
    refine: (v) => (new Set(v.map((x) => x.size.toLowerCase())).size === v.length ? null : 'Duplicate sizes'),
  }),
});
const listItemsQuery = object({ ...pageQuery, q: string({ max: 100, optional: true }), category_id: int({ optional: true }), archived: oneOf(['0', '1'], { optional: true }) });
const categorySchema = object({ name: string({ min: 2, max: 80 }) });
const browseQuery = object({
  page: int({ min: 1, optional: true }), pageSize: int({ min: 1, max: 60, optional: true }), q: string({ max: 100, optional: true }),
  category: string({ max: 80, optional: true }), size: string({ max: 20, optional: true }), color: string({ max: 40, optional: true }),
  owner_id: int({ optional: true }), condition: oneOf(CONDITIONS, { optional: true }),
  min_rent: number({ min: 0, optional: true }), max_rent: number({ min: 0, optional: true }), min_buy: number({ min: 0, optional: true }), max_buy: number({ min: 0, optional: true }),
  available: oneOf(['0', '1'], { optional: true }), start: date({ plain: true, optional: true }), end: date({ plain: true, optional: true }),
  sort: oneOf(['newest', 'rent_asc', 'rent_desc', 'name'], { optional: true }),
});
const imgParams = object({ id: id(), imageId: id() });
const detailQuery = object({ start: string({ optional: true }), end: string({ optional: true }) });

/** Item + joins + live availability, shaped like the server's hydrate(). */
export function hydrate(item, { start = today(), end = start } = {}) {
  const db = getDb();
  const owner = find('users', item.owner_id);
  const variants = db.variants.filter((v) => v.item_id === item.id).sort((a, b) => a.id - b.id).map((v) => {
    const r = reserved(v.id, start, end);
    return { id: v.id, item_id: v.item_id, size: v.size, total_quantity: v.total_quantity, reserved: r, available: Math.max(0, v.total_quantity - r) };
  });
  const images = db.images.filter((i) => i.item_id === item.id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id - b.id)
    .map((i) => ({ id: i.id, item_id: i.item_id, path: i.path, is_primary: !!i.is_primary, url: urlFor(i, item) }));
  const total = variants.reduce((n, v) => n + v.total_quantity, 0);
  const available = variants.reduce((n, v) => n + v.available, 0);
  return {
    id: item.id, owner_id: item.owner_id, category_id: item.category_id, category: itemCategory(item), name: item.name, description: item.description,
    color: item.color, rental_price: item.rental_price, purchase_price: item.purchase_price, condition_status: item.condition_status,
    is_published: !!item.is_published, archived_at: item.archived_at, created_at: item.created_at, shop_name: owner.shop_name, owner_name: owner.name,
    variants, images, total_quantity: total, available_quantity: available,
    availability_status: item.archived_at ? 'archived' : !item.is_published ? 'unpublished' : available > 0 ? 'available' : 'unavailable',
  };
}

const newestFirst = (a, b) => b.id - a.id;
const ownerItem = (shopId, itemId) => {
  const it = getDb().items.find((i) => i.id === itemId && i.owner_id === shopId);
  if (!it) throw notFound('Item not found');
  return it;
};
const assertCategory = (shopId, categoryId) => {
  if (!getDb().categories.some((c) => c.id === categoryId && c.owner_id === shopId)) throw badRequest('Invalid category');
};
const dupName = () => new HttpError(409, 'A record with these details already exists');

function listCategories(shopId) {
  const db = getDb();
  return db.categories.filter((c) => c.owner_id === shopId).sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: c.name, item_count: db.items.filter((i) => i.category_id === c.id && !i.archived_at).length }));
}

const writeVariants = (itemId, incoming) => {
  const db = getDb();
  const want = new Map(incoming.map((v) => [v.size.toLowerCase(), v]));
  for (const ex of db.variants.filter((v) => v.item_id === itemId)) {
    const inc = want.get(ex.size.toLowerCase());
    if (inc) { want.delete(ex.size.toLowerCase()); ex.size = inc.size; ex.total_quantity = inc.total_quantity; continue; }
    if (db.transactions.some((t) => t.variant_id === ex.id)) throw conflict(`Size ${ex.size} has transaction history; set its quantity to 0 instead of removing it`);
    db.variants.splice(db.variants.indexOf(ex), 1);
  }
  want.forEach((v) => insert('variants', { item_id: itemId, size: v.size, total_quantity: v.total_quantity }));
};
const itemFields = (d) => ({
  category_id: d.category_id, name: d.name, description: d.description ?? null, color: d.color ?? null, rental_price: d.rental_price,
  purchase_price: d.purchase_price ?? null, condition_status: d.condition_status, is_published: !!d.is_published,
});

function setArchived(user, itemId, archived) {
  const item = ownerItem(user.shopId, itemId);
  const db = getDb();
  if (archived) {
    const vids = db.variants.filter((v) => v.item_id === item.id).map((v) => v.id);
    if (db.transactions.some((t) => vids.includes(t.variant_id) && ['pending', 'approved', 'active'].includes(t.status))) throw conflict('Item has pending, approved or active transactions');
  }
  item.archived_at = archived ? stamp() : null;
  logActivity({ actorId: user.id, action: archived ? 'INVENTORY_ARCHIVE' : 'INVENTORY_RESTORE', description: `${user.name} ${archived ? 'archived' : 'restored'} item "${item.name}"` });
  return { ok: true };
}

const MIME = ['image/jpeg', 'image/png', 'image/webp'];
async function addImages({ user, params, form }) {
  const { id: itemId } = parse(idParam, params);
  const files = (form?.getAll?.('images') ?? []).filter((f) => f instanceof Blob);
  if (!files.length) throw badRequest('No images uploaded');
  if (files.some((f) => !MIME.includes(f.type))) throw badRequest('Only JPG, PNG or WebP images are allowed');
  if (files.some((f) => f.size > 3 * 1024 * 1024)) throw badRequest('File too large');
  if (files.length > 5) throw badRequest('Unexpected field');
  const item = ownerItem(user.shopId, itemId);
  const paths = await Promise.all(files.map((f) => fileToDataUrl(f)));
  const db = getDb();
  let first = !db.images.some((i) => i.item_id === item.id && i.is_primary);
  paths.forEach((path) => { insert('images', { item_id: item.id, path, is_primary: first }); first = false; });
  return created(hydrate(item));
}

const browseItems = (f) => {
  const db = getDb();
  const rows = db.items.filter((i) => {
    const o = find('users', i.owner_id);
    if (!i.is_published || i.archived_at || o.status !== 'active') return false;
    if (f.q && ![i.name, i.description, i.color, o.shop_name].some((x) => like(x, f.q))) return false;
    if (f.category && itemCategory(i) !== f.category) return false;
    if (f.color && !like(i.color, f.color)) return false;
    if (f.owner_id && i.owner_id !== f.owner_id) return false;
    if (f.condition && i.condition_status !== f.condition) return false;
    if (f.min_rent != null && i.rental_price < f.min_rent) return false;
    if (f.max_rent != null && i.rental_price > f.max_rent) return false;
    if (f.min_buy != null && !(i.purchase_price != null && i.purchase_price >= f.min_buy)) return false;
    if (f.max_buy != null && !(i.purchase_price != null && i.purchase_price <= f.max_buy)) return false;
    if (f.size && !db.variants.some((v) => v.item_id === i.id && v.size === f.size)) return false;
    return true;
  });
  const order = { rent_asc: (a, b) => a.rental_price - b.rental_price, rent_desc: (a, b) => b.rental_price - a.rental_price, name: (a, b) => a.name.localeCompare(b.name) }[f.sort] ?? newestFirst;
  return rows.sort(order);
};

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
function facets() {
  const db = getDb();
  const live = db.items.filter((i) => i.is_published && !i.archived_at && find('users', i.owner_id).status === 'active');
  const tally = (pairs) => [...groupBy(pairs, (p) => p[0])].map(([name, rows]) => ({ name, count: new Set(rows.map((r) => r[1])).size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const nums = (f) => live.map(f).filter((v) => v != null);
  const ext = (a, fn) => (a.length ? fn(...a) : null);
  return {
    categories: tally(live.map((i) => [itemCategory(i), i.id])),
    colors: tally(live.filter((i) => i.color).map((i) => [i.color, i.id])),
    sizes: tally(db.variants.filter((v) => live.some((i) => i.id === v.item_id)).map((v) => [v.size, v.item_id]))
      .sort((a, b) => SIZE_ORDER.indexOf(a.name) - SIZE_ORDER.indexOf(b.name) || a.name.localeCompare(b.name)),
    price: { min_rent: ext(nums((i) => i.rental_price), Math.min), max_rent: ext(nums((i) => i.rental_price), Math.max), min_buy: ext(nums((i) => i.purchase_price), Math.min), max_buy: ext(nums((i) => i.purchase_price), Math.max) },
  };
}

const viewers = requireRole('renter', 'owner', 'staff', 'admin');
const canViewStock = (ctx) => (ctx.user.role === 'staff' && ctx.user.permissions.includes('transactions') ? undefined : staffNeeds('inventory')(ctx));
const manageGuard = (ctx) => (ctx.method === 'GET' ? canViewStock(ctx) : staffNeeds('inventory')(ctx));
const owner = requireRole('owner');

export const routes = mount('/inventory', [authenticate], [
  // ---- shop: inventory CRUD ----
  ['GET', '/manage/items', [requireShop, manageGuard], ({ user, query }) => {
    const f = parse(listItemsQuery, query); const p = paginate(f);
    const rows = getDb().items.filter((i) => i.owner_id === user.shopId && (f.archived === '1' ? i.archived_at : !i.archived_at)
      && (!f.q || like(i.name, f.q) || like(i.color, f.q)) && (!f.category_id || i.category_id === f.category_id)).sort(newestFirst);
    return paged(rows, p, (i) => hydrate(i));
  }],
  ['POST', '/manage/items', [requireShop, manageGuard], ({ user, body }) => {
    const d = parse(itemSchema, body);
    assertCategory(user.shopId, d.category_id);
    const item = insert('items', { owner_id: user.shopId, ...itemFields(d), archived_at: null, created_at: stamp() });
    writeVariants(item.id, d.variants);
    logActivity({ actorId: user.id, action: 'INVENTORY_CREATE', description: `${user.name} added item "${d.name}"` });
    return created(hydrate(item));
  }],
  ['GET', '/manage/items/:id', [requireShop, manageGuard], ({ user, params }) => hydrate(ownerItem(user.shopId, parse(idParam, params).id))],
  ['PUT', '/manage/items/:id', [requireShop, manageGuard], ({ user, params, body }) => {
    const { id: itemId } = parse(idParam, params); const d = parse(itemSchema, body);
    const item = ownerItem(user.shopId, itemId);
    return atomic(() => {
      assertCategory(user.shopId, d.category_id);
      Object.assign(item, itemFields(d));
      writeVariants(item.id, d.variants);
      logActivity({ actorId: user.id, action: 'INVENTORY_UPDATE', description: `${user.name} updated item "${d.name}"` });
      return hydrate(item);
    });
  }],
  ['DELETE', '/manage/items/:id', [requireShop, manageGuard, owner], ({ user, params }) => setArchived(user, parse(idParam, params).id, true)],
  ['POST', '/manage/items/:id/restore', [requireShop, manageGuard, owner], ({ user, params }) => setArchived(user, parse(idParam, params).id, false)],
  ['POST', '/manage/items/:id/images', [requireShop, manageGuard], addImages],
  ['PUT', '/manage/items/:id/images/:imageId/primary', [requireShop, manageGuard], ({ user, params }) => {
    const p = parse(imgParams, params); const item = ownerItem(user.shopId, p.id);
    const imgs = getDb().images.filter((i) => i.item_id === item.id);
    if (!imgs.some((i) => i.id === p.imageId)) throw notFound('Image not found');
    imgs.forEach((i) => { i.is_primary = i.id === p.imageId; });
    return hydrate(item);
  }],
  ['DELETE', '/manage/items/:id/images/:imageId', [requireShop, manageGuard], ({ user, params }) => {
    const p = parse(imgParams, params); const item = ownerItem(user.shopId, p.id);
    const db = getDb(); const img = db.images.find((i) => i.id === p.imageId && i.item_id === item.id);
    if (!img) throw notFound('Image not found');
    db.images.splice(db.images.indexOf(img), 1);
    const rest = db.images.filter((i) => i.item_id === item.id);
    if (img.is_primary && rest.length) rest[0].is_primary = true;
    return hydrate(item);
  }],
  ['GET', '/manage/categories', [requireShop, manageGuard], ({ user }) => listCategories(user.shopId)],
  ['POST', '/manage/categories', [requireShop, manageGuard, owner], ({ user, body }) => {
    const { name } = parse(categorySchema, body);
    if (getDb().categories.some((c) => c.owner_id === user.shopId && c.name.toLowerCase() === name.toLowerCase())) throw dupName();
    insert('categories', { owner_id: user.shopId, name });
    return created(listCategories(user.shopId));
  }],
  ['PUT', '/manage/categories/:id', [requireShop, manageGuard, owner], ({ user, params, body }) => {
    const { id: cid } = parse(idParam, params); const { name } = parse(categorySchema, body);
    const db = getDb(); const cat = db.categories.find((c) => c.id === cid && c.owner_id === user.shopId);
    if (!cat) throw notFound('Category not found');
    if (db.categories.some((c) => c.id !== cid && c.owner_id === user.shopId && c.name.toLowerCase() === name.toLowerCase())) throw dupName();
    cat.name = name;
    return listCategories(user.shopId);
  }],
  ['DELETE', '/manage/categories/:id', [requireShop, manageGuard, owner], ({ user, params }) => {
    const { id: cid } = parse(idParam, params); const db = getDb();
    if (db.items.some((i) => i.category_id === cid)) throw conflict('Category still has items (including archived). Move them first.');
    const cat = db.categories.find((c) => c.id === cid && c.owner_id === user.shopId);
    if (!cat) throw notFound('Category not found');
    db.categories.splice(db.categories.indexOf(cat), 1);
    return listCategories(user.shopId);
  }],

  // ---- catalogue (all roles) ----
  ['GET', '/catalog', [viewers], ({ query }) => {
    const f = parse(browseQuery, query); const p = paginate(f, 12, 60);
    const start = f.start || today(); const end = f.end || start;
    let rows = browseItems(f).map((i) => hydrate(i, { start, end }));
    if (f.available === '1') rows = rows.filter((i) => i.available_quantity > 0);
    return paged(rows.slice(0), p);
  }],
  ['GET', '/catalog/facets', [viewers], () => facets()],
  ['GET', '/catalog/shops', [viewers], () => getDb().users
    .filter((u) => u.role === 'owner' && u.status === 'active' && getDb().items.some((i) => i.owner_id === u.id && i.is_published && !i.archived_at))
    .map((u) => ({ id: u.id, name: shopName(u) })).sort((a, b) => a.name.localeCompare(b.name))],
  ['GET', '/catalog/:id', [viewers], ({ params, query }) => {
    const { id: itemId } = parse(idParam, params); const q = parse(detailQuery, query);
    const item = getDb().items.find((i) => i.id === itemId);
    const o = item && find('users', item.owner_id);
    if (!item || !item.is_published || item.archived_at || o.status !== 'active') throw notFound('Item not found');
    return { ...hydrate(item, { start: q.start || today(), end: q.end || q.start || today() }), owner_phone: o.phone, owner_address: o.address };
  }],

  // ---- admin oversight ----
  ['GET', '/admin/items', [requireRole('admin')], ({ query }) => {
    const f = parse(listItemsQuery, query); const p = paginate(f);
    const rows = getDb().items.filter((i) => { const o = find('users', i.owner_id); return !f.q || [i.name, o.shop_name, o.name].some((x) => like(x, f.q)); }).sort(newestFirst);
    return paged(rows, p, (i) => hydrate(i));
  }],
]);

