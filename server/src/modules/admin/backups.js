import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { env } from '../../config/env.js';
import { q, q1, pool } from '../../config/db.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler, notFound, badRequest, conflict } from '../../utils/http.js';
import { logActivity } from '../../utils/audit.js';

export const BACKUP_DIR = path.resolve('backups');
const idParam = z.object({ id: z.coerce.number().int().positive() });
const restoreSchema = z.object({ password: z.string().min(1).max(72), confirm: z.literal('RESTORE') });

const connArgs = () => ['--host', env.db.host, '--port', String(env.db.port), '--user', env.db.user];
const childEnv = () => ({ ...process.env, MYSQL_PWD: env.db.password }); // password via env, never argv

/** mysqldump → file. Arguments are passed as an array (no shell), so nothing is interpolated. */
export async function runBackup(createdBy) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  const [ins] = await pool.execute("INSERT INTO backups (file_name, status, created_by) VALUES (?, 'running', ?)", [fileName, createdBy]);
  const id = ins.insertId;
  const out = fs.createWriteStream(path.join(BACKUP_DIR, fileName), { mode: 0o600 });
  let stderr = '';
  try {
    const child = spawn(env.mysqldump, [...connArgs(), '--single-transaction', '--routines', `--ignore-table=${env.db.database}.backups`, env.db.database], { env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(out);
    child.stderr.on('data', (d) => { stderr += d; });
    const [code] = await Promise.race([once(child, 'close'), once(child, 'error').then(([e]) => { throw e; })]);
    await finished(out); // resolves immediately if the file stream already flushed
    if (code !== 0) throw new Error(stderr.trim().slice(0, 200) || `mysqldump exited with ${code}`);
    const { size } = fs.statSync(path.join(BACKUP_DIR, fileName));
    await q("UPDATE backups SET status='success', size_bytes=? WHERE id=?", [size, id]);
  } catch (e) {
    out.destroy();
    fs.rmSync(path.join(BACKUP_DIR, fileName), { force: true });
    await q("UPDATE backups SET status='failed', error=? WHERE id=?", [String(e.message).slice(0, 250), id]);
  }
  return q1('SELECT * FROM backups WHERE id = ?', [id]);
}

async function runRestore(fileName) {
  const file = path.join(BACKUP_DIR, path.basename(fileName));
  const child = spawn(env.mysql, [...connArgs(), env.db.database], { env: childEnv(), stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  fs.createReadStream(file).pipe(child.stdin);
  const [code] = await Promise.race([once(child, 'close'), once(child, 'error').then(([e]) => { throw e; })]);
  if (code !== 0) throw new Error(stderr.trim().slice(0, 200) || `mysql exited with ${code}`);
}

const router = Router();
router.use(authenticate, requireRole('admin'));

router.get('/', asyncHandler(async (_req, res) => {
  const rows = await q(`SELECT b.id, b.file_name, b.size_bytes, b.status, b.error, b.created_at, u.name AS created_by_name FROM backups b LEFT JOIN users u ON u.id = b.created_by ORDER BY b.id DESC LIMIT 100`);
  res.json(rows.map((r) => ({ ...r, file_exists: r.status === 'success' && fs.existsSync(path.join(BACKUP_DIR, path.basename(r.file_name))) })));
}));

router.post('/', asyncHandler(async (req, res) => {
  const b = await runBackup(req.user.id);
  await logActivity({ actorId: req.user.id, action: 'BACKUP_CREATE', description: `Admin ${req.user.name} created backup ${b.file_name} (${b.status})` });
  res.status(b.status === 'success' ? 201 : 500).json(b.status === 'success' ? b : { message: `Backup failed: ${b.error}`, backup: b });
}));

router.get('/:id/download', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const b = await q1("SELECT * FROM backups WHERE id = ? AND status = 'success'", [req.params.id]);
  const file = b && path.join(BACKUP_DIR, path.basename(b.file_name));
  if (!b || !fs.existsSync(file)) throw notFound('Backup file not found');
  await logActivity({ actorId: req.user.id, action: 'BACKUP_DOWNLOAD', description: `Admin ${req.user.name} downloaded ${b.file_name}` });
  res.download(file, b.file_name);
}));

// Restore: requires admin password re-entry + typed confirmation; takes a safety backup first.
router.post('/:id/restore', validate({ params: idParam, body: restoreSchema }), asyncHandler(async (req, res) => {
  const admin = await q1('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(req.body.password, admin.password_hash))) throw badRequest('Password is incorrect');
  const b = await q1("SELECT * FROM backups WHERE id = ? AND status = 'success'", [req.params.id]);
  if (!b || !fs.existsSync(path.join(BACKUP_DIR, path.basename(b.file_name)))) throw notFound('Backup file not found');

  const safety = await runBackup(req.user.id);
  if (safety.status !== 'success') throw conflict(`Restore aborted: could not create a safety backup (${safety.error})`);
  try {
    await runRestore(b.file_name);
  } catch (e) {
    await logActivity({ actorId: req.user.id, action: 'BACKUP_RESTORE_FAILED', description: `Restore of ${b.file_name} failed` });
    throw conflict(`Restore failed: ${e.message}. A safety backup (${safety.file_name}) was taken before the attempt.`);
  }
  await logActivity({ actorId: req.user.id, action: 'BACKUP_RESTORE', description: `Admin ${req.user.name} restored backup ${b.file_name} (safety backup: ${safety.file_name})` });
  res.json({ ok: true, restored: b.file_name, safetyBackup: safety.file_name });
}));

router.delete('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const b = await q1('SELECT * FROM backups WHERE id = ?', [req.params.id]);
  if (!b) throw notFound('Backup not found');
  fs.rmSync(path.join(BACKUP_DIR, path.basename(b.file_name)), { force: true });
  await q('DELETE FROM backups WHERE id = ?', [b.id]);
  await logActivity({ actorId: req.user.id, action: 'BACKUP_DELETE', description: `Admin ${req.user.name} deleted backup ${b.file_name}` });
  res.json({ ok: true });
}));

export default router;
