import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  SEED_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.email().default('demo@bingo.local'),
  TURNSTILE_SECRET: z.string().optional(),
  TURNSTILE_BYPASS: z.enum(['true', 'false']).default('false'),
  REAL_MONEY_ENABLED: z.enum(['true', 'false']).default('false'),
});
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const c = schema.parse(env);
  if (c.REAL_MONEY_ENABLED === 'true') throw new Error('Real money is not implemented');
  if (c.NODE_ENV === 'production' && (c.TURNSTILE_BYPASS === 'true' || !c.TURNSTILE_SECRET))
    throw new Error('Turnstile required in production');
  return c;
}
