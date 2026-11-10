import { Router } from 'express';
import { z } from 'zod';
import { q, q1, pool } from '../../config/db.js';
import { authenticate, requireRole, requireShop, staffNeeds } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler, paginate, pageResult, notFound, conflict } from '../../utils/http.js';
import { logActivity } from '../../utils/audit.js';
import { listTransactions, scopes } from '../transactions/service.js';
import { listQuery as txListQuery } from '../transactions/schema.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().toLowerCase().email().max(191).optional().nullable().or(z.literal('').transform(() => null)),
  address: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(100).optional(),
  source: z.enum(['account', 'walkin']).optional(), // linked renter account vs manually registered
  sort: z.enum(['name', 'newest', 'spent']).optional(),
});

const STATS = `
  (SELECT COUNT(*) FROM transactions t WHERE t.customer_id = c.id) AS total_transactions,
  (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN transactions t ON t.id = p.transaction_id WHERE t.customer_id = c.id) AS total_paid,
  (SELECT COUNT(*) FROM transactions t WHERE t.customer_id = c.id AND t.type='rental' AND t.status='active' AND t.expected_return < CURDATE()) AS overdue_count`;

const router = Router();
router.use(authenticate);
// Customer data: staff need 'customers' (or 'transactions' to look a customer up when recording a sale).
router.use((req, res, next) => (req.method === 'GET' && req.user.role === 'staff' && req.user.permissions.includes('transactions') ? next() : staffNeeds('customers')(req, res, next)));

router.get('/', requireRole('owner', 'staff', 'admin'), validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query);
  const f = req.query;
  const where = [req.user.isShop ? 'c.owner_id = ?' : '1=1']; const params = req.user.isShop ? [req.user.shopId] : [];
  if (f.q) { where.push('(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)'); params.push(...Array(3).fill(`%${f.q}%`)); }
  if (f.source === 'account') where.push('c.user_id IS NOT NULL');
  if (f.source === 'walkin') where.push('c.user_id IS NULL');
  const order = { name: 'c.name ASC', spent: 'total_paid DESC' }[f.sort] || 'c.id DESC';
  const w = where.join(' AND ');
  const [{ total }] = await q(`SELECT COUNT(*) AS total FROM customers c WHERE ${w}`, params);
  const rows = await q(
    `SELECT c.id, c.owner_id, c.user_id, c.name, c.phone, c.email, c.address, c.created_at, ${STATS},
       COALESCE(o.shop_name, o.name) AS shop_name
     FROM customers c JOIN users o ON o.id = c.owner_id WHERE ${w} ORDER BY ${order} LIMIT ${p.limit} OFFSET ${p.offset}`, params);
  res.json(pageResult(rows, total, p));
}));

/** Directory of registered renter accounts (platform-wide sign-ups), with this shop's history per renter. Read-only. */
const renterQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(100).optional(), status: z.enum(['active', 'inactive', 'suspended']).optional(),
});
router.get('/renters', requireShop, validate({ query: renterQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query); const f = req.query;
  const where = ["u.role = 'renter'"]; const params = [];
  if (f.status) { where.push('u.status = ?'); params.push(f.status); }
  if (f.q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); params.push(...Array(3).fill(`%${f.q}%`)); }
  const w = where.join(' AND ');
  const [{ total }] = await q(`SELECT COUNT(*) AS total FROM users u WHERE ${w}`, params);
  const rows = await q(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at,
       c.id AS customer_id,
       (SELECT COUNT(*) FROM transactions t WHERE t.customer_id = c.id) AS total_transactions,
       (SELECT MAX(t.created_at) FROM transactions t WHERE t.customer_id = c.id) AS last_activity
     FROM users u LEFT JOIN customers c ON c.user_id = u.id AND c.owner_id = ?
     WHERE ${w} ORDER BY u.id DESC LIMIT ${p.limit} OFFSET ${p.offset}`, [req.user.shopId, ...params]);
  res.json(pageResult(rows, total, p));
}));

router.post('/', requireShop, validate({ body: customerSchema }), asyncHandler(async (req, res) => {
  const d = req.body;
  const [r] = await pool.execute(
    'INSERT INTO customers (owner_id, name, phone, email, address, notes) VALUES (?,?,?,?,?,?)',
    [req.user.shopId, d.name, d.phone ?? null, d.email ?? null, d.address ?? null, d.notes ?? null]);
  await logActivity({ actorId: req.user.id, action: 'CUSTOMER_CREATE', description: `${req.user.name} registered customer ${d.name}` });
  res.status(201).json(await q1('SELECT * FROM customers WHERE id = ?', [r.insertId]));
}));

const ownedCustomer = async (req) => {
  const where = req.user.isShop ? 'AND c.owner_id = ?' : '';
  const c = await q1(`SELECT c.*, ${STATS} FROM customers c WHERE c.id = ? ${where}`, req.user.isShop ? [req.params.id, req.user.shopId] : [req.params.id]);
  if (!c) throw notFound('Customer not found');
  return c;
};

router.get('/:id', requireRole('owner', 'staff', 'admin'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await ownedCustomer(req))));

// Customer profile transaction history (owner-scoped, filterable, paginated)
router.get('/:id/transactions', requireRole('owner', 'staff', 'admin'), validate({ params: idParam, query: txListQuery }), asyncHandler(async (req, res) => {
  await ownedCustomer(req);
  const p = paginate(req.query);
  const scope = req.user.isShop ? scopes.owner(req.user.shopId) : scopes.admin();
  const { rows, total } = await listTransactions(scope, p, { ...req.query, customer_id: req.params.id });
  res.json(pageResult(rows, total, p));
}));

router.put('/:id', requireShop, validate({ params: idParam, body: customerSchema }), asyncHandler(async (req, res) => {
  const c = await ownedCustomer(req);
  const d = req.body;
  await q('UPDATE customers SET name=?, phone=?, email=?, address=?, notes=? WHERE id=? AND owner_id=?',
    [d.name, d.phone ?? null, d.email ?? null, d.address ?? null, d.notes ?? null, c.id, req.user.shopId]);
  await logActivity({ actorId: req.user.id, action: 'CUSTOMER_UPDATE', description: `${req.user.name} updated customer ${d.name}` });
  res.json(await ownedCustomer(req));
}));

router.delete('/:id', requireRole('owner'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  const c = await ownedCustomer(req);
  if (c.total_transactions > 0) throw conflict('This customer has transaction history and cannot be deleted');
  await q('DELETE FROM customers WHERE id = ? AND owner_id = ?', [c.id, req.user.shopId]);
  await logActivity({ actorId: req.user.id, action: 'CUSTOMER_DELETE', description: `${req.user.name} deleted customer ${c.name}` });
  res.json({ ok: true });
}));

export default router;
