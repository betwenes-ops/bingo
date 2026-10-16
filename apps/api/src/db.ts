import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
export type Tx = pg.PoolClient;
export function database(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 20,
    statement_timeout: 10000,
    idle_in_transaction_session_timeout: 10000,
  });
  return { pool, orm: drizzle(pool) };
}
export async function transaction<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const result = await fn(tx);
    await tx.query('COMMIT');
    return result;
  } catch (e) {
    await tx.query('ROLLBACK');
    throw e;
  } finally {
    tx.release();
  }
}
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
