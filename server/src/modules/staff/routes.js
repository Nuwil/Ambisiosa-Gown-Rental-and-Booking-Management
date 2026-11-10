import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q, q1 } from '../../config/db.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler, paginate, pageResult, notFound, conflict } from '../../utils/http.js';
import { logActivity } from '../../utils/audit.js';
import { password } from '../auth/schema.js';
import { PERMISSIONS, parsePermissions, serializePermissions } from '../../utils/permissions.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const email = z.string().trim().toLowerCase().email().max(191);
const profile = z.object({
  name: z.string().trim().min(2).max(120), email,
  phone: z.string().trim().max(30).optional().nullable(), address: z.string().trim().max(255).optional().nullable(),
});
const permissions = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length);
const createSchema = profile.extend({ password, permissions: permissions.default(PERMISSIONS) });
const updateSchema = profile.extend({ permissions: permissions.optional() });
const statusSchema = z.object({ status: z.enum(['active', 'inactive', 'suspended']) });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(), q: z.string().trim().max(100).optional(),
});
const COLS = 'id, name, email, phone, address, status, created_at, staff_permissions';
const shape = ({ staff_permissions, ...u }) => ({ ...u, permissions: parsePermissions(staff_permissions) });

/** The owner manages their own staff. Every query is scoped to owner_id = the session's owner. */
const router = Router();
router.use(authenticate, requireRole('owner'));

const mine = async (req) => {
  const s = await q1(`SELECT ${COLS} FROM users WHERE id = ? AND role = 'staff' AND owner_id = ?`, [req.params.id, req.user.id]);
  if (!s) throw notFound('Staff member not found');
  return shape(s);
};

router.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query); const f = req.query;
  const where = ["role = 'staff'", 'owner_id = ?']; const params = [req.user.id];
  if (f.status) { where.push('status = ?'); params.push(f.status); }
  if (f.q) { where.push('(name LIKE ? OR email LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }
  const w = where.join(' AND ');
  const [{ total }] = await q(`SELECT COUNT(*) AS total FROM users WHERE ${w}`, params);
  const rows = await q(`SELECT ${COLS} FROM users WHERE ${w} ORDER BY id DESC LIMIT ${p.limit} OFFSET ${p.offset}`, params);
  res.json(pageResult(rows.map(shape), total, p));
}));

router.post('/', validate({ body: createSchema }), asyncHandler(async (req, res) => {
  const d = req.body;
  if (await q1('SELECT id FROM users WHERE email = ?', [d.email])) throw conflict('Email is already registered');
  const r = await q("INSERT INTO users (role, owner_id, name, email, phone, address, staff_permissions, password_hash) VALUES ('staff',?,?,?,?,?,?,?)",
    [req.user.id, d.name, d.email, d.phone ?? null, d.address ?? null, serializePermissions(d.permissions), await bcrypt.hash(d.password, 12)]);
  await logActivity({ actorId: req.user.id, targetUserId: r.insertId, action: 'ACCOUNT_CREATE', description: `${req.user.name} created staff account for ${d.name}` });
  res.status(201).json(shape(await q1(`SELECT ${COLS} FROM users WHERE id = ?`, [r.insertId])));
}));

router.put('/:id', validate({ params: idParam, body: updateSchema }), asyncHandler(async (req, res) => {
  const s = await mine(req); const d = req.body;
  if (await q1('SELECT id FROM users WHERE email = ? AND id <> ?', [d.email, s.id])) throw conflict('Email is already used by another account');
  await q('UPDATE users SET name=?, email=?, phone=?, address=?, staff_permissions=? WHERE id=?',
    [d.name, d.email, d.phone ?? null, d.address ?? null, d.permissions ? serializePermissions(d.permissions) : serializePermissions(s.permissions), s.id]);
  await logActivity({ actorId: req.user.id, targetUserId: s.id, action: 'ACCOUNT_UPDATE', description: `${req.user.name} updated staff account of ${d.name}` });
  res.json(await mine(req));
}));

router.patch('/:id/status', validate({ params: idParam, body: statusSchema }), asyncHandler(async (req, res) => {
  const s = await mine(req);
  await q('UPDATE users SET status = ? WHERE id = ?', [req.body.status, s.id]);
  await logActivity({ actorId: req.user.id, targetUserId: s.id, action: 'ACCOUNT_STATUS', description: `${req.user.name} set staff ${s.name} to ${req.body.status}` });
  res.json({ ok: true, status: req.body.status });
}));

router.post('/:id/reset-password', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const s = await mine(req);
  const temp = crypto.randomBytes(9).toString('base64url') + 'a1';
  await q('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(temp, 12), s.id]);
  await logActivity({ actorId: req.user.id, targetUserId: s.id, action: 'PASSWORD_RESET', description: `${req.user.name} reset the password of staff ${s.name}` });
  res.json({ temporaryPassword: temp, note: 'Share securely. Ask the staff member to change it after signing in.' });
}));

router.delete('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const s = await mine(req);
  if (await q1('SELECT 1 AS x FROM payments WHERE recorded_by = ? LIMIT 1', [s.id])) throw conflict('This staff member has recorded payments. Suspend the account instead of deleting it.');
  await q('DELETE FROM users WHERE id = ?', [s.id]);
  await logActivity({ actorId: req.user.id, action: 'ACCOUNT_DELETE', description: `${req.user.name} deleted staff account of ${s.name}` });
  res.json({ ok: true });
}));

export default router;
