import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/http.js';
import { inquirySchema } from './schema.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again later.' },
});

router.post('/', limiter, (req, res, next) => {
  if (typeof req.body?.company === 'string' && req.body.company.trim()) {
    return res.json({ ok: true });
  }
  next();
}, validate({ body: inquirySchema }), asyncHandler(async (req, res) => {
  const { name, email, topic, message } = req.body;
  const payload = { name, email, topic, message, receivedAt: new Date().toISOString() };

  if (!env.inquiryWebhookUrl) {
    return res.status(503).json({ error: 'Messages cannot be received right now. Please contact us directly.' });
  }

  try {
    const response = await fetch(env.inquiryWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`webhook returned ${response.status}`);
  } catch (error) {
    console.error('[inquiry] forwarding failed:', error.message);
    return res.status(502).json({ error: 'We could not send your message. Please try again later.' });
  }

  res.json({ ok: true });
}));

export default router;
