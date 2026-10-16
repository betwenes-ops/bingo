import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { database, transaction } from '../src/db';
import { migrate } from '../src/migrate';
import { buildApp } from '../src/app';
import { readConfig } from '../src/config';
import { recovery, resetPassword, authenticate } from '../src/identity';
import { register, verifyEmail, login, totpCode, base32 } from '../src/identity';
import { instantCommit, playInstant } from '../src/instant';
import { createRoom, purchase, advanceRound, proof, controlRoom } from '../src/rooms';
import { requestAdjustment, decideAdjustment } from '../src/operations';
import { postLedger } from '../src/wallet';
import { encryptSeed, hash, drawSequence } from '@bingo/domain/rng';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
let container: StartedPostgreSqlContainer | undefined, pool: pg.Pool, app: FastifyInstance;
const key = '12'.repeat(32),
  origin = 'http://localhost:3000';
let databaseUrl: string;
async function player(email: string) {
  await register(pool, email, 'test-password-1234', origin);
  const emailRow = await pool.query<{ body: string }>(
    'SELECT body FROM email_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1',
    [email],
  );
  const token = /verify=([a-f0-9]{64})/.exec(emailRow.rows[0]!.body)![1]!;
  await verifyEmail(pool, token);
  const user = await pool.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [email]);
  return user.rows[0]!.id;
}
const input = (overrides: Record<string, unknown> = {}) => ({
  name: 'Sala de teste — créditos fictícios',
  variant: 75 as const,
  price: '10000',
  salesSeconds: 15,
  ballIntervalMs: 1000,
  maxCards: 24,
  prizeBps: 8500,
  minPlayers: 1,
  ...overrides,
});
async function closeRoom(id: string) {
  await pool.query(
    "UPDATE game_rounds SET sales_close_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [id],
  );
}
// Tests shorten clocks through a dedicated migration-owner connection. Immutable
// rule guard remains installed; ALTER only enables controlled fault injection.
async function forceDue(id: string) {
  await pool.query(
    "UPDATE game_rounds SET next_ball_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [id],
  );
}
async function endSales(id: string) {
  await pool.query('ALTER TABLE game_rounds DISABLE TRIGGER round_rules_guard');
  try {
    await closeRoom(id);
  } finally {
    await pool.query('ALTER TABLE game_rounds ENABLE TRIGGER round_rules_guard');
  }
}
beforeAll(async () => {
  if (process.env.TEST_DATABASE_URL) databaseUrl = process.env.TEST_DATABASE_URL;
  else {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    databaseUrl = container.getConnectionUri();
  }
  pool = database(databaseUrl).pool;
  await migrate(pool);
  app = await buildApp(
    pool,
    readConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      SEED_ENCRYPTION_KEY: key,
      TURNSTILE_BYPASS: 'true',
    }),
  );
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await container?.stop();
});
describe('PostgreSQL real: identidade, integridade e recuperação', () => {
  it('migrações são idempotentes', async () => {
    await migrate(pool);
    expect((await pool.query('SELECT * FROM schema_migrations')).rowCount).toBe(4);
  });
  it('confirmação concede créditos uma única vez e recuperação revoga sessões', async () => {
    const id = await player('identity@example.test');
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [id])).rows[0]
        .balance,
    ).toBe('100000');
    const s = await login(pool, 'identity@example.test', 'test-password-1234', key);
    const me = await app.inject({ url: '/v1/me', cookies: { session: s.token } });
    expect(me.statusCode).toBe(200);
    expect(me.json().balance).toBe('100000');
    const other = await app.inject({ url: '/v1/me', cookies: { session: 'bad' } });
    expect(other.statusCode).toBe(401);
    const originalMail = await pool.query<{ body: string }>(
      'SELECT body FROM email_outbox WHERE recipient=$1 ORDER BY created_at LIMIT 1',
      ['identity@example.test'],
    );
    const originalToken = /verify=([a-f0-9]{64})/.exec(originalMail.rows[0]!.body)![1]!;
    await expect(verifyEmail(pool, originalToken)).rejects.toThrow('TOKEN_INVALID');
    await recovery(pool, 'identity@example.test', origin);
    const resetMail = await pool.query<{ body: string }>(
      'SELECT body FROM email_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1',
      ['identity@example.test'],
    );
    const resetToken = /reset=([a-f0-9]{64})/.exec(resetMail.rows[0]!.body)![1]!;
    await resetPassword(pool, resetToken, 'changed-password-1234');
    await expect(authenticate(pool, s.token)).rejects.toThrow('UNAUTHENTICATED');
    await expect(login(pool, 'identity@example.test', 'test-password-1234', key)).rejects.toThrow(
      'INVALID_CREDENTIALS',
    );
    expect(
      (await login(pool, 'identity@example.test', 'changed-password-1234', key)).token,
    ).toHaveLength(64);
  });
  it('duas compras simultâneas não gastam o mesmo saldo', async () => {
    const id = await player('concurrent@example.test');
    const room = await createRoom(pool, key, id, input({ price: '60000' }));
    const outcomes = await Promise.allSettled([
      purchase(pool, key, id, room.id, 1, 'concurrent-key-a'),
      purchase(pool, key, id, room.id, 1, 'concurrent-key-b'),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [id])).rows[0]
        .balance,
    ).toBe('40000');
    expect(
      (await pool.query('SELECT * FROM bingo_cards WHERE round_id=$1', [room.id])).rowCount,
    ).toBe(1);
  });
  it('replay da chave retorna compra original, payload divergente é rejeitado', async () => {
    const id = await player('replay@example.test');
    const room = await createRoom(pool, key, id, input());
    const [a, b] = await Promise.all([
      purchase(pool, key, id, room.id, 1, 'replay-key'),
      purchase(pool, key, id, room.id, 1, 'replay-key'),
    ]);
    expect(a).toEqual(b);
    await expect(purchase(pool, key, id, room.id, 2, 'replay-key')).rejects.toThrow(
      'IDEMPOTENCY_CONFLICT',
    );
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM card_purchases WHERE round_id=$1', [
          room.id,
        ])
      ).rows[0].count,
    ).toBe(1);
  });
  it('razão exige soma zero, não permite mutação nem linhas tardias', async () => {
    const id = await player('ledger@example.test');
    const account = (await pool.query('SELECT account_id FROM wallets WHERE user_id=$1', [id]))
      .rows[0].account_id;
    await expect(
      transaction(pool, async (tx) => {
        const h = await tx.query(
          "INSERT INTO ledger_transactions(kind,reference) VALUES('TEST','bad') RETURNING id",
        );
        await tx.query(
          'INSERT INTO ledger_entries(transaction_id,account_id,amount) VALUES($1,$2,1)',
          [h.rows[0].id, account],
        );
      }),
    ).rejects.toThrow('UNBALANCED_TRANSACTION');
    await expect(
      pool.query('UPDATE ledger_entries SET amount=amount+1 WHERE account_id=$1', [account]),
    ).rejects.toThrow('APPEND_ONLY');
    const txId = (
      await pool.query('SELECT transaction_id FROM ledger_entries WHERE account_id=$1 LIMIT 1', [
        account,
      ])
    ).rows[0].transaction_id;
    await expect(
      pool.query('INSERT INTO ledger_entries(transaction_id,account_id,amount) VALUES($1,$2,1)', [
        txId,
        account,
      ]),
    ).rejects.toThrow('TRANSACTION_ALREADY_POSTED');
  });
  it('rollback reverte saldo e lançamentos juntos', async () => {
    const id = await player('rollback@example.test');
    const w = (await pool.query('SELECT * FROM wallets WHERE user_id=$1', [id])).rows[0];
    await expect(
      transaction(pool, async (tx) => {
        await tx.query('UPDATE wallets SET balance=balance-100 WHERE user_id=$1', [id]);
        await postLedger(tx, 'TEST', 'rollback', [
          { accountId: w.account_id, amount: -100n },
          { accountId: w.account_id, amount: 100n },
        ]);
        throw new Error('INJECTED_FAILURE');
      }),
    ).rejects.toThrow('INJECTED_FAILURE');
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [id])).rows[0]
        .balance,
    ).toBe('100000');
    expect(
      (await pool.query("SELECT * FROM ledger_transactions WHERE reference='rollback'")).rowCount,
    ).toBe(0);
  });
  it('venda encerrada rejeita compra e mínimo não atingido reembolsa', async () => {
    const id = await player('refund@example.test');
    const room = await createRoom(pool, key, id, input({ minPlayers: 2 }));
    await purchase(pool, key, id, room.id, 1, 'refund-purchase');
    await endSales(room.id);
    await expect(purchase(pool, key, id, room.id, 1, 'late-purchase')).rejects.toThrow(
      'SALES_CLOSED',
    );
    await advanceRound(pool, key, room.id);
    await advanceRound(pool, key, room.id);
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [id])).rows[0]
        .balance,
    ).toBe('100000');
    expect(
      (await pool.query('SELECT state FROM game_rounds WHERE id=$1', [room.id])).rows[0].state,
    ).toBe('CANCELLED');
  });
  it('não expõe cartelas privadas ou seed antes do fim; CSRF e RBAC ativos', async () => {
    const a = await player('private-a@example.test'),
      b = await player('private-b@example.test');
    const room = await createRoom(pool, key, a, input());
    await purchase(pool, key, a, room.id, 1, 'private-key');
    const session = await login(pool, 'private-b@example.test', 'test-password-1234', key);
    const r = await app.inject({
      url: `/v1/rounds/${room.id}`,
      cookies: { session: session.token },
    });
    expect(r.json().cards).toHaveLength(0);
    expect(JSON.stringify(r.json())).not.toContain('seed_encrypted');
    expect((await app.inject({ url: `/v1/rounds/${room.id}/proof` })).statusCode).toBe(409);
    expect(
      (await app.inject({ url: '/v1/admin/users', cookies: { session: session.token } }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/rounds/${room.id}/purchases`,
          headers: { origin, 'idempotency-key': 'csrf-test-key' },
          cookies: { session: session.token },
          payload: { quantity: 1 },
        })
      ).statusCode,
    ).toBe(403);
    expect(b).not.toBe(a);
  });
  it('limites e autoexclusão bloqueiam participação sem alterar cartelas existentes', async () => {
    const id = await player('limits@example.test');
    const room = await createRoom(pool, key, id, input());
    await pool.query('UPDATE responsible_gaming_limits SET self_excluded=true WHERE user_id=$1', [
      id,
    ]);
    await expect(purchase(pool, key, id, room.id, 1, 'excluded-key')).rejects.toThrow(
      'PARTICIPATION_PAUSED',
    );
  });
  it('MFA habilitado é exigido e código não pode ser repetido', async () => {
    const id = await player('mfa@example.test');
    const secret = '23'.repeat(20);
    await pool.query(
      'INSERT INTO mfa_credentials(user_id,secret_encrypted,enabled) VALUES($1,$2,true)',
      [id, encryptSeed(secret, key)],
    );
    await expect(login(pool, 'mfa@example.test', 'test-password-1234', key)).rejects.toThrow(
      'MFA_REQUIRED',
    );
    const code = totpCode(secret, BigInt(Math.floor(Date.now() / 30000)));
    const s = await login(pool, 'mfa@example.test', 'test-password-1234', key, code);
    expect(s.token).toHaveLength(64);
    await expect(login(pool, 'mfa@example.test', 'test-password-1234', key, code)).rejects.toThrow(
      'MFA_INVALID',
    );
    expect(base32('666f6f')).toBe('MZXW6');
  });
  it('kill real de worker durante sorteio retoma sem bola/prêmio duplicado', async () => {
    const id = await player('recovery@example.test');
    const room = await createRoom(pool, key, id, input({ price: '100' }));
    await purchase(pool, key, id, room.id, 2, 'recovery-purchase');
    await endSales(room.id);
    await advanceRound(pool, key, room.id);
    const child = spawn(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), 'apps/api/test/advance-child.ts', room.id],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl, SEED_ENCRYPTION_KEY: key },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const progress = new Promise<void>((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (c) => {
        output += String(c);
        if (output.includes('COMMITTED')) resolve();
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== null && code !== 0 && !output.includes('COMMITTED'))
          reject(new Error(`Child failed ${code}`));
      });
    });
    await progress;
    child.kill('SIGKILL');
    await once(child, 'exit');
    const afterKill = (
      await pool.query('SELECT current_position FROM game_rounds WHERE id=$1', [room.id])
    ).rows[0].current_position;
    expect(afterKill).toBeGreaterThanOrEqual(1);
    for (let n = 0; n < 75; n++) {
      await forceDue(room.id);
      await Promise.all([advanceRound(pool, key, room.id), advanceRound(pool, key, room.id)]);
      const state = (await pool.query('SELECT state FROM game_rounds WHERE id=$1', [room.id]))
        .rows[0].state;
      if (state === 'COMPLETED') break;
    }
    const p = await proof(pool, room.id);
    expect(p.valid).toBe(true);
    expect(hash(p.serverSeed!)).toBe(p.commitment);
    expect(drawSequence(p.serverSeed!, p.context!, 75)).toEqual(p.sequence);
    expect(new Set(p.drawn).size).toBe(p.drawn.length);
    const awards = await pool.query('SELECT * FROM prize_awards WHERE round_id=$1', [room.id]);
    expect(awards.rowCount).toBeGreaterThan(0);
    await advanceRound(pool, key, room.id);
    expect(
      (await pool.query('SELECT * FROM prize_awards WHERE round_id=$1', [room.id])).rowCount,
    ).toBe(awards.rowCount);
  });
  it('instantâneo liquida uma vez e resultado pode ser reproduzido', async () => {
    const id = await player('instant@example.test');
    const c = await instantCommit(pool, key, id);
    const result = (await playInstant(
      pool,
      key,
      id,
      c.id,
      'client-seed-for-tests',
      100n,
      'instant-replay-key',
    )) as { serverSeed: string; context: string; drawn: number[]; payout: string };
    const replay = await playInstant(
      pool,
      key,
      id,
      c.id,
      'client-seed-for-tests',
      100n,
      'instant-replay-key',
    );
    expect(replay).toEqual(result);
    expect(hash(result.serverSeed)).toBe(c.commitment);
    expect(drawSequence(result.serverSeed, result.context, 75).slice(0, 30)).toEqual(result.drawn);
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [id])).rows[0]
        .balance,
    ).toBe((99900n + BigInt(result.payout)).toString());
  });
  it('papel runtime usa a carteira sem possuir privilégios de migração ou mutação do razão', async () => {
    execFileSync(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), 'apps/api/src/provision-local-role.ts'],
      { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl } },
    );
    const url = new URL(databaseUrl);
    url.username = 'bingo_app';
    url.password = 'local-app-only';
    const runtime = database(url.toString()).pool;
    try {
      await expect(
        runtime.query('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable'),
      ).rejects.toThrow();
      await expect(runtime.query('UPDATE ledger_entries SET amount=amount')).rejects.toThrow(
        'permission denied',
      );
      await expect(runtime.query('SELECT * FROM schema_migrations')).rejects.toThrow(
        'permission denied',
      );
      const id = await player('runtime@example.test');
      const room = await createRoom(runtime, key, id, input());
      await purchase(runtime, key, id, room.id, 1, 'runtime-purchase-key');
      expect(
        (await runtime.query('SELECT balance::text FROM wallets WHERE user_id=$1', [id])).rows[0]
          .balance,
      ).toBe('90000');
    } finally {
      await runtime.end();
    }
  });
  it('conciliação fecha e o razão global soma zero depois de todos os cenários', async () => {
    const result = await pool.query(
      'SELECT w.user_id FROM wallets w LEFT JOIN ledger_entries e ON e.account_id=w.account_id GROUP BY w.user_id,w.balance HAVING w.balance<>COALESCE(sum(e.amount),0)',
    );
    expect(result.rows).toEqual([]);
    expect(
      (await pool.query('SELECT sum(amount)::text AS total FROM ledger_entries')).rows[0].total,
    ).toBe('0');
  });
});

describe('Operação financeira e versões publicadas', () => {
  it('exige duas pessoas, aplica uma única vez e preserva a solicitação', async () => {
    const a = await player('finance-a@example.test');
    const b = await player('finance-b@example.test');
    const user = await player('adjusted@example.test');
    await pool.query("UPDATE users SET role='finance' WHERE id=ANY($1::uuid[])", [[a, b]]);
    const request = await requestAdjustment(
      pool,
      a,
      user,
      1234n,
      'Correção demonstrativa auditada',
    );
    await expect(decideAdjustment(pool, a, request.id, true, 'Aprovar')).rejects.toThrow(
      'TWO_PERSON_REQUIRED',
    );
    await expect(requestAdjustment(pool, user, user, 1n, 'Sem permissão')).rejects.toThrow(
      'ADMIN_FORBIDDEN',
    );
    const result = await decideAdjustment(
      pool,
      b,
      request.id,
      true,
      'Conferido por segunda pessoa',
    );
    expect(await decideAdjustment(pool, b, request.id, true, 'Repetição')).toEqual(result);
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [user])).rows[0]
        .balance,
    ).toBe('101234');
    await expect(
      pool.query("UPDATE admin_adjustments SET reason='alterado' WHERE id=$1", [request.id]),
    ).rejects.toThrow('ADJUSTMENT_TERMINAL');
    const debit = await requestAdjustment(pool, a, user, -200000n, 'Débito além do saldo');
    await expect(decideAdjustment(pool, b, debit.id, true, 'Conferido')).rejects.toThrow();
    expect(
      (await pool.query('SELECT status FROM admin_adjustments WHERE id=$1', [debit.id])).rows[0]
        .status,
    ).toBe('PENDING');
  });
  it('reserva prêmio fixo e estorna compra e reserva ao cancelar', async () => {
    const a = (await pool.query("SELECT id FROM users WHERE email='finance-a@example.test'"))
      .rows[0].id;
    const b = (await pool.query("SELECT id FROM users WHERE email='finance-b@example.test'"))
      .rows[0].id;
    const user = await player('fixed@example.test');
    const fund = await requestAdjustment(
      pool,
      a,
      null,
      500000n,
      'Reserva demonstrativa para prêmio',
    );
    await decideAdjustment(pool, b, fund.id, true, 'Reserva conferida');
    const room = await createRoom(
      pool,
      key,
      a,
      input({ prizePolicy: 'fixed', fixedPrize: '200000' }),
    );
    await purchase(pool, key, user, room.id, 1, 'fixed-purchase');
    await controlRoom(pool, a, room.id, 'pause', 'Pausa operacional');
    await expect(purchase(pool, key, user, room.id, 1, 'paused-purchase')).rejects.toThrow();
    await controlRoom(pool, a, room.id, 'cancel', 'Cancelamento operacional');
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [user])).rows[0]
        .balance,
    ).toBe('100000');
    expect(
      (await pool.query('SELECT status FROM wallet_reservations WHERE round_id=$1', [room.id]))
        .rows[0].status,
    ).toBe('RELEASED');
    await controlRoom(pool, a, room.id, 'cancel', 'Repetição idempotente');
    const version = (await pool.query('SELECT version_id FROM game_rounds WHERE id=$1', [room.id]))
      .rows[0].version_id;
    await expect(
      pool.query("UPDATE game_versions SET config='{}' WHERE id=$1", [version]),
    ).rejects.toThrow('APPEND_ONLY');
    await expect(
      pool.query("UPDATE game_rounds SET state='DRAWING' WHERE id=$1", [room.id]),
    ).rejects.toThrow('ROUND_TERMINAL');
  });
});

describe('Atendimento, privacidade e modalidades', () => {
  it('isola atendimento e exportação, rotaciona sessão e desativa conta', async () => {
    const id = await player('privacy@example.test');
    await player('privacy-other@example.test');
    const session = await login(pool, 'privacy@example.test', 'test-password-1234', key);
    const other = await login(pool, 'privacy-other@example.test', 'test-password-1234', key);
    const headers = { origin, 'x-csrf-token': session.csrf };
    const opened = await app.inject({
      method: 'POST',
      url: '/v1/me/support',
      cookies: { session: session.token },
      headers,
      payload: { subject: 'Ajuda com minha conta', message: 'Solicitação de atendimento privada.' },
    });
    expect(opened.statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/v1/me/support', cookies: { session: other.token } })).json().cases,
    ).toHaveLength(0);
    const exported = await app.inject({
      url: '/v1/me/export',
      cookies: { session: session.token },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().profile[0].id).toBe(id);
    expect(exported.body).not.toContain('password_hash');
    expect(
      (await app.inject({ url: '/v1/me/history', cookies: { session: session.token } })).statusCode,
    ).toBe(200);
    const deleted = await app.inject({
      method: 'POST',
      url: '/v1/me/anonymize',
      cookies: { session: session.token },
      headers,
      payload: { password: 'test-password-1234', confirmation: 'EXCLUIR MINHA CONTA' },
    });
    expect(deleted.statusCode).toBe(200);
    await expect(authenticate(pool, session.token)).rejects.toThrow('UNAUTHENTICATED');
    expect((await pool.query('SELECT email,blocked FROM users WHERE id=$1', [id])).rows[0]).toEqual(
      { email: `deleted+${id}@invalid.example`, blocked: true },
    );
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [id])).rows[0]
        .balance,
    ).toBe('100000');
  });
  for (const variant of [80, 90] as const)
    it(`liquida bingo ${variant} com sequência e prêmios verificáveis`, async () => {
      const id = await player(`variant-${variant}@example.test`);
      const room = await createRoom(pool, key, id, input({ variant }));
      await purchase(pool, key, id, room.id, 1, `variant-${variant}`);
      await endSales(room.id);
      await advanceRound(pool, key, room.id);
      for (let i = 0; i < variant; i++) {
        await forceDue(room.id);
        await advanceRound(pool, key, room.id);
        if (
          (await pool.query('SELECT state FROM game_rounds WHERE id=$1', [room.id])).rows[0]
            .state === 'COMPLETED'
        )
          break;
      }
      expect((await proof(pool, room.id)).valid).toBe(true);
      expect(
        (
          await pool.query(
            'SELECT sum(amount)::text AS total,count(DISTINCT pattern)::int AS patterns FROM prize_awards WHERE round_id=$1',
            [room.id],
          )
        ).rows[0],
      ).toEqual({ total: '8500', patterns: variant === 90 ? 3 : 1 });
      const states = (
        await pool.query('SELECT to_state FROM round_state_changes WHERE round_id=$1', [room.id])
      ).rows.map((r) => r.to_state);
      expect(states).toEqual(
        expect.arrayContaining([
          'SCHEDULED',
          'OPEN_FOR_SALES',
          'SALES_CLOSED',
          'READY',
          'DRAWING',
          'VERIFYING',
          'SETTLING',
          'COMPLETED',
        ]),
      );
    });
});

describe('Schema privado para hospedagem gerenciada', () => {
  it('isola as migrações e consultas sem alterar o schema public', async () => {
    await pool.query('CREATE SCHEMA bingo_isolation_test');
    const scoped = database(databaseUrl, 'bingo_isolation_test').pool;
    try {
      await migrate(scoped);
      expect((await scoped.query('SELECT current_schema() AS schema')).rows[0].schema).toBe(
        'bingo_isolation_test',
      );
      expect((await scoped.query('SELECT * FROM schema_migrations')).rowCount).toBe(4);
      expect((await scoped.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(
        0,
      );
      expect(
        (await pool.query('SELECT count(*)::int AS count FROM public.users')).rows[0].count,
      ).toBeGreaterThan(0);
      expect(() => database(databaseUrl, 'bingo;SET ROLE postgres')).toThrow(
        'Invalid DATABASE_SCHEMA',
      );
    } finally {
      await scoped.end();
      await pool.query('DROP SCHEMA bingo_isolation_test CASCADE');
    }
  });
});

describe('Tempo real com credencial efêmera e replay', () => {
  it('conecta sem cookie entre domínios, recupera eventos e rejeita sessão revogada', async () => {
    const { default: WebSocket } = await import('ws');
    const id = await player('socket@example.test');
    const session = await login(pool, 'socket@example.test', 'test-password-1234', key);
    const room = await createRoom(pool, key, id, input());
    const issued = await app.inject({
      method: 'POST',
      url: '/v1/realtime/ticket',
      cookies: { session: session.token },
      headers: { origin, 'x-csrf-token': session.csrf },
      payload: { roundId: room.id },
    });
    expect(issued.statusCode).toBe(200);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const endpoint =
      address.replace('http:', 'ws:') +
      `/v1/realtime?roundId=${room.id}&lastSeq=0&ticket=${encodeURIComponent(issued.json().ticket)}`;
    const socket = new WebSocket(endpoint, { headers: { origin } });
    const seen: number[] = [];
    const event = await new Promise<{ type: string; seq: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('WS_REPLAY_TIMEOUT')), 10000);
      socket.on('error', reject);
      socket.on('message', (buffer) => {
        const message = JSON.parse(String(buffer));
        seen.push(message.seq);
        if (message.type === 'ROOM_OPENED') {
          clearTimeout(timer);
          resolve(message);
        }
      });
    });
    expect(event.type).toBe('ROOM_OPENED');
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    socket.close();
    await pool.query('DELETE FROM user_sessions WHERE user_id=$1', [id]);
    const denied = new WebSocket(endpoint, { headers: { origin } });
    const [code] = await once(denied, 'close');
    expect(code).toBe(1008);
  });
});

describe('Filas transacionais independentes', () => {
  it('uma falha de e-mail agenda retentativa sem bloquear as demais mensagens', async () => {
    const { deliverEmails } = await import('../src/jobs');
    const a = await pool.query(
      "INSERT INTO email_outbox(recipient,subject,body) VALUES('retry-a@invalid.example','Teste','Conteúdo'),('retry-b@invalid.example','Teste','Conteúdo') RETURNING id",
    );
    await pool.query(
      "UPDATE email_outbox SET next_attempt_at=now()+interval '1 day' WHERE id<>ALL($1::uuid[])",
      [a.rows.map((r) => r.id)],
    );
    const delivered = await deliverEmails(pool, async (email) => {
      if (email.recipient === 'retry-a@invalid.example') throw Error('SMTP unavailable');
    });
    expect(delivered).toBe(1);
    const states = await pool.query(
      'SELECT recipient,attempts,last_error,delivered_at IS NOT NULL AS delivered,next_attempt_at>now() AS delayed FROM email_outbox WHERE id=ANY($1::uuid[]) ORDER BY recipient',
      [a.rows.map((r) => r.id)],
    );
    expect(states.rows[0]).toMatchObject({
      attempts: 1,
      last_error: 'DELIVERY_FAILED',
      delivered: false,
      delayed: true,
    });
    expect(states.rows[1]).toMatchObject({ attempts: 1, last_error: null, delivered: true });
  });
});

describe('Garantia não utiliza vendas ainda reembolsáveis', () => {
  it('preserva taxas de salas abertas para cancelamento em vez de reservar outro prêmio', async () => {
    const { availableTreasury } = await import('../src/wallet');
    const id = await player('liability@example.test');
    const house = (await pool.query("SELECT id FROM ledger_accounts WHERE reference='house'"))
      .rows[0].id as string;
    const free = await transaction(pool, (tx) => availableTreasury(tx, house));
    expect(free).toBeGreaterThan(0n);
    const held = await createRoom(
      pool,
      key,
      id,
      input({ prizePolicy: 'fixed', fixedPrize: free.toString() }),
    );
    const sale = await createRoom(pool, key, id, input());
    await purchase(pool, key, id, sale.id, 1, 'refundable-liability');
    expect(await transaction(pool, (tx) => availableTreasury(tx, house))).toBe(0n);
    await expect(
      createRoom(pool, key, id, input({ prizePolicy: 'fixed', fixedPrize: '1' })),
    ).rejects.toThrow('GUARANTEE_FUND_INSUFFICIENT');
    await controlRoom(pool, id, sale.id, 'cancel', 'Estorno de venda ainda aberta');
    await controlRoom(pool, id, held.id, 'cancel', 'Liberação do fundo de teste');
    expect(
      (await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [id])).rows[0]
        .balance,
    ).toBe('100000');
    expect(await transaction(pool, (tx) => availableTreasury(tx, house))).toBe(free);
  });
});
