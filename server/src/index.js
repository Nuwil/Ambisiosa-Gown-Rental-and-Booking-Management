import { env } from './config/env.js';
import { pool } from './config/db.js';
import { createApp } from './app.js';
import { startReminderJob } from './jobs/reminders.js';

const app = createApp();

// Vercel imports the default export as the request handler; no listen/cron there.
if (!process.env.VERCEL) {
  await pool.query('SELECT 1'); // fail fast if the DB is unreachable
  const server = app.listen(env.port, () => console.log(`API listening on :${env.port}`));
  startReminderJob();

  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default app;
