import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type pg from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { authenticate, verifyTotp } from './identity';
import {
  requireRole,
  requestAdjustment,
  decideAdjustment,
  setUserStatus,
  replySupport,
  report,
} from './operations';
import { controlRoom } from './rooms';
import { AppError, transaction } from './db';
import { audit } from './wallet';
import { roomInput } from '@bingo/protocol';
import type { Config } from './config';
const id = z.object({ id: z.uuid() });
const reason = z.string().trim().min(5).max(1000);
export async function managementRoutes(server: FastifyInstance, pool: pg.Pool, config: Config) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const user = async (req: FastifyRequest, write = false) => {
    const u = await authenticate(pool, req.cookies.session);
    if (write && req.headers['x-csrf-token'] !== u.csrf_token)
      throw new AppError('CSRF_INVALID', 403);
    return u;
  };
  const staff = async (req: FastifyRequest, roles: readonly string[], write = false) => {
    const u = await user(req, write);
    requireRole(u, roles);
    return u;
  };
  const readRoles = ['superadmin', 'operator', 'finance', 'support', 'auditor'];
  app.get('/v1/catalog', async () => ({
    games: (
      await pool.query(
        `SELECT g.key,g.name,v.id,v.version,v.config,v.config_hash,v.published_at,m.report,m.report_hash FROM games g JOIN game_versions v ON v.game_key=g.key LEFT JOIN game_math_models m ON m.version_id=v.id WHERE g.enabled ORDER BY v.published_at DESC`,
      )
    ).rows,
  }));
  app.get('/v1/admin/catalog', async (req) => {
    await staff(req, readRoles);
    return (
      await pool.query(
        `SELECT g.key,g.name,g.enabled,v.id,v.version,v.config,v.config_hash,v.published_at,m.report_hash FROM games g LEFT JOIN game_versions v ON v.game_key=g.key LEFT JOIN game_math_models m ON m.version_id=v.id ORDER BY g.key,v.published_at DESC`,
      )
    ).rows;
  });
  app.post(
    '/v1/admin/catalog/availability',
    {
      schema: { body: z.object({ key: z.string().min(1).max(60), enabled: z.boolean(), reason }) },
    },
    async (req) => {
      const u = await staff(req, ['superadmin', 'operator'], true);
      await transaction(pool, async (tx) => {
        const r = await tx.query('UPDATE games SET enabled=$2 WHERE key=$1 RETURNING key', [
          req.body.key,
          req.body.enabled,
        ]);
        if (!r.rowCount) throw new AppError('GAME_NOT_FOUND', 404);
        await audit(tx, u.id, 'GAME_AVAILABILITY_CHANGED', req.body.key, {
          enabled: req.body.enabled,
          reason: req.body.reason,
        });
      });
      return { ok: true };
    },
  );
  app.post(
    '/v1/admin/users/:id/status',
    { schema: { params: id, body: z.object({ blocked: z.boolean(), reason }) } },
    async (req) => {
      const u = await staff(req, ['superadmin', 'support'], true);
      return setUserStatus(pool, u.id, req.params.id, req.body.blocked, req.body.reason);
    },
  );
  app.post(
    '/v1/admin/users/:id/role',
    {
      schema: {
        params: id,
        body: z.object({
          role: z.enum(['player', 'superadmin', 'operator', 'finance', 'support', 'auditor']),
          reason,
        }),
      },
    },
    async (req) => {
      const u = await staff(req, ['superadmin'], true);
      if (u.id === req.params.id) throw new AppError('CANNOT_CHANGE_SELF', 409);
      await transaction(pool, async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock(733002)');
        const target = await tx.query<{ role: string; email_verified: boolean }>(
          'SELECT role,email_verified FROM users WHERE id=$1 FOR UPDATE',
          [req.params.id],
        );
        if (!target.rowCount || !target.rows[0]!.email_verified)
          throw new AppError('VERIFIED_USER_REQUIRED', 409);
        await tx.query('UPDATE users SET role=$2 WHERE id=$1', [req.params.id, req.body.role]);
        await tx.query('DELETE FROM user_sessions WHERE user_id=$1', [req.params.id]);
        await audit(tx, u.id, 'USER_ROLE_CHANGED', req.params.id, {
          before: target.rows[0]!.role,
          after: req.body.role,
          reason: req.body.reason,
        });
      });
      return { ok: true };
    },
  );
  app.get('/v1/admin/adjustments', async (req) => {
    await staff(req, ['superadmin', 'finance', 'auditor']);
    return (
      await pool.query(
        `SELECT a.*,a.amount::text,u.email AS target_email,r.email AS requester_email,p.email AS approver_email FROM admin_adjustments a LEFT JOIN users u ON u.id=a.user_id JOIN users r ON r.id=a.requested_by LEFT JOIN users p ON p.id=a.approved_by ORDER BY a.created_at DESC LIMIT 100`,
      )
    ).rows;
  });
  app.post(
    '/v1/admin/adjustments',
    {
      schema: {
        body: z.object({
          userId: z.uuid().nullable(),
          amount: z.string().regex(/^-?[0-9]{1,14}$/),
          reason,
        }),
      },
    },
    async (req) => {
      const u = await staff(req, ['superadmin', 'finance'], true);
      return requestAdjustment(
        pool,
        u.id,
        req.body.userId,
        BigInt(req.body.amount),
        req.body.reason,
      );
    },
  );
  app.post(
    '/v1/admin/adjustments/:id/decision',
    { schema: { params: id, body: z.object({ approve: z.boolean(), reason }) } },
    async (req) => {
      const u = await staff(req, ['superadmin', 'finance'], true);
      return decideAdjustment(pool, u.id, req.params.id, req.body.approve, req.body.reason);
    },
  );
  app.get('/v1/admin/treasury', async (req) => {
    await staff(req, ['superadmin', 'finance', 'auditor']);
    return {
      accounts: (
        await pool.query(
          `SELECT a.id,a.kind,a.reference,COALESCE(sum(e.amount),0)::text AS balance FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id WHERE a.kind<>'user' GROUP BY a.id ORDER BY a.kind,a.reference LIMIT 200`,
        )
      ).rows,
      reservations: (
        await pool.query(
          'SELECT r.id,r.round_id,r.amount::text,r.status,g.name FROM wallet_reservations r LEFT JOIN game_rounds g ON g.id=r.round_id ORDER BY r.created_at DESC LIMIT 100',
        )
      ).rows,
    };
  });
  app.get('/v1/admin/reports', async (req) => {
    await staff(req, ['superadmin', 'finance', 'auditor']);
    return {
      daily: await report(pool),
      reconciliations: (
        await pool.query('SELECT * FROM reconciliation_records ORDER BY created_at DESC LIMIT 30')
      ).rows,
    };
  });
  app.get('/v1/admin/reports.csv', async (req, reply) => {
    await staff(req, ['superadmin', 'finance', 'auditor']);
    const rows = await report(pool);
    const escape = (value: unknown) => '"' + String(value).replace(/"/g, '""') + '"';
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename=relatorio-creditos.csv')
      .send(
        '\ufeffData,Operacao,Transacoes,Centésimos de crédito\r\n' +
          rows
            .map((r) => [r.day, r.kind, r.transactions, r.volume].map(escape).join(','))
            .join('\r\n'),
      );
  });
  app.post(
    '/v1/admin/rounds/:id/control',
    {
      schema: {
        params: id,
        body: z.object({ action: z.enum(['pause', 'resume', 'cancel']), reason }),
      },
    },
    async (req) => {
      const u = await staff(req, ['superadmin', 'operator'], true);
      return controlRoom(pool, u.id, req.params.id, req.body.action, req.body.reason);
    },
  );
  app.get('/v1/admin/schedules', async (req) => {
    await staff(req, ['superadmin', 'operator', 'auditor']);
    return (await pool.query('SELECT * FROM room_schedules ORDER BY next_open_at')).rows;
  });
  app.post(
    '/v1/admin/schedules',
    {
      schema: {
        body: z.object({
          config: roomInput,
          intervalSeconds: z.number().int().min(60).max(604800),
        }),
      },
    },
    async (req) => {
      const u = await staff(req, ['superadmin', 'operator'], true);
      return transaction(pool, async (tx) => {
        const r = await tx.query<{ id: string }>(
          'INSERT INTO room_schedules(config,interval_seconds,next_open_at,created_by) VALUES($1,$2,now(),$3) RETURNING id',
          [JSON.stringify(req.body.config), req.body.intervalSeconds, u.id],
        );
        await audit(tx, u.id, 'SCHEDULE_CREATED', r.rows[0]!.id, req.body);
        return r.rows[0];
      });
    },
  );
  app.post(
    '/v1/admin/schedules/:id/status',
    { schema: { params: id, body: z.object({ enabled: z.boolean(), reason }) } },
    async (req) => {
      const u = await staff(req, ['superadmin', 'operator'], true);
      await transaction(pool, async (tx) => {
        const r = await tx.query('UPDATE room_schedules SET enabled=$2 WHERE id=$1 RETURNING id', [
          req.params.id,
          req.body.enabled,
        ]);
        if (!r.rowCount) throw new AppError('SCHEDULE_NOT_FOUND', 404);
        await audit(tx, u.id, 'SCHEDULE_CHANGED', req.params.id, req.body);
      });
      return { ok: true };
    },
  );
  app.get('/v1/me/history', async (req) => {
    const u = await user(req);
    return {
      rounds: (
        await pool.query(
          `SELECT r.id,r.name,r.variant,r.state,r.created_at,r.price::text,count(DISTINCT c.id)::int AS cards,COALESCE((SELECT sum(amount)::text FROM prize_awards WHERE round_id=r.id AND user_id=$1),'0') AS prizes FROM game_rounds r JOIN bingo_cards c ON c.round_id=r.id WHERE c.user_id=$1 GROUP BY r.id ORDER BY r.created_at DESC LIMIT 100`,
          [u.id],
        )
      ).rows,
    };
  });
  app.get('/v1/me/notifications', async (req) => {
    const u = await user(req);
    return (
      await pool.query(
        'SELECT id,type,message,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
        [u.id],
      )
    ).rows;
  });
  app.post('/v1/me/notifications/read', async (req) => {
    const u = await user(req, true);
    await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1', [
      u.id,
    ]);
    return { ok: true };
  });
  app.get('/v1/me/support', async (req) => {
    const u = await user(req);
    return {
      cases: (
        await pool.query('SELECT * FROM support_cases WHERE user_id=$1 ORDER BY created_at DESC', [
          u.id,
        ])
      ).rows,
      messages: (
        await pool.query(
          'SELECT m.* FROM support_messages m JOIN support_cases c ON c.id=m.case_id WHERE c.user_id=$1 ORDER BY m.created_at',
          [u.id],
        )
      ).rows,
    };
  });
  app.post(
    '/v1/me/support',
    {
      schema: {
        body: z.object({
          subject: z.string().trim().min(5).max(120),
          message: z.string().trim().min(10).max(4000),
        }),
      },
    },
    async (req) => {
      const u = await user(req, true);
      return transaction(pool, async (tx) => {
        const r = await tx.query<{ id: string }>(
          'INSERT INTO support_cases(user_id,subject,message) VALUES($1,$2,$3) RETURNING id',
          [u.id, req.body.subject, req.body.message],
        );
        await audit(tx, u.id, 'SUPPORT_OPENED', r.rows[0]!.id);
        return r.rows[0];
      });
    },
  );
  app.get('/v1/admin/support', async (req) => {
    await staff(req, ['superadmin', 'support', 'auditor']);
    return {
      cases: (
        await pool.query(
          'SELECT c.*,u.email FROM support_cases c JOIN users u ON u.id=c.user_id ORDER BY c.updated_at DESC LIMIT 100',
        )
      ).rows,
      messages: (
        await pool.query('SELECT m.* FROM support_messages m ORDER BY m.created_at DESC LIMIT 500')
      ).rows,
    };
  });
  app.post(
    '/v1/admin/support/:id/reply',
    {
      schema: {
        params: id,
        body: z.object({ message: z.string().trim().min(5).max(4000), close: z.boolean() }),
      },
    },
    async (req) => {
      const u = await staff(req, ['superadmin', 'support'], true);
      return replySupport(pool, u.id, req.params.id, req.body.message, req.body.close);
    },
  );
  app.get('/v1/me/export', async (req) => {
    const u = await user(req);
    const queries = {
      profile: ['SELECT id,email,created_at,anonymized_at FROM users WHERE id=$1'],
      wallet: ['SELECT balance::text,version::text FROM wallets WHERE user_id=$1'],
      entries: [
        'SELECT e.id,e.amount::text,t.kind,t.reference,e.created_at FROM ledger_entries e JOIN wallets w ON w.account_id=e.account_id JOIN ledger_transactions t ON t.id=e.transaction_id WHERE w.user_id=$1 ORDER BY e.created_at',
      ],
      cards: ['SELECT id,round_id,card FROM bingo_cards WHERE user_id=$1'],
      instant: [
        'SELECT id,stake::text,payout::text,result,created_at FROM instant_plays WHERE user_id=$1',
      ],
      limits: [
        'SELECT daily_limit::text,paused_until,self_excluded FROM responsible_gaming_limits WHERE user_id=$1',
      ],
      support: ['SELECT id,subject,message,status,created_at FROM support_cases WHERE user_id=$1'],
    };
    const result: Record<string, unknown> = { exportedAt: new Date().toISOString(), demo: true };
    for (const [k, [sql]] of Object.entries(queries))
      result[k] = (await pool.query(sql!, [u.id])).rows;
    return result;
  });
  app.post(
    '/v1/me/anonymize',
    {
      schema: {
        body: z.object({
          password: z.string().min(12).max(128),
          confirmation: z.literal('EXCLUIR MINHA CONTA'),
          totp: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        }),
      },
    },
    async (req, reply) => {
      const u = await user(req, true);
      const passwordHash = await argon2.hash(randomBytes(32).toString('hex'), {
        type: argon2.argon2id,
      });
      await transaction(pool, async (tx) => {
        const r = await tx.query<{ password_hash: string; email: string }>(
          'SELECT password_hash,email FROM users WHERE id=$1 FOR UPDATE',
          [u.id],
        );
        if (!(await argon2.verify(r.rows[0]!.password_hash, req.body.password)))
          throw new AppError('INVALID_CREDENTIALS', 403);
        const mfa = await tx.query<{ enabled: boolean }>(
          'SELECT enabled FROM mfa_credentials WHERE user_id=$1',
          [u.id],
        );
        if (mfa.rows[0]?.enabled) {
          if (!req.body.totp) throw new AppError('MFA_REQUIRED', 403);
          await verifyTotp(tx, u.id, config.SEED_ENCRYPTION_KEY, req.body.totp);
        }
        await tx.query(
          'UPDATE users SET email=$2,password_hash=$3,blocked=true,anonymized_at=now() WHERE id=$1',
          [u.id, `deleted+${u.id}@invalid.example`, passwordHash],
        );
        await tx.query('UPDATE responsible_gaming_limits SET self_excluded=true WHERE user_id=$1', [
          u.id,
        ]);
        await tx.query('DELETE FROM user_sessions WHERE user_id=$1', [u.id]);
        await tx.query('DELETE FROM identity_tokens WHERE user_id=$1', [u.id]);
        await tx.query('DELETE FROM mfa_credentials WHERE user_id=$1', [u.id]);
        await tx.query(
          "UPDATE email_outbox SET recipient='deleted@invalid.example',body='[anonymized]' WHERE recipient=$1",
          [r.rows[0]!.email],
        );
        await audit(tx, u.id, 'ACCOUNT_ANONYMIZED', u.id);
      });
      reply.clearCookie('session', { path: '/' });
      return {
        ok: true,
        message:
          'Conta desativada e dados de identificação anonimizados. Registros contábeis e de auditoria permanecem pseudonimizados.',
      };
    },
  );
  app.post('/v1/auth/rotate', async (req, reply) => {
    const u = await user(req, true);
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex');
    const { hash } = await import('@bingo/domain/rng');
    await pool.query('UPDATE user_sessions SET token_hash=$2,csrf_token=$3 WHERE id=$1', [
      u.session_id,
      hash(token),
      csrf,
    ]);
    reply.setCookie('session', token, {
      httpOnly: true,
      secure:
        config.NODE_ENV === 'production' || new URL(config.PUBLIC_WEB_URL).protocol === 'https:',
      sameSite: 'strict',
      path: '/',
      maxAge: 43200,
    });
    return { csrfToken: csrf };
  });
}
