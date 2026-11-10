import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/http.js';
import { adminDashboard, ownerDashboard, renterDashboard } from './dashboard.js';
import { buildAnalytics } from './analytics.js';

const router = Router();
router.use(authenticate);

// One endpoint, three different payloads — the role comes from the session, never from the request.
router.get('/dashboard', asyncHandler(async (req, res) => {
  const { role, id, shopId, isShop } = req.user;
  res.json(role === 'admin' ? await adminDashboard() : isShop ? await ownerDashboard(shopId) : await renterDashboard(id));
}));

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const analyticsQuery = z.object({
  range: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']).default('monthly'),
  from: date.optional(), to: date.optional(),
});
router.get('/analytics', requireRole('admin', 'owner'), validate({ query: analyticsQuery }), asyncHandler(async (req, res) => {
  res.json(await buildAnalytics(req.user.role === 'owner' ? req.user.id : null, req.query));
}));

export default router;
