import { z } from 'zod';

export const inquirySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(191),
  topic: z.enum(['rent', 'buy', 'other']),
  message: z.string().trim().min(10).max(2000),
  company: z.string().max(120).optional(),
});
