import { HttpError } from '../utils/http.js';
import { env } from '../config/env.js';

export const notFoundHandler = (_req, res) => res.status(404).json({ message: 'Route not found' });

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A record with these details already exists' });
  if (err?.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ message: 'Cannot delete: record is referenced by other data' });
  }
  if (err?.name === 'MulterError') return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: env.isProd ? 'Internal server error' : err.message });
};
