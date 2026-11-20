/**
 * Minimal stand-in for the server's zod schemas. Rules are `(raw, path, issues) => value`; failures are pushed as
 * `{ field, message }` (same shape and similar wording as zod v4) and `parse` throws the server's 400 "Validation failed".
 */
import { badRequest } from './util.js';

const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' && Number.isNaN(v) ? 'NaN' : typeof v);

const rule = (o, fn) => (raw, path, issues) => {
  if (raw === undefined && 'default' in o) return o.default;
  if (raw === undefined && o.optional) return undefined;
  if (raw === null && o.nullable) return null;
  const errs = [];
  const v = fn(raw, errs, path, issues);
  errs.forEach((message) => issues.push({ field: path, message }));
  return v;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const string = (o = {}) => rule(o, (raw, errs) => {
  if (typeof raw !== 'string') { errs.push(`Invalid input: expected string, received ${kind(raw)}`); return undefined; }
  let v = o.raw ? raw : raw.trim();
  if (o.lower) v = v.toLowerCase();
  if (o.emptyNull && v === '') return null;
  if (v.length < (o.min ?? 0)) errs.push(o.minMsg ?? `Too small: expected string to have >=${o.min} characters`);
  if (v.length > (o.max ?? Infinity)) errs.push(o.maxMsg ?? `Too big: expected string to have <=${o.max} characters`);
  if (o.email && !EMAIL.test(v)) errs.push('Invalid email address');
  (o.patterns ?? []).forEach(([re, msg]) => { if (!re.test(v)) errs.push(msg); });
  return v;
});

export const number = (o = {}) => rule(o, (raw, errs) => {
  const v = Number(raw);
  if (Number.isNaN(v) || raw === undefined) { errs.push('Invalid input: expected number, received NaN'); return undefined; }
  if (o.int && !Number.isInteger(v)) errs.push('Invalid input: expected int, received number');
  if (o.positive && v <= 0) errs.push('Too small: expected number to be >0');
  else if (o.min != null && v < o.min) errs.push(`Too small: expected number to be >=${o.min}`);
  if (o.max != null && v > o.max) errs.push(`Too big: expected number to be <=${o.max}`);
  return v;
});
export const int = (o = {}) => number({ int: true, ...o });
export const id = (o = {}) => int({ positive: true, ...o });

export const bool = (o = {}) => rule(o, (raw) => Boolean(raw)); // z.coerce.boolean()

export const oneOf = (values, o = {}) => rule(o, (raw, errs) => {
  if (!values.includes(raw)) { errs.push(`Invalid option: expected one of ${values.map((x) => JSON.stringify(x)).join('|')}`); return undefined; }
  return raw;
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const date = (o = {}) => rule(o, (raw, errs) => {
  if (typeof raw !== 'string') { errs.push(`Invalid input: expected string, received ${kind(raw)}`); return undefined; }
  if (!DATE.test(raw)) errs.push(o.plain ? 'Invalid string: must match pattern /^\\d{4}-\\d{2}-\\d{2}$/' : 'Use YYYY-MM-DD');
  else if (Number.isNaN(Date.parse(raw))) errs.push('Invalid date');
  return raw;
});

export const array = (item, o = {}) => rule(o, (raw, errs, path, issues) => {
  if (!Array.isArray(raw)) { errs.push(`Invalid input: expected array, received ${kind(raw)}`); return undefined; }
  if (raw.length < (o.min ?? 0)) errs.push(o.minMsg ?? `Too small: expected array to have >=${o.min} items`);
  if (raw.length > (o.max ?? Infinity)) errs.push(`Too big: expected array to have <=${o.max} items`);
  const out = raw.map((x, i) => item(x, path ? `${path}.${i}` : String(i), issues));
  const msg = o.refine?.(out);
  if (msg) errs.push(msg);
  return out;
});

export const object = (shape, o = {}) => rule(o, (raw, errs, path, issues) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) { errs.push(`Invalid input: expected object, received ${kind(raw)}`); return undefined; }
  const out = {};
  for (const [k, r] of Object.entries(shape)) {
    const v = r(raw[k], path ? `${path}.${k}` : k, issues);
    if (v !== undefined) out[k] = v;
  }
  const msg = o.refine?.(out);
  if (msg) errs.push(msg);
  return out;
});

/** z.discriminatedUnion: picks the object schema by the value of `key`. */
export const union = (key, map) => (raw, path, issues) => {
  const pick = map[raw?.[key]];
  if (!pick) { issues.push({ field: path ? `${path}.${key}` : key, message: 'Invalid input' }); return undefined; }
  return pick(raw, path, issues);
};

/** Runs a schema; throws the server's 400 with `details: [{field, message}]` on failure. */
export function parse(schema, data) {
  const issues = [];
  const value = schema(data, '', issues);
  if (issues.length) throw badRequest('Validation failed', issues);
  return value;
}

// ---- schemas shared by several modules ----
export const idParam = object({ id: id() });
export const pageQuery = { page: int({ min: 1, optional: true }), pageSize: int({ min: 1, max: 100, optional: true }) };
export const password = string({
  raw: true, max: 72, maxMsg: 'At most 72 characters', min: 8, minMsg: 'At least 8 characters',
  patterns: [[/[A-Za-z]/, 'Must include a letter'], [/\d/, 'Must include a number']],
});
export const email = string({ lower: true, email: true, max: 191 });
export const optStr = (max) => string({ max, optional: true, nullable: true });
export const STATUSES = ['active', 'inactive', 'suspended'];
