import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // keep DATE/DATETIME as strings, avoids TZ shifts
  decimalNumbers: true,
  namedPlaceholders: false,
});

/** Run fn inside a DB transaction. fn receives the connection. */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export const q = (sql, params = [], conn = pool) => conn.execute(sql, params).then(([rows]) => rows);
export const q1 = async (sql, params = [], conn = pool) => (await q(sql, params, conn))[0] ?? null;
