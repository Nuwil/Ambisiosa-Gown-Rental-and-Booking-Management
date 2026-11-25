import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { HttpError } from './http.js';

let transport;
const getTransport = () => (transport ??= nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465, // 465 = implicit TLS (Gmail default); 587 = STARTTLS
  auth: { user: env.smtp.user, pass: env.smtp.pass },
}));

/** Delivers via SMTP (Gmail by default). Never falls back to logging: missing config or a rejected send throws a 503 the client can show. */
export async function sendMail({ to, subject, text }) {
  if (!env.smtp.user || !env.smtp.pass) {
    throw new HttpError(503, 'Email delivery is not configured on the server. Set SMTP_USER and SMTP_PASS (Gmail app password).');
  }
  try {
    await getTransport().sendMail({ from: env.smtp.from, to, subject, text });
  } catch (err) {
    console.error('[mailer] send failed:', err.code || '', err.message);
    const auth = err.code === 'EAUTH';
    throw new HttpError(503, auth
      ? 'Email delivery failed: the SMTP login was rejected. Check SMTP_USER / SMTP_PASS (Gmail needs an app password).'
      : 'Could not send the verification email. Please try again shortly.');
  }
}
