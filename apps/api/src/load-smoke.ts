/** Isolated CI load probe; refuses production databases and remote API hosts. */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { Redis } from 'ioredis';
import { database, transaction } from './db';
import { postLedger } from './wallet';
import { createRoom, advanceRound, proof } from './rooms';
import { issueSocketTicket } from './realtime';
import { hash } from '@bingo/domain/rng';
import { publishEvents } from './jobs';
const base = new URL(process.env.LOAD_API_URL ?? 'http://127.0.0.1:4000');
if (
  process.env.NODE_ENV !== 'test' ||
  !['127.0.0.1', 'localhost'].includes(base.hostname) ||
  !process.env.E2E_DATABASE_URL
)
  throw Error('Load probe requires isolated local test stack');
const { pool } = database(process.env.E2E_DATABASE_URL);
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
redis.on('error', () => {});
const clients: WebSocket[] = [],
  latencies: number[] = [],
  sequences = new Map<number, number>();
let duplicates = 0,
  gaps = 0;
const count = 100,
  key = process.env.SEED_ENCRYPTION_KEY!,
  origin = 'http://localhost:3000';
try {
  if ((await pool.query('SELECT current_database() AS name')).rows[0].name !== 'bingo_e2e')
    throw Error('Unexpected database: refusing to create fixtures');
  const people = Array.from({ length: count }, () => ({
    id: randomUUID(),
    account: randomUUID(),
    session: randomUUID(),
    token: randomBytes(32).toString('hex'),
    csrf: randomBytes(16).toString('hex'),
  }));
  await transaction(pool, async (tx) => {
    const entries: { accountId: string; amount: bigint }[] = [];
    for (const person of people) {
      await tx.query(
        "INSERT INTO users(id,email,password_hash,email_verified) VALUES($1,$2,'LOAD_TEST_NO_PASSWORD',true)",
        [person.id, `load-${person.id}@example.test`],
      );
      await tx.query("INSERT INTO ledger_accounts(id,owner_id,kind) VALUES($1,$2,'user')", [
        person.account,
        person.id,
      ]);
      await tx.query('INSERT INTO wallets(user_id,account_id,balance) VALUES($1,$2,100000)', [
        person.id,
        person.account,
      ]);
      await tx.query('INSERT INTO responsible_gaming_limits(user_id) VALUES($1)', [person.id]);
      await tx.query(
        "INSERT INTO user_sessions(id,user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes')",
        [person.session, person.id, hash(person.token), person.csrf],
      );
      entries.push({ accountId: person.account, amount: 100000n });
    }
    const source = (await tx.query("SELECT id FROM ledger_accounts WHERE reference='demo-source'"))
      .rows[0].id as string;
    entries.push({ accountId: source, amount: -BigInt(count) * 100000n });
    await postLedger(tx, 'LOAD_FIXTURE', randomUUID(), entries);
  });
  const room = await createRoom(pool, key, people[0]!.id, {
    name: 'Carga CI — 100 participantes fictícios',
    variant: 75,
    price: '100',
    salesSeconds: 60,
    ballIntervalMs: 1000,
    maxCards: 24,
    prizeBps: 8500,
    minPlayers: 1,
  });
  const finished = new Set<number>();
  const started = Date.now();
  await Promise.all(
    people.map(
      (person, index) =>
        new Promise<void>((resolve, reject) => {
          const ticket = issueSocketTicket(key, person.session, person.id, room.id);
          const url = new URL('/v1/realtime', base);
          url.protocol = 'ws:';
          url.searchParams.set('roundId', room.id);
          url.searchParams.set('lastSeq', '0');
          url.searchParams.set('ticket', ticket);
          const client = new WebSocket(url, { headers: { origin } });
          clients.push(client);
          const timeout = setTimeout(() => reject(Error('WS_OPEN_TIMEOUT')), 15000);
          client.once('open', () => {
            clearTimeout(timeout);
            resolve();
          });
          client.on('error', reject);
          client.on('message', (buffer) => {
            const event = JSON.parse(String(buffer)) as { seq: number; type: string; ts: string };
            const previous = sequences.get(index) ?? 0;
            if (event.seq <= previous) duplicates++;
            else {
              if (event.seq !== previous + 1) gaps++;
              sequences.set(index, event.seq);
            }
            if (event.type === 'BALL_DRAWN')
              latencies.push(Math.max(0, Date.now() - Date.parse(event.ts)));
            if (event.type === 'GAME_FINISHED') finished.add(index);
          });
        }),
    ),
  );
  await Promise.all(
    people.map(async (person) => {
      const response = await fetch(new URL(`/v1/rounds/${room.id}/purchases`, base), {
        method: 'POST',
        headers: {
          origin,
          cookie: `session=${person.token}`,
          'x-csrf-token': person.csrf,
          'idempotency-key': randomUUID(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ quantity: 1 }),
      });
      if (!response.ok) throw Error(`PURCHASE_${response.status}: ${await response.text()}`);
    }),
  );
  await pool.query('ALTER TABLE game_rounds DISABLE TRIGGER round_rules_guard');
  try {
    await pool.query(
      "UPDATE game_rounds SET sales_close_at=now()-interval '1 second' WHERE id=$1",
      [room.id],
    );
  } finally {
    await pool.query('ALTER TABLE game_rounds ENABLE TRIGGER round_rules_guard');
  }
  await advanceRound(pool, key, room.id);
  for (let i = 0; i < 75; i++) {
    await pool.query("UPDATE game_rounds SET next_ball_at=now()-interval '1 second' WHERE id=$1", [
      room.id,
    ]);
    await advanceRound(pool, key, room.id);
    await publishEvents(pool, (channel, data) => redis.publish(channel, data));
    if (
      (await pool.query('SELECT state FROM game_rounds WHERE id=$1', [room.id])).rows[0].state ===
      'COMPLETED'
    )
      break;
  }
  const deadline = Date.now() + 10000;
  while (finished.size < count && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 50));
  const verified = await proof(pool, room.id);
  const balance = (
    await pool.query(
      'SELECT sum(balance)::text AS total FROM wallets WHERE user_id=ANY($1::uuid[])',
      [people.map((p) => p.id)],
    )
  ).rows[0].total as string;
  const discrepancies = (
    await pool.query(
      'SELECT w.user_id FROM wallets w LEFT JOIN ledger_entries e ON e.account_id=w.account_id GROUP BY w.user_id,w.balance HAVING w.balance<>COALESCE(sum(e.amount),0)',
    )
  ).rowCount;
  if (
    duplicates ||
    gaps ||
    finished.size !== count ||
    !verified.valid ||
    balance !== (BigInt(count) * 100000n - 1500n).toString() ||
    discrepancies
  )
    throw Error(
      `INCONSISTENT_LOAD_RESULT:${JSON.stringify({ duplicates, gaps, finished: finished.size, balance, discrepancies })}`,
    );
  latencies.sort((a, b) => a - b);
  const percentile = (p: number) =>
    latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
  const report = {
    participants: count,
    completedClients: finished.size,
    ballDeliveries: latencies.length,
    duplicates,
    gaps,
    financialDiscrepancies: discrepancies,
    proofValid: verified.valid,
    eventLatencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
    durationMs: Date.now() - started,
    accelerated: true,
    scope:
      'Single room, real PostgreSQL and Redis, 100 synthetic users on isolated CI. Draw clock accelerated; not a production capacity certification.',
  };
  await mkdir('../../test-results', { recursive: true });
  await writeFile('../../test-results/load-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  for (const client of clients) client.terminate();
  redis.disconnect();
  await pool.end();
}
