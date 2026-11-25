import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../utils/http.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, signToken, cookieOptions, COOKIE_NAME } from '../../middleware/auth.js';
import { logActivity } from '../../utils/audit.js';
import * as svc from './service.js';
import { registerSchema, loginSchema, changePasswordSchema, profileSchema, themeSchema, verifyEmailSchema, resendCodeSchema, googleSchema } from './schema.js';

const router = Router();
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts, try again later' } });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts, try again later' } });

router.post('/register', limiter, validate({ body: registerSchema }), asyncHandler(async (req, res) => {
  const { email } = await svc.registerRenter(req.body);
  res.status(202).json({ verificationRequired: true, email }); // no session until the emailed code is confirmed
}));

router.post('/verify-email', otpLimiter, validate({ body: verifyEmailSchema }), asyncHandler(async (req, res) => {
  const user = await svc.verifyEmail(req.body);
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions).json({ user });
}));

router.post('/resend-code', otpLimiter, validate({ body: resendCodeSchema }), asyncHandler(async (req, res) => {
  await svc.resendCode(req.body);
  res.json({ ok: true });
}));

router.post('/google', limiter, validate({ body: googleSchema }), asyncHandler(async (req, res) => {
  const user = await svc.loginWithGoogle(req.body);
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions).json({ user });
}));

router.post('/login', limiter, validate({ body: loginSchema }), asyncHandler(async (req, res) => {
  const user = await svc.login(req.body);
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions).json({ user });
}));

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await logActivity({ actorId: req.user.id, targetUserId: req.user.id, action: 'USER_LOGOUT', description: `${req.user.name} logged out` });
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined }).json({ ok: true });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: svc.publicUser(req.user) }));

router.put('/password', authenticate, validate({ body: changePasswordSchema }), asyncHandler(async (req, res) => {
  await svc.changePassword(req.user.id, req.body);
  res.json({ ok: true });
}));

router.put('/profile', authenticate, validate({ body: profileSchema }), asyncHandler(async (req, res) => {
  res.json({ user: await svc.updateProfile(req.user, req.body) });
}));

router.put('/theme', authenticate, validate({ body: themeSchema }), asyncHandler(async (req, res) => {
  await svc.setTheme(req.user.id, req.body.theme);
  res.json({ theme: req.body.theme });
}));

export default router;
