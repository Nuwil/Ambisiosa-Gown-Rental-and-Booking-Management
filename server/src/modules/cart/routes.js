import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/http.js';
import * as svc from './service.js';
import { addSchema, updateSchema, checkoutSchema, idParam } from './schema.js';

/** The cart belongs to the signed-in renter; every query is scoped to req.user.id. */
const router = Router();
router.use(authenticate, requireRole('renter'));

router.get('/', asyncHandler(async (req, res) => res.json(await svc.listCart(req.user.id))));
router.get('/count', asyncHandler(async (req, res) => res.json({ count: await svc.cartCount(req.user.id) })));
router.post('/', validate({ body: addSchema }), asyncHandler(async (req, res) => res.status(201).json(await svc.addToCart(req.user.id, req.body))));
router.patch('/:id', validate({ params: idParam, body: updateSchema }), asyncHandler(async (req, res) => res.json(await svc.updateLine(req.user.id, req.params.id, req.body))));
router.delete('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.removeLine(req.user.id, req.params.id))));
router.delete('/', asyncHandler(async (req, res) => res.json(await svc.clearCart(req.user.id))));
router.post('/checkout', validate({ body: checkoutSchema }), asyncHandler(async (req, res) => res.status(201).json(await svc.checkout(req.user, req.body))));

export default router;
