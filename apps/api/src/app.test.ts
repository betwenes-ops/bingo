import { afterAll, beforeAll, it, expect } from 'vitest';
import { database } from './db';
import { readConfig } from './config';
import { buildApp } from './app';
const config = readConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  SEED_ENCRYPTION_KEY: '11'.repeat(32),
  TURNSTILE_BYPASS: 'false',
});
const { pool } = database(config.DATABASE_URL);
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp(pool, config);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
it('saúde declara demonstração e não ativa operações monetárias', async () => {
  const r = await app.inject({ url: '/health' });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({ status: 'ok', demo: true, realMoney: false });
  expect(() =>
    readConfig({
      ...process.env,
      ...config,
      PORT: String(config.PORT),
      REAL_MONEY_ENABLED: 'true',
    }),
  ).toThrow('Real money');
  expect(() =>
    readConfig({
      ...process.env,
      ...config,
      PORT: String(config.PORT),
      NODE_ENV: 'production',
      TURNSTILE_BYPASS: 'true',
    }),
  ).toThrow('Turnstile');
});
it('schemas rejeitam entrada inválida e mutações recusam origem externa', async () => {
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { origin: 'http://localhost:3000' },
        payload: { email: 'invalid', password: 'short' },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { origin: 'https://evil.example' },
        payload: { email: 'a@example.com', password: 'long-password' },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { origin: 'http://localhost:3000' },
        payload: { email: 'a@example.com', password: 'long-password' },
      })
    ).json().code,
  ).toBe('CAPTCHA_REQUIRED');
});
it('rotas privadas exigem sessão e OpenAPI deriva dos schemas', async () => {
  expect((await app.inject({ url: '/v1/me' })).statusCode).toBe(401);
  expect((await app.inject({ url: '/v1/admin/users' })).statusCode).toBe(401);
  const spec = (await app.inject({ url: '/openapi.json' })).json();
  expect(spec.paths['/v1/auth/register'].post.requestBody).toBeDefined();
});
