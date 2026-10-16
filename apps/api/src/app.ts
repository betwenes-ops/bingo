import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import {
  validatorCompiler,
  serializerCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type pg from 'pg';
import { credentials, purchaseRequest, roomInput } from '@bingo/protocol';
import { AppError, transaction } from './db';
import {
  authenticate,
  register,
  login,
  verifyEmail,
  recovery,
  resetPassword,
  turnstile,
  setupMfa,
  verifyTotp,
} from './identity';
import { publicInstantGame, instantCommit, playInstant } from './instant';
import { createRoom, listRooms, snapshot, purchase, proof } from './rooms';
import { audit } from './wallet';
import type { Config } from './config';
import { Registry, collectDefaultMetrics } from 'prom-client';
const idParam = z.object({ id: z.uuid() });
const tokenBody = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) });
export async function buildApp(pool: pg.Pool, config: Config) {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
    bodyLimit: 16384,
    requestTimeout: 15000,
    trustProxy: false,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);
  await app.register(cors, { origin: config.ALLOWED_ORIGINS.split(','), credentials: true });
  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 4096 } });
  await app.register(swagger, {
    openapi: { info: { title: 'Bingo Demo API', version: '0.1.0' } },
    transform: jsonSchemaTransform,
  });
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  app.addHook('onRequest', async (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      if (!origin || !config.ALLOWED_ORIGINS.split(',').includes(origin))
        throw new AppError('ORIGIN_REJECTED', 403);
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError)
      return reply.status(error.status).send({ code: error.code, correlationId: request.id });
    if ((error as { validation?: unknown }).validation)
      return reply.status(400).send({ code: 'INVALID_REQUEST', correlationId: request.id });
    request.log.error({ err: error }, 'Request failed');
    return reply.status(500).send({ code: 'INTERNAL_ERROR', correlationId: request.id });
  });
  const current = async (request: { cookies: Record<string, string | undefined> }) =>
    authenticate(pool, request.cookies.session);
  const mutation = async (request: {
    cookies: Record<string, string | undefined>;
    headers: Record<string, unknown>;
  }) => {
    const user = await current(request);
    if (request.headers['x-csrf-token'] !== user.csrf_token)
      throw new AppError('CSRF_INVALID', 403);
    return user;
  };
  const admin = async (
    request: { cookies: Record<string, string | undefined>; headers: Record<string, unknown> },
    write = false,
  ) => {
    const user = write ? await mutation(request) : await current(request);
    if (
      !['superadmin', 'operator', 'auditor'].includes(user.role) ||
      !user.mfa_verified ||
      (write && user.role === 'auditor')
    )
      throw new AppError('ADMIN_FORBIDDEN', 403);
    return user;
  };
  app.get('/health', async () => ({ status: 'ok', demo: true, realMoney: false }));
  app.get('/ready', async () => {
    await pool.query('SELECT 1');
    return { status: 'ready' };
  });
  app.get('/openapi.json', async () => app.swagger());
  app.get('/metrics', async (request, reply) => {
    await admin(request);
    return reply.type(registry.contentType).send(await registry.metrics());
  });
  app.post(
    '/v1/auth/register',
    { schema: { body: credentials }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      await turnstile(config, req.body.turnstileToken, req.ip);
      return register(pool, req.body.email, req.body.password, config.PUBLIC_WEB_URL);
    },
  );
  app.post('/v1/auth/verify-email', { schema: { body: tokenBody } }, (req) =>
    verifyEmail(pool, req.body.token),
  );
  app.post(
    '/v1/auth/login',
    { schema: { body: credentials }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      await turnstile(config, req.body.turnstileToken, req.ip);
      const result = await login(
        pool,
        req.body.email,
        req.body.password,
        config.SEED_ENCRYPTION_KEY,
        req.body.totp,
      );
      reply.setCookie('session', result.token, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 43200,
      });
      return { csrfToken: result.csrf };
    },
  );
  app.post(
    '/v1/auth/forgot-password',
    {
      schema: { body: z.object({ email: z.email(), turnstileToken: z.string().optional() }) },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      await turnstile(config, req.body.turnstileToken, req.ip);
      return recovery(pool, req.body.email, config.PUBLIC_WEB_URL);
    },
  );
  app.post(
    '/v1/auth/reset-password',
    { schema: { body: tokenBody.extend({ password: z.string().min(12).max(128) }) } },
    (req) => resetPassword(pool, req.body.token, req.body.password),
  );
  app.post('/v1/auth/logout', async (req, reply) => {
    const user = await mutation(req);
    await pool.query('DELETE FROM user_sessions WHERE id=$1', [user.session_id]);
    reply.clearCookie('session', { path: '/' });
    return { ok: true };
  });
  app.get('/v1/me', async (req) => {
    const user = await current(req);
    const w = await pool.query('SELECT balance::text,version::text FROM wallets WHERE user_id=$1', [
      user.id,
    ]);
    const m = await pool.query<{ enabled: boolean }>(
      'SELECT enabled FROM mfa_credentials WHERE user_id=$1',
      [user.id],
    );
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      balance: w.rows[0]?.balance,
      csrfToken: user.csrf_token,
      mfaEnabled: m.rows[0]?.enabled ?? false,
    };
  });
  app.get('/v1/me/sessions', async (req) => {
    const u = await current(req);
    return (
      await pool.query(
        'SELECT id,created_at,expires_at,id=$2 AS current FROM user_sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC',
        [u.id, u.session_id],
      )
    ).rows;
  });
  app.delete('/v1/me/sessions/:id', { schema: { params: idParam } }, async (req) => {
    const u = await mutation(req);
    await pool.query('DELETE FROM user_sessions WHERE id=$1 AND user_id=$2', [req.params.id, u.id]);
    return { ok: true };
  });
  app.post('/v1/auth/mfa/setup', async (req) =>
    setupMfa(pool, await mutation(req), config.SEED_ENCRYPTION_KEY),
  );
  app.post('/v1/auth/mfa/enable', { schema: { body: codeBody } }, async (req) => {
    const u = await mutation(req);
    await transaction(pool, async (tx) => {
      await verifyTotp(tx, u.id, config.SEED_ENCRYPTION_KEY, req.body.code);
      await tx.query('UPDATE mfa_credentials SET enabled=true WHERE user_id=$1', [u.id]);
      await tx.query('UPDATE user_sessions SET mfa_verified=true WHERE id=$1', [u.session_id]);
      await audit(tx, u.id, 'MFA_ENABLED', u.id);
    });
    return { enabled: true };
  });
  app.get('/v1/wallet/entries', async (req) => {
    const u = await current(req);
    return (
      await pool.query(
        `SELECT e.id,e.amount::text,t.kind,t.reference,e.created_at FROM ledger_entries e JOIN wallets w ON w.account_id=e.account_id JOIN ledger_transactions t ON t.id=e.transaction_id WHERE w.user_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 100`,
        [u.id],
      )
    ).rows;
  });
  app.get('/v1/me/limits', async (req) => {
    const u = await current(req);
    return (
      await pool.query(
        'SELECT daily_limit::text,paused_until,self_excluded FROM responsible_gaming_limits WHERE user_id=$1',
        [u.id],
      )
    ).rows[0];
  });
  app.post(
    '/v1/me/limits',
    {
      schema: {
        body: z.object({
          dailyLimit: z
            .string()
            .regex(/^\d{1,9}$/)
            .optional(),
          pauseHours: z.number().int().min(1).max(8760).optional(),
          selfExclude: z.literal(true).optional(),
        }),
      },
    },
    async (req) => {
      const u = await mutation(req);
      await transaction(pool, async (tx) => {
        const limit = await tx.query<{ daily_limit: string }>(
          'SELECT daily_limit FROM responsible_gaming_limits WHERE user_id=$1 FOR UPDATE',
          [u.id],
        );
        if (
          req.body.dailyLimit !== undefined &&
          BigInt(req.body.dailyLimit) > BigInt(limit.rows[0]!.daily_limit)
        )
          throw new AppError('LIMIT_INCREASE_REQUIRES_COOLDOWN', 409);
        await tx.query(
          "UPDATE responsible_gaming_limits SET daily_limit=COALESCE($2::bigint,daily_limit),paused_until=CASE WHEN $3::int IS NULL THEN paused_until ELSE GREATEST(COALESCE(paused_until,now()),now()+($3::int*interval '1 hour')) END,self_excluded=self_excluded OR $4 WHERE user_id=$1",
          [
            u.id,
            req.body.dailyLimit ?? null,
            req.body.pauseHours ?? null,
            req.body.selfExclude ?? false,
          ],
        );
        await audit(tx, u.id, 'LIMITS_CHANGED', u.id, req.body);
      });
      return { ok: true };
    },
  );
  app.get('/v1/instant/game', async () => publicInstantGame());
  app.post('/v1/instant/commit', async (req) => {
    const u = await mutation(req);
    return instantCommit(pool, config.SEED_ENCRYPTION_KEY, u.id);
  });
  app.post(
    '/v1/instant/play',
    {
      schema: {
        body: z.object({
          commitmentId: z.uuid(),
          clientSeed: z.string().min(16).max(128),
          stake: z.string().regex(/^\d{1,5}$/),
        }),
      },
    },
    async (req) => {
      const u = await mutation(req);
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length < 8 || key.length > 128)
        throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
      return playInstant(
        pool,
        config.SEED_ENCRYPTION_KEY,
        u.id,
        req.body.commitmentId,
        req.body.clientSeed,
        BigInt(req.body.stake),
        key,
      );
    },
  );
  app.get('/v1/instant/history', async (req) => {
    const u = await current(req);
    return (
      await pool.query(
        'SELECT id,stake::text,payout::text,game_version,result,created_at FROM instant_plays WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',
        [u.id],
      )
    ).rows;
  });
  app.get('/v1/rooms', async () => ({
    rooms: await listRooms(pool),
    serverTime: new Date().toISOString(),
  }));
  app.get('/v1/rounds/:id', { schema: { params: idParam } }, async (req) =>
    snapshot(pool, req.params.id, (await current(req)).id),
  );
  app.post(
    '/v1/rounds/:id/purchases',
    { schema: { params: idParam, body: purchaseRequest } },
    async (req) => {
      const u = await mutation(req);
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length < 8 || key.length > 128)
        throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
      return purchase(
        pool,
        config.SEED_ENCRYPTION_KEY,
        u.id,
        req.params.id,
        req.body.quantity,
        key,
      );
    },
  );
  app.get('/v1/rounds/:id/proof', { schema: { params: idParam } }, (req) =>
    proof(pool, req.params.id),
  );
  app.get(
    '/v1/rounds/:id/events',
    {
      schema: {
        params: idParam,
        querystring: z.object({ afterSeq: z.coerce.number().int().min(0).default(0) }),
      },
    },
    async (req) => {
      await current(req);
      return (
        await pool.query(
          'SELECT id AS "eventId",round_id AS "roundId",seq,type,created_at AS ts,payload,1 AS v FROM game_events WHERE round_id=$1 AND seq>$2 ORDER BY seq LIMIT 500',
          [req.params.id, req.query.afterSeq],
        )
      ).rows;
    },
  );
  // Durable WS replay is intentionally simple; batching/fan-out capacity is measured before scaling.
  let connectionCount = 0;
  const perUser = new Map<string, number>();
  app.get('/v1/realtime', { websocket: true }, async (socket, req) => {
    let userId: string | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let alive = true,
      busy = false;
    let seq = 0;
    let roundId = '';
    socket.on('pong', () => {
      alive = true;
    });
    socket.on('error', () => socket.close());
    socket.on('close', () => {
      if (timer) clearInterval(timer);
      if (userId) {
        connectionCount--;
        perUser.set(userId, Math.max(0, (perUser.get(userId) ?? 1) - 1));
      }
    });
    try {
      if (!req.headers.origin || !config.ALLOWED_ORIGINS.split(',').includes(req.headers.origin))
        throw new AppError('ORIGIN_REJECTED');
      const u = await current(req);
      if (connectionCount >= 1000 || (perUser.get(u.id) ?? 0) >= 4)
        throw new AppError('CONNECTION_LIMIT');
      userId = u.id;
      connectionCount++;
      perUser.set(userId, (perUser.get(userId) ?? 0) + 1);
      const url = new URL(req.url, 'http://localhost');
      roundId = z.uuid().parse(url.searchParams.get('roundId'));
      seq = z.coerce
        .number()
        .int()
        .min(0)
        .parse(url.searchParams.get('lastSeq') ?? 0);
      const send = async () => {
        if (busy || socket.readyState !== 1) return;
        busy = true;
        try {
          await authenticate(pool, req.cookies.session);
          if (socket.bufferedAmount > 1048576) {
            socket.close(1013, 'BACKPRESSURE');
            return;
          }
          const result = await pool.query(
            'SELECT id AS "eventId",round_id AS "roundId",seq,type,created_at AS ts,payload,1 AS v FROM game_events WHERE round_id=$1 AND seq>$2 ORDER BY seq LIMIT 500',
            [roundId, seq],
          );
          for (const e of result.rows) {
            socket.send(JSON.stringify(e));
            seq = e.seq as number;
          }
        } catch {
          socket.close(1008, 'SESSION_EXPIRED');
        } finally {
          busy = false;
        }
      };
      await send();
      let ticks = 0;
      timer = setInterval(() => {
        if (++ticks % 20 === 0) {
          if (!alive) {
            socket.terminate();
            return;
          }
          alive = false;
          socket.ping();
        }
        void send();
      }, 1000);
      socket.on('message', () => socket.close(1008, 'READ_ONLY_STREAM'));
    } catch {
      socket.close(1008, 'UNAUTHORIZED');
    }
  });
  app.get('/v1/admin/summary', async (req) => {
    await admin(req);
    const data = await pool.query(
      `SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM game_rounds WHERE state='DRAWING') AS live,(SELECT count(*)::int FROM bingo_cards) AS cards,(SELECT COALESCE(sum(amount),0)::text FROM prize_awards) AS prizes,(SELECT COALESCE(sum(balance),0)::text FROM wallets) AS balances,(SELECT count(*)::int FROM outbox_events WHERE published_at IS NULL) AS pending_events`,
    );
    return data.rows[0];
  });
  app.post('/v1/admin/rooms', { schema: { body: roomInput } }, async (req) => {
    const u = await admin(req, true);
    return createRoom(pool, config.SEED_ENCRYPTION_KEY, u.id, req.body);
  });
  app.get('/v1/admin/users', async (req) => {
    await admin(req);
    return (
      await pool.query(
        'SELECT u.id,u.email,u.role,u.blocked,u.email_verified,u.created_at,w.balance::text FROM users u JOIN wallets w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 100',
      )
    ).rows;
  });
  app.get('/v1/admin/audit', async (req) => {
    await admin(req);
    return (await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT 100'))
      .rows;
  });
  app.post('/v1/admin/reconcile', async (req) => {
    const u = await admin(req, true);
    return transaction(pool, async (tx) => {
      const result = await tx.query(
        `SELECT w.user_id,w.balance::text,COALESCE(sum(e.amount),0)::text AS ledger FROM wallets w LEFT JOIN ledger_entries e ON e.account_id=w.account_id GROUP BY w.user_id,w.balance HAVING w.balance<>COALESCE(sum(e.amount),0)`,
      );
      await tx.query('INSERT INTO reconciliation_records(discrepancies) VALUES($1)', [
        JSON.stringify(result.rows),
      ]);
      await audit(tx, u.id, 'RECONCILIATION', 'wallets', { discrepancies: result.rows.length });
      return { consistent: result.rows.length === 0, discrepancies: result.rows };
    });
  });
  return app;
}
