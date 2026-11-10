import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { q1 } from '../config/db.js';
import { asyncHandler, unauthorized, forbidden } from '../utils/http.js';
import { permissionsFor } from '../utils/permissions.js';

export const COOKIE_NAME = 'rental_token';

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
};

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

/** Verifies the cookie, then re-loads the user so suspension / role changes apply immediately. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Session expired');
  }
  const user = await q1(
    `SELECT u.id, u.role, u.owner_id, u.name, u.email, u.phone, u.address, u.status, u.theme, u.staff_permissions, u.created_at,
            COALESCE(u.shop_name, o.shop_name) AS shop_name, o.status AS owner_status
     FROM users u LEFT JOIN users o ON o.id = u.owner_id WHERE u.id = ?`,
    [payload.sub]
  );
  if (!user) throw unauthorized();
  if (user.status !== 'active') throw forbidden(`Account is ${user.status}`);
  if (user.role === 'staff' && user.owner_status !== 'active') throw forbidden('The shop account is not active');
  // shopId = the owner whose data this user works on (owner: self, staff: their owner). Audit/notifications still use user.id.
  const isShop = user.role === 'owner' || user.role === 'staff';
  req.user = { ...user, isShop, permissions: permissionsFor(user), shopId: user.role === 'owner' ? user.id : user.role === 'staff' ? user.owner_id : null };
  next();
});

/** Owner or staff of the shop. */
export const requireShop = (req, res, next) => (req.user?.isShop ? next() : next(forbidden()));

export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role) ? next() : next(forbidden());

/** Owner passes; staff need the given access area (set per staff member by the owner). */
export const requireStaffPermission = (area) => (req, _res, next) =>
  req.user?.role === 'owner' || req.user?.permissions?.includes(area) ? next() : next(forbidden('Your account does not have access to this area'));

/** Like requireStaffPermission, but lets non-staff roles through (their own rules apply). Use on mixed-role routers. */
export const staffNeeds = (area) => (req, _res, next) =>
  req.user?.role !== 'staff' || req.user.permissions.includes(area) ? next() : next(forbidden('Your account does not have access to this area'));
