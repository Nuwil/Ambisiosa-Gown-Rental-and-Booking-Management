import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { UPLOAD_DIR } from './modules/inventory/service.js';
import authRoutes from './modules/auth/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import customerRoutes from './modules/customers/routes.js';
import transactionRoutes from './modules/transactions/routes.js';
import notificationRoutes from './modules/notifications/routes.js';
import statsRoutes from './modules/stats/routes.js';
import cartRoutes from './modules/cart/routes.js';
import reportRoutes from './modules/reports/routes.js';
import adminUsers from './modules/admin/users.js';
import staffRoutes from './modules/staff/routes.js';
import adminBackups from './modules/admin/backups.js';

export function createApp() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Uploaded images are public (they belong to published catalog items). nosniff prevents MIME confusion.
  app.use('/uploads', express.static(path.resolve(UPLOAD_DIR), { index: false, dotfiles: 'deny', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/admin', adminUsers);
  app.use('/api/admin/backups', adminBackups);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
