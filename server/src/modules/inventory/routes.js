import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { authenticate, requireRole, requireShop, staffNeeds } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler, paginate, pageResult, badRequest } from '../../utils/http.js';
import * as svc from './service.js';
import { itemSchema, idParam, listItemsQuery, categorySchema, browseQuery } from './schema.js';
import { z } from 'zod';

const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: svc.UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + MIME_EXT[file.mimetype]),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => (MIME_EXT[file.mimetype] ? cb(null, true) : cb(badRequest('Only JPG, PNG or WebP images are allowed'))),
});

const router = Router();
router.use(authenticate);

// ---- Owner: own inventory CRUD ----
const owner = Router();
owner.use(requireShop);
// Staff: viewing stock is open to inventory and transactions staff (needed to pick items); changes need 'inventory'.
const canViewStock = (req, res, next) => (req.user.role === 'staff' && req.user.permissions.includes('transactions') ? next() : staffNeeds('inventory')(req, res, next));
owner.use((req, res, next) => (req.method === 'GET' ? canViewStock(req, res, next) : staffNeeds('inventory')(req, res, next)));
owner.get('/items', validate({ query: listItemsQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query);
  const { rows, total } = await svc.listOwnerItems(req.user.shopId, p, req.query);
  res.json(pageResult(rows, total, p));
}));
owner.post('/items', validate({ body: itemSchema }), asyncHandler(async (req, res) => res.status(201).json(await svc.createItem(req.user, req.body))));
owner.get('/items/:id', validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getOwnerItem(req.user.shopId, req.params.id))));
owner.put('/items/:id', validate({ params: idParam, body: itemSchema }), asyncHandler(async (req, res) => res.json(await svc.updateItem(req.user, req.params.id, req.body))));
owner.delete('/items/:id', requireRole('owner'), validate({ params: idParam }), asyncHandler(async (req, res) => { await svc.setArchived(req.user, req.params.id, true); res.json({ ok: true }); }));
owner.post('/items/:id/restore', requireRole('owner'), validate({ params: idParam }), asyncHandler(async (req, res) => { await svc.setArchived(req.user, req.params.id, false); res.json({ ok: true }); }));
owner.post('/items/:id/images', validate({ params: idParam }), upload.array('images', 5), asyncHandler(async (req, res) => {
  if (!req.files?.length) throw badRequest('No images uploaded');
  res.status(201).json(await svc.addImages(req.user, req.params.id, req.files));
}));
const imgParams = z.object({ id: z.coerce.number().int().positive(), imageId: z.coerce.number().int().positive() });
owner.put('/items/:id/images/:imageId/primary', validate({ params: imgParams }), asyncHandler(async (req, res) => res.json(await svc.setPrimaryImage(req.user, req.params.id, req.params.imageId))));
owner.delete('/items/:id/images/:imageId', validate({ params: imgParams }), asyncHandler(async (req, res) => res.json(await svc.deleteImage(req.user, req.params.id, req.params.imageId))));
owner.get('/categories', asyncHandler(async (req, res) => res.json(await svc.listCategories(req.user.shopId))));
owner.post('/categories', requireRole('owner'), validate({ body: categorySchema }), asyncHandler(async (req, res) => res.status(201).json(await svc.createCategory(req.user.shopId, req.body.name))));
owner.put('/categories/:id', requireRole('owner'), validate({ params: idParam, body: categorySchema }), asyncHandler(async (req, res) => res.json(await svc.renameCategory(req.user.shopId, req.params.id, req.body.name))));
owner.delete('/categories/:id', requireRole('owner'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.deleteCategory(req.user.shopId, req.params.id))));
router.use('/manage', owner);

// ---- Renter: read-only catalog (owners/admin may preview as well) ----
router.get('/catalog', requireRole('renter', 'owner', 'staff', 'admin'), validate({ query: browseQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query, 12, 60);
  const { rows, total } = await svc.browseCatalog(p, req.query);
  res.json(pageResult(rows, total, p));
}));
router.get('/catalog/facets', requireRole('renter', 'owner', 'staff', 'admin'), asyncHandler(async (_req, res) => res.json(await svc.catalogFacets())));
router.get('/catalog/shops', requireRole('renter', 'owner', 'staff', 'admin'), asyncHandler(async (_req, res) => res.json(await svc.listShops())));
router.get('/catalog/:id', requireRole('renter', 'owner', 'staff', 'admin'), validate({ params: idParam, query: z.object({ start: z.string().optional(), end: z.string().optional() }) }),
  asyncHandler(async (req, res) => res.json(await svc.getCatalogItem(req.params.id, req.query))));

// ---- Admin: read-only oversight ----
router.get('/admin/items', requireRole('admin'), validate({ query: listItemsQuery }), asyncHandler(async (req, res) => {
  const p = paginate(req.query);
  const { rows, total } = await svc.adminListItems(p, req.query);
  res.json(pageResult(rows, total, p));
}));

export default router;
