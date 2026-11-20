/** Read model shared by handlers: joins, availability, scoping. Mirrors the server's SQL (availability.js, transactions/service.js). */
import { getDb } from './store.js';
import { diffDays, today } from './util.js';
import { imageUrl } from './images.js';

export const PERMISSIONS = ['inventory', 'customers', 'transactions'];
export const parsePermissions = (csv) => (csv ? csv.split(',').filter((p) => PERMISSIONS.includes(p)) : []);
export const serializePermissions = (list) => PERMISSIONS.filter((p) => list.includes(p)).join(',');
export const permissionsFor = (u) => (u.role === 'owner' ? [...PERMISSIONS] : u.role === 'staff' ? parsePermissions(u.staff_permissions) : []);

export const find = (table, id) => getDb()[table].find((r) => r.id === Number(id));
export const shopName = (u) => u.shop_name || u.name;

/**
 * Units reserved for a variant over [start, end]: approved/active rentals overlapping the window (an active rental past its
 * return date keeps reserving) plus approved purchases. Availability is derived, never stored.
 */
export function reserved(variantId, start = today(), end = start, ignoreTxId = 0) {
  const t0 = today();
  return getDb().transactions.reduce((n, t) => {
    if (t.variant_id !== variantId || t.id === ignoreTxId) return n;
    const hit = t.type === 'rental'
      ? ['approved', 'active'].includes(t.status) && t.start_date <= end && (t.status === 'active' && t.expected_return < t0 ? t0 : t.expected_return) >= start
      : t.status === 'approved';
    return hit ? n + t.quantity : n;
  }, 0);
}
export const availableOf = (variant, start, end, ignore) => Math.max(0, variant.total_quantity - reserved(variant.id, start, end, ignore));

export const primaryImage = (itemId) => {
  const imgs = getDb().images.filter((i) => i.item_id === itemId).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id - b.id);
  return imgs[0] ?? null;
};
export const itemCategory = (item) => find('categories', item.category_id)?.name ?? '';
export const urlFor = (img, item) => imageUrl(img, item, itemCategory(item));

/** Transaction + customer/item/category/shop joins (the server's SELECT), with the derived columns. */
export function txRow(t) {
  const db = getDb();
  const c = find('customers', t.customer_id);
  const v = find('variants', t.variant_id);
  const i = find('items', v.item_id);
  const cat = find('categories', i.category_id);
  const o = find('users', t.owner_id);
  const img = primaryImage(i.id);
  const overdue = t.type === 'rental' && t.status === 'active' && t.expected_return < today();
  return {
    id: t.id, owner_id: t.owner_id, customer_id: t.customer_id, variant_id: t.variant_id, type: t.type, quantity: t.quantity,
    start_date: t.start_date, expected_return: t.expected_return, actual_return: t.actual_return, amount: t.amount, status: t.status,
    payment_status: t.payment_status, notes: t.notes, created_at: t.created_at, updated_at: t.updated_at,
    customer_name: c.name, customer_phone: c.phone, renter_user_id: c.user_id,
    item_id: i.id, item_name: i.name, rental_price: i.rental_price, purchase_price: i.purchase_price, category_id: cat.id, category: cat.name,
    size: v.size, shop_name: shopName(o), image: img?.path ?? null,
    duration_days: t.type === 'rental' ? diffDays(t.actual_return ?? t.expected_return, t.start_date) + 1 : null,
    is_overdue: overdue, display_status: overdue ? 'overdue' : t.status,
    amount_paid: db.payments.filter((p) => p.transaction_id === t.id).reduce((n, p) => n + p.amount, 0),
    image_url: img ? urlFor(img, i) : null,
  };
}

/** Which transactions a user may see: shop users share the owner's scope; renters only their own; admin everything. */
export const scopeFor = (user) => (t) => {
  if (user.isShop) return t.owner_id === user.shopId;
  if (user.role === 'renter') return find('customers', t.customer_id)?.user_id === user.id;
  return true;
};

export const isOverdue = (t) => t.type === 'rental' && t.status === 'active' && t.expected_return < today();
