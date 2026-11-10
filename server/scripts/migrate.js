import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const { database, ...rest } = env.db;

const conn = await mysql.createConnection({ ...rest, multipleStatements: true });
await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
await conn.query(`USE \`${database}\``);
await conn.query(`CREATE TABLE IF NOT EXISTS _migrations (name VARCHAR(191) PRIMARY KEY, run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

const [done] = await conn.query('SELECT name FROM _migrations');
const applied = new Set(done.map((r) => r.name));

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (applied.has(file)) continue;
  console.log('Applying', file);
  await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  await conn.query('INSERT INTO _migrations (name) VALUES (?)', [file]);
}
console.log('Migrations up to date.');
await conn.end();
