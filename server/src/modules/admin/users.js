import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, serializePermissions } from '../../utils/permissions.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q, q1, pool } from '../../config/db.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler, paginate, pageResult, notFound, badRequest, conflict } from '../../utils/http.js';
import { logActivity } from '../../utils/audit.js';
import { password } from '../auth/schema.js';
import { ensureDefaultCategories } from '../inventory/service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const email = z.string().trim().toLowerCase().email().max(191);
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  role: z.enum(['admin', 'owner', 'staff', 'renter']).optional(), status: z.enum(['active', 'inactive', 'suspended']).optional(), q: z.string().trim().max(100).optional(),
});
const createSchema = z.object({
  role: z.enum(['owner', 'staff', 'renter', 'admin']), name: z.string().trim().min(2).max(120), email, password,
  phone: z.string().trim().max(30).optional().nullable(), address: z.string().trim().max(255).optional().nullable(), shop_name: z.string().trim().max(150).optional().nullable(),
});
const updateSchema = createSchema.omit({ role: true, password: true });
const statusSchema = z.object({ status: z.enum(['active', 'inactive', 'suspended']) });
const logsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(100).optional(), action: z.string().trim().max(60).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const COLS = 'u.id, u.role, u.owner_id, u.name, u.email, u.phone, u.address, u.shop_name, u.status, u.created_at, u.is_seed';

const router = Router();
router.use(authenticate, requireRole('admin'));

router.get('/users', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query); const f = req.query;
  const where = ['1=1']; const params = [];
  if (f.role) { where.push('u.role = ?'); params.push(f.role); }
  if (f.status) { where.push('u.status = ?'); params.push(f.status); }
  if (f.q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.shop_name LIKE ?)'); params.push(...Array(3).fill(`%${f.q}%`)); }
  const w = where.join(' AND ');
  const [{ total }] = await q(`SELECT COUNT(*) AS total FROM users u WHERE ${w}`, params);
  const rows = await q(`SELECT ${COLS} FROM users u WHERE ${w} ORDER BY u.id DESC LIMIT ${p.limit} OFFSET ${p.offset}`, params);
  res.json(pageResult(rows.map((r) => ({ ...r, is_seed: !!r.is_seed })), total, p));
}));

router.post('/users', validate({ body: createSchema }), asyncHandler(async (req, res) => {
  const d = req.body;
  if (await q1('SELECT id FROM users WHERE email = ?', [d.email])) throw conflict('Email is already registered');
  // Single-owner model: exactly one admin and one owner; staff always belong to that owner.
  let ownerId = null;
  if (d.role === 'admin' || d.role === 'owner') {
    if (await q1('SELECT id FROM users WHERE role = ?', [d.role])) throw conflict(`Only one ${d.role} account is allowed`);
  }
  if (d.role === 'staff') {
    const owner = await q1("SELECT id FROM users WHERE role = 'owner'");
    if (!owner) throw conflict('Create the owner account before adding staff');
    ownerId = owner.id;
  }
  const hash = await bcrypt.hash(d.password, 12);
  const [r] = await pool.execute('INSERT INTO users (role, owner_id, name, email, phone, address, shop_name, staff_permissions, password_hash) VALUES (?,?,?,?,?,?,?,?,?)',
    [d.role, ownerId, d.name, d.email, d.phone ?? null, d.address ?? null, d.role === 'owner' ? d.shop_name ?? null : null, d.role === 'staff' ? serializePermissions(PERMISSIONS) : null, hash]);
  if (d.role === 'owner') await ensureDefaultCategories(r.insertId);
  await logActivity({ actorId: req.user.id, targetUserId: r.insertId, action: 'ACCOUNT_CREATE', description: `Admin ${req.user.name} created ${d.role} account for ${d.name}` });
  res.status(201).json(await q1(`SELECT ${COLS} FROM users u WHERE u.id = ?`, [r.insertId]));
}));

router.put('/users/:id', validate({ params: idParam, body: updateSchema }), asyncHandler(async (req, res) => {
  const u = await q1('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
  if (!u) throw notFound('User not found');
  const d = req.body;
  const dup = await q1('SELECT id FROM users WHERE email = ? AND id <> ?', [d.email, u.id]);
  if (dup) throw conflict('Email is already used by another account');
  await q('UPDATE users SET name=?, email=?, phone=?, address=?, shop_name=? WHERE id=?', [d.name, d.email, d.phone ?? null, d.address ?? null, u.role === 'owner' ? d.shop_name ?? null : null, u.id]);
  await logActivity({ actorId: req.user.id, targetUserId: u.id, action: 'ACCOUNT_UPDATE', description: `Admin ${req.user.name} updated account of ${d.name}` });
  res.json(await q1(`SELECT ${COLS} FROM users u WHERE u.id = ?`, [u.id]));
}));

router.patch('/users/:id/status', validate({ params: idParam, body: statusSchema }), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw badRequest('You cannot change your own account status');
  const u = await q1('SELECT id, name, role FROM users WHERE id = ?', [req.params.id]);
  if (!u) throw notFound('User not found');
  await q('UPDATE users SET status = ? WHERE id = ?', [req.body.status, u.id]);
  await logActivity({ actorId: req.user.id, targetUserId: u.id, action: 'ACCOUNT_STATUS', description: `Admin ${req.user.name} set ${u.name} to ${req.body.status}` });
  res.json({ ok: true, status: req.body.status });
}));

// Generates a strong one-time temporary password; shown once to the admin, stored only as a hash.
router.post('/users/:id/reset-password', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const u = await q1('SELECT id, name FROM users WHERE id = ?', [req.params.id]);
  if (!u) throw notFound('User not found');
  const temp = crypto.randomBytes(9).toString('base64url') + 'a1';
  await q('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(temp, 12), u.id]);
  await logActivity({ actorId: req.user.id, targetUserId: u.id, action: 'PASSWORD_RESET', description: `Admin ${req.user.name} reset the password of ${u.name}` });
  res.json({ temporaryPassword: temp, note: 'Share securely. Ask the user to change it after signing in.' });
}));

router.delete('/users/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw badRequest('You cannot delete your own account');
  const u = await q1('SELECT id, name, role FROM users WHERE id = ?', [req.params.id]);
  if (!u) throw notFound('User not found');
  if (u.role === 'owner') throw conflict('The owner account cannot be deleted. Suspend it instead.');
  if (u.role === 'admin') {
    const { c } = await q1("SELECT COUNT(*) AS c FROM users WHERE role='admin'");
    if (c <= 1) throw conflict('Cannot delete the last administrator');
  }
  const used = await q1(
    `SELECT 1 AS x FROM transactions t LEFT JOIN customers c ON c.id = t.customer_id WHERE t.owner_id = ? OR c.user_id = ? LIMIT 1`, [u.id, u.id]);
  if (used) throw conflict('This user has transaction history. Suspend the account instead of deleting it.');
  await q('DELETE FROM users WHERE id = ?', [u.id]);
  await logActivity({ actorId: req.user.id, action: 'ACCOUNT_DELETE', description: `Admin ${req.user.name} deleted account of ${u.name} (${u.role})` });
  res.json({ ok: true });
}));

router.get('/logs', validate({ query: logsQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query, 20); const f = req.query;
  const where = ['1=1']; const params = [];
  if (f.action) { where.push('l.action = ?'); params.push(f.action); }
  if (f.q) { where.push('(l.description LIKE ? OR a.name LIKE ? OR tu.name LIKE ?)'); params.push(...Array(3).fill(`%${f.q}%`)); }
  if (f.from) { where.push('DATE(l.created_at) >= ?'); params.push(f.from); }
  if (f.to) { where.push('DATE(l.created_at) <= ?'); params.push(f.to); }
  const w = where.join(' AND ');
  const from = 'FROM activity_logs l LEFT JOIN users a ON a.id = l.actor_id LEFT JOIN users tu ON tu.id = l.target_user_id';
  const [{ total }] = await q(`SELECT COUNT(*) AS total ${from} WHERE ${w}`, params);
  const rows = await q(`SELECT l.id, l.action, l.description, l.created_at, a.name AS actor_name, tu.name AS target_name ${from} WHERE ${w} ORDER BY l.id DESC LIMIT ${p.limit} OFFSET ${p.offset}`, params);
  res.json(pageResult(rows, total, p));
}));

export default router;
