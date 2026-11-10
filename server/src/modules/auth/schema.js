import { z } from 'zod';

export const password = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[A-Za-z]/, 'Must include a letter')
  .regex(/\d/, 'Must include a number');

const email = z.string().trim().toLowerCase().email().max(191);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password,
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(72) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: password,
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  shop_name: z.string().trim().max(150).optional().nullable(),
});

export const themeSchema = z.object({ theme: z.enum(['light', 'dark']) });
