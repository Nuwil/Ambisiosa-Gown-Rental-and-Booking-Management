import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date');
const idz = z.coerce.number().int().positive();
const quantity = z.coerce.number().int().min(1).max(100);

export const idParam = z.object({ id: idz });

const line = {
  variant_id: idz,
  quantity,
};
export const addSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rental'), ...line, start_date: date, expected_return: date }),
  z.object({ type: z.literal('purchase'), ...line }),
]);

export const updateSchema = z.object({
  quantity: quantity.optional(),
  start_date: date.optional(),
  expected_return: date.optional(),
}).refine((d) => Object.keys(d).length > 0, 'Nothing to update');

export const checkoutSchema = z.object({
  ids: z.array(idz).min(1).max(50).optional(), // omitted = every line in the cart
  contact_phone: z.string().trim().max(30).optional().nullable(),
  contact_address: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});
