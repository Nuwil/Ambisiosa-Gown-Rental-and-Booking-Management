import { z } from 'zod';

const id = z.coerce.number().int().positive();
export const idParam = z.object({ id });

export const variantSchema = z.object({
  size: z.string().trim().min(1).max(20),
  total_quantity: z.coerce.number().int().min(0).max(100000),
});

export const itemSchema = z.object({
  category_id: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(5000).optional().nullable(),
  color: z.string().trim().max(40).optional().nullable(),
  rental_price: z.coerce.number().min(0).max(1_000_000),
  purchase_price: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  condition_status: z.enum(['new', 'good', 'fair', 'needs_repair']).default('good'),
  is_published: z.coerce.boolean().default(true),
  variants: z.array(variantSchema).min(1, 'At least one size is required').max(30)
    .refine((v) => new Set(v.map((x) => x.size.toLowerCase())).size === v.length, 'Duplicate sizes'),
});

export const listItemsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(100).optional(),
  category_id: z.coerce.number().int().optional(),
  archived: z.enum(['0', '1']).optional(),
});

export const categorySchema = z.object({ name: z.string().trim().min(2).max(80) });

// Renter-facing browse filters
export const browseQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  size: z.string().trim().max(20).optional(),
  color: z.string().trim().max(40).optional(),
  owner_id: z.coerce.number().int().optional(),
  condition: z.enum(['new', 'good', 'fair', 'needs_repair']).optional(),
  min_rent: z.coerce.number().min(0).optional(),
  max_rent: z.coerce.number().min(0).optional(),
  min_buy: z.coerce.number().min(0).optional(),
  max_buy: z.coerce.number().min(0).optional(),
  available: z.enum(['0', '1']).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(['newest', 'rent_asc', 'rent_desc', 'name']).optional(),
});
