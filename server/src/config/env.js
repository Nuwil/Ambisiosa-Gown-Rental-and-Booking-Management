import 'dotenv/config';

const required = ['JWT_SECRET', 'DB_NAME'];
for (const k of required) {
  if (!process.env[k]) throw new Error(`Missing env var ${k}`);
}
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 chars in production');
}

export const env = {
  port: Number(process.env.PORT || 4000),
  isProd: process.env.NODE_ENV === 'production',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  inquiryWebhookUrl: process.env.INQUIRY_WEBHOOK_URL || '',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  },
  mysqldump: process.env.MYSQLDUMP_BIN || 'mysqldump',
  mysql: process.env.MYSQL_BIN || 'mysql',
};
