import { it, expect } from 'vitest';
import { database } from './db';
it('conexões Supabase não fazem fallback para tabelas public quando o schema é omitido', async () => {
  const managed = database('postgresql://unused:unused@db.test.supabase.co/postgres').pool;
  const local = database('postgresql://unused:unused@127.0.0.1:1/local').pool;
  try {
    expect(managed.options.options).toBe('-c search_path=bingo,pg_catalog');
    expect(local.options.options).toBe('-c search_path=bingo,public,pg_catalog');
  } finally {
    await managed.end();
    await local.end();
  }
});
