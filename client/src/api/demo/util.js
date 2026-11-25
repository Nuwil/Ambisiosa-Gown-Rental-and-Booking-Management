/** Shared helpers for the in-browser demo backend: errors, pagination, dates. Mirrors server/src/utils/http.js. */
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

/** Non-200 success reply (e.g. 201 Created). Plain return values are sent as 200. */
export class Reply {
  constructor(status, data) { this.status = status; this.data = data; }
}
export const created = (data) => new Reply(201, data);
/** A generated file for download endpoints. */
export class FileReply {
  constructor(filename, type, parts) { this.filename = filename; this.blob = new Blob(parts, { type }); }
}

export function paginate(query, defaultSize = 10, maxSize = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}
export const pageResult = (rows, total, { page, pageSize }) => ({
  data: rows,
  meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
});
/** Filtered + sorted rows -> one page in the `{data, meta}` shape. */
export const paged = (rows, p, map = (r) => r) => pageResult(rows.slice(p.offset, p.offset + p.limit).map(map), rows.length, p);

// ---- dates (UTC, like the server) ----
const DAY = 86400000;
export const iso = (d) => d.toISOString().slice(0, 10);
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }; // local day, matches the date pickers
export const addDays = (s, n) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * DAY));
export const diffDays = (a, b) => Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / DAY); // a - b
export const inclusiveDays = (start, end) => diffDays(end, start) + 1;
/** 'YYYY-MM-DD HH:MM:SS' like MySQL DATETIME with dateStrings. */
export const stamp = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
export const dayOf = (s) => String(s).slice(0, 10);
export const monthOf = (s) => String(s).slice(0, 7);

// ---- tiny collection helpers ----
export const sumBy = (rows, f) => rows.reduce((n, r) => n + Number(f(r) ?? 0), 0);
export const like = (hay, needle) => String(hay ?? '').toLowerCase().includes(String(needle).toLowerCase());
export const byId = (rows, id) => rows.find((r) => r.id === Number(id));
export const groupBy = (rows, f) => rows.reduce((m, r) => { const k = f(r); (m.get(k) ?? m.set(k, []).get(k)).push(r); return m; }, new Map());
export const round2 = (v) => Math.round(v * 100) / 100;
