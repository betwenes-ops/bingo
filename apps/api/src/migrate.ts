import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { database, transaction } from './db';
import type pg from 'pg';
export async function migrate(pool: pg.Pool) {
  await transaction(pool, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(733001)');
    await tx.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
    );
    const folder = fileURLToPath(new URL('../migrations/', import.meta.url));
    for (const name of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
      const exists = await tx.query('SELECT name FROM schema_migrations WHERE name=$1', [name]);
      if (!exists.rowCount) {
        await tx.query(await readFile(`${folder}/${name}`, 'utf8'));
        await tx.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      }
    }
  });
}
if (process.argv[1]?.endsWith('/migrate.ts')) {
  const { pool } = database(process.env.DATABASE_URL!);
  migrate(pool)
    .then(() => console.log('Migrations applied'))
    .finally(() => pool.end());
}
