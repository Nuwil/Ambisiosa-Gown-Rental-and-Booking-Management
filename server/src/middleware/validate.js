import { badRequest } from '../utils/http.js';

/** validate({ body, query, params }) with zod schemas; replaces req parts with parsed values. */
export const validate = (schemas) => (req, _res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(badRequest('Validation failed', details));
    }
    Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true });
  }
  next();
};
