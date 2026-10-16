import { readConfig } from './config';
import { database } from './db';
import { buildApp } from './app';
const config = readConfig();
const { pool } = database(config.DATABASE_URL);
const app = await buildApp(pool, config);
await app.listen({ port: config.PORT, host: '0.0.0.0' });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void app.close().then(() => pool.end());
  });
