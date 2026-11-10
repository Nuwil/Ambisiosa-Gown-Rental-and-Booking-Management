import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date');
const idz = z.coerce.number().int().positive();
export const idParam = z.object({ id: idz });

const base = {
  variant_id: idz,
  quantity: z.coerce.number().int().min(1).max(1000),
  notes: z.string().trim().max(1000).optional().nullable(),
};

export const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rental'), ...base, start_date: date, expected_return: date }),
  z.object({
    type: z.literal('purchase'), ...base,
    contact_phone: z.string().trim().max(30).optional().nullable(),
    contact_address: z.string().trim().max(255).optional().nullable(),
  }),
]);

// Owner creating a transaction for a walk-in / existing customer (goes straight to "approved")
export const manualSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rental'), customer_id: idz, ...base, start_date: date, expected_return: date }),
  z.object({ type: z.literal('purchase'), customer_id: idz, ...base }),
]);

export const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'release', 'return', 'finalize', 'cancel']),
  actual_return: date.optional(),
  mark_paid: z.coerce.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  method: z.string().trim().max(30).optional().nullable(),
});

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  type: z.enum(['rental', 'purchase']).optional(),
  status: z.enum(['pending', 'approved', 'active', 'completed', 'rejected', 'cancelled', 'overdue']).optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid', 'refunded']).optional(),
  category_id: z.coerce.number().int().optional(),
  customer_id: z.coerce.number().int().optional(),
  from: date.optional(),
  to: date.optional(),
  q: z.string().trim().max(100).optional(),
});
