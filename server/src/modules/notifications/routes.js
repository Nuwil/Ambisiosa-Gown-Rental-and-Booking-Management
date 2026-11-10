import { Router } from 'express';
import { z } from 'zod';
import { q } from '../../config/db.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/http.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const rows = await q('SELECT id, type, message, ref_id, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id]);
  const [{ unread }] = await q('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json({ data: rows, unread });
}));

router.post('/read', validate({ body: z.object({ ids: z.array(z.coerce.number().int()).max(100).optional() }) }), asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (ids?.length) {
    await q(`UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`, [req.user.id, ...ids]);
  } else {
    await q('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  }
  res.json({ ok: true });
}));

export default router;
