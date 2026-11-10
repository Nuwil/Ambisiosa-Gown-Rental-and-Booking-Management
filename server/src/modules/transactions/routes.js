import { Router } from 'express';
import { authenticate, requireRole, requireShop, staffNeeds } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler, paginate, pageResult } from '../../utils/http.js';
import * as svc from './service.js';
import { requestSchema, manualSchema, actionSchema, paymentSchema, listQuery, idParam } from './schema.js';

const router = Router();
router.use(authenticate, staffNeeds('transactions'));

// List: scope is derived from the authenticated role, never from client input.
router.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query);
  const { rows, total } = await svc.listTransactions(svc.scopeFor(req.user), p, req.query);
  res.json(pageResult(rows, total, p));
}));

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getTransaction(req.user, req.params.id))));

// Renter submits rental / purchase request
router.post('/request', requireRole('renter'), validate({ body: requestSchema }), asyncHandler(async (req, res) => res.status(201).json(await svc.createRequest(req.user, req.body))));

// Owner records a transaction for a customer
router.post('/manual', requireShop, validate({ body: manualSchema }), asyncHandler(async (req, res) => res.status(201).json(await svc.createManual(req.user, req.body))));

// Lifecycle actions (owner: all; renter: cancel own pending only — enforced in service)
router.post('/:id/action', requireRole('owner', 'staff', 'renter'), validate({ params: idParam, body: actionSchema }), asyncHandler(async (req, res) => res.json(await svc.applyAction(req.user, req.params.id, req.body))));

router.post('/:id/payments', requireShop, validate({ params: idParam, body: paymentSchema }), asyncHandler(async (req, res) => res.status(201).json(await svc.recordPayment(req.user, req.params.id, req.body))));

export default router;
