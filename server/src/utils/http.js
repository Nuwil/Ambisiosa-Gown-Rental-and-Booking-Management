export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (m, d) => new HttpError(400, m, d);
export const unauthorized = (m = 'Unauthorized') => new HttpError(401, m);
export const forbidden = (m = 'Forbidden') => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse ?page & ?pageSize into safe limit/offset. */
export function paginate(query, defaultSize = 10, maxSize = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export const pageResult = (rows, total, { page, pageSize }) => ({
  data: rows,
  meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
});

/** Inclusive day count between two YYYY-MM-DD strings. */
export function inclusiveDays(start, end) {
  const ms = new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z');
  return Math.round(ms / 86400000) + 1;
}
