import type pg from 'pg';
import {
  generateCard,
  wins,
  splitPrize,
  prizeFund,
  type Variant,
  type Card,
  type Pattern,
  canTransition,
  type RoundState,
} from '@bingo/domain';
import {
  hash,
  newSeed,
  encryptSeed,
  decryptSeed,
  deterministicRandom,
  drawSequence,
  algorithmVersion,
} from '@bingo/domain/rng';
import { roomInput } from '@bingo/protocol';
import type { z } from 'zod';
import { ensureVersion } from './catalog';
import { AppError, transaction, type Tx } from './db';
import { wallet, moveBalance, postLedger, audit, checkLimits } from './wallet';

export type Round = {
  id: string;
  name: string;
  variant: Variant;
  state: RoundState;
  opens_at: Date;
  sales_paused: boolean;
  version_id: string;
  price: string;
  max_cards: number;
  prize_bps: number;
  min_players: number;
  sales_close_at: Date;
  ball_interval_ms: number;
  next_ball_at: Date | null;
  commitment: string;
  seed_encrypted: string;
  seed_revealed: string | null;
  manifest_hash: string | null;
  context: string | null;
  sequence_encrypted: string | null;
  current_position: number;
  event_seq: number;
  prize_account_id: string;
  rules: {
    patterns: { pattern: Pattern; bps: number }[];
    policy: 'fixed' | 'proportional';
    fixedPrize?: string;
  };
};
export async function event(tx: Tx, roundId: string, type: string, payload: unknown) {
  const seq = await tx.query<{ event_seq: number }>(
    'UPDATE game_rounds SET event_seq=event_seq+1 WHERE id=$1 RETURNING event_seq',
    [roundId],
  );
  const e = await tx.query<{ id: string }>(
    `INSERT INTO game_events(round_id,seq,type,payload) VALUES($1,$2,$3,$4) RETURNING id`,
    [roundId, seq.rows[0]!.event_seq, type, JSON.stringify(payload)],
  );
  await tx.query('INSERT INTO outbox_events(event_id) VALUES($1)', [e.rows[0]!.id]);
}
export async function transition(tx: Tx, id: string, from: RoundState, to: RoundState) {
  if (!canTransition(from, to)) throw new AppError('INVALID_STATE_TRANSITION', 409);
  await event(tx, id, 'STATE_CHANGED', { from, to });
  const changed = await tx.query(
    'UPDATE game_rounds SET state=$3 WHERE id=$1 AND state=$2 RETURNING id',
    [id, from, to],
  );
  if (!changed.rowCount) throw new AppError('STATE_CONFLICT', 409);
  await tx.query('INSERT INTO round_state_changes(round_id,from_state,to_state) VALUES($1,$2,$3)', [
    id,
    from,
    to,
  ]);
}
export async function checkpoint(tx: Tx, id: string) {
  await tx.query(
    `INSERT INTO round_snapshots(round_id,seq,public_state) SELECT r.id,r.event_seq,jsonb_build_object('id',r.id,'state',r.state,'position',r.current_position,'commitment',r.commitment,'balls',COALESCE((SELECT jsonb_agg(number ORDER BY position) FROM drawn_balls WHERE round_id=r.id),'[]'::jsonb)) FROM game_rounds r WHERE r.id=$1 ON CONFLICT DO NOTHING`,
    [id],
  );
}
export async function createRoom(
  pool: pg.Pool,
  key: string,
  actor: string,
  input: z.infer<typeof roomInput>,
) {
  return transaction(pool, (tx) => createRound(tx, key, actor, roomInput.parse(input)));
}
export async function createRound(
  tx: Tx,
  key: string,
  actor: string,
  input: z.infer<typeof roomInput>,
) {
  const seed = newSeed();
  const account = await tx.query<{ id: string }>(
    "INSERT INTO ledger_accounts(kind) VALUES('prize') RETURNING id",
  );
  const patterns =
    input.variant === 90
      ? [
          { pattern: 'line', bps: 2000 },
          { pattern: 'two-lines', bps: 3000 },
          { pattern: 'full', bps: 5000 },
        ]
      : [{ pattern: input.pattern ?? 'full', bps: 10000 }];
  const engineConfig = { variant: input.variant, algorithmVersion, patterns };
  const version = await ensureVersion(
    tx,
    `bingo-${input.variant}`,
    `v1-${hash(JSON.stringify(engineConfig)).slice(0, 12)}`,
    engineConfig,
    actor,
  );
  const rules = {
    ...engineConfig,
    remainder: 'card-id-ascending',
    policy: input.prizePolicy ?? 'proportional',
    fixedPrize: input.fixedPrize ?? null,
    demo: true,
  };
  if (rules.policy === 'fixed' && (!input.fixedPrize || BigInt(input.fixedPrize) <= 0n))
    throw new AppError('FIXED_PRIZE_REQUIRED');
  const starts = input.startsInSeconds ?? 0;
  const row = await tx.query<{ id: string }>(
    `INSERT INTO game_rounds(name,variant,state,price,max_cards,prize_bps,min_players,opens_at,sales_close_at,ball_interval_ms,commitment,seed_encrypted,prize_account_id,rules,version_id) VALUES($1,$2,'CREATED',$3,$4,$5,$6,now()+($7::int*interval '1 second'),now()+(($7::int+$8::int)*interval '1 second'),$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      input.name,
      input.variant,
      input.price,
      input.maxCards,
      input.prizeBps,
      input.minPlayers,
      starts,
      input.salesSeconds,
      input.ballIntervalMs,
      hash(seed),
      encryptSeed(seed, key),
      account.rows[0]!.id,
      JSON.stringify(rules),
      version.id,
    ],
  );
  const id = row.rows[0]!.id;
  if (rules.policy === 'fixed') {
    const house = (
      await tx.query<{ id: string }>(
        "SELECT id FROM ledger_accounts WHERE reference='house' FOR UPDATE",
      )
    ).rows[0]!.id;
    const balance = (
      await tx.query<{ balance: string }>(
        'SELECT COALESCE(sum(amount),0)::text AS balance FROM ledger_entries WHERE account_id=$1',
        [house],
      )
    ).rows[0]!.balance;
    const amount = BigInt(input.fixedPrize!);
    if (BigInt(balance) < amount) throw new AppError('GUARANTEE_FUND_INSUFFICIENT', 409);
    await postLedger(tx, 'PRIZE_RESERVATION', id, [
      { accountId: house, amount: -amount },
      { accountId: account.rows[0]!.id, amount },
    ]);
    await tx.query(
      "INSERT INTO wallet_reservations(round_id,source_account_id,held_account_id,amount,status) VALUES($1,$2,$3,$4,'HELD')",
      [id, house, account.rows[0]!.id, amount.toString()],
    );
  }
  await audit(tx, actor, 'ROOM_CREATED', id, input);
  await transition(tx, id, 'CREATED', 'SCHEDULED');
  if (starts === 0) {
    await transition(tx, id, 'SCHEDULED', 'OPEN_FOR_SALES');
    await event(tx, id, 'ROOM_OPENED', { name: input.name });
  }
  await checkpoint(tx, id);
  return { id };
}
export async function purchase(
  pool: pg.Pool,
  key: string,
  userId: string,
  roundId: string,
  quantity: number,
  idempotencyKey: string,
) {
  return transaction(pool, async (tx) => {
    const requestHash = hash(JSON.stringify({ roundId, quantity }));
    const operation = `purchase:${roundId}`;
    // Per-user lock serializes idempotency and financial mutations across different rooms.
    // Room always precedes wallet; other purchase paths must keep this order.
    const r = await tx.query<Round>('SELECT * FROM game_rounds WHERE id=$1 FOR UPDATE', [roundId]);
    const round = r.rows[0];
    if (!round) throw new AppError('ROUND_NOT_FOUND', 404);
    const w = await wallet(tx, userId);
    const old = await tx.query<{ request_hash: string; response: unknown }>(
      'SELECT request_hash,response FROM idempotency_keys WHERE user_id=$1 AND operation=$2 AND key=$3',
      [userId, operation, idempotencyKey],
    );
    if (old.rowCount) {
      if (old.rows[0]!.request_hash !== requestHash)
        throw new AppError('IDEMPOTENCY_CONFLICT', 409);
      return old.rows[0]!.response;
    }
    const now = await tx.query<{ open: boolean }>(
      'SELECT $1::timestamptz>clock_timestamp() AS open',
      [round.sales_close_at],
    );
    if (round.sales_paused) throw new AppError('SALES_PAUSED', 409);
    if (round.state !== 'OPEN_FOR_SALES' || !now.rows[0]!.open)
      throw new AppError('SALES_CLOSED', 409);
    const bought = await tx.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM bingo_cards WHERE round_id=$1 AND user_id=$2',
      [roundId, userId],
    );
    if (Number(bought.rows[0]!.count) + quantity > round.max_cards)
      throw new AppError('CARD_LIMIT', 409);
    const total = BigInt(round.price) * BigInt(quantity);
    await checkLimits(tx, userId, total);
    if (BigInt(w.balance) < total) throw new AppError('INSUFFICIENT_CREDITS', 409);
    const sale = await tx.query<{ id: string }>(
      'INSERT INTO card_purchases(user_id,round_id,quantity,total) VALUES($1,$2,$3,$4) RETURNING id',
      [userId, roundId, quantity, total.toString()],
    );
    const purchaseId = sale.rows[0]!.id;
    const seed = decryptSeed(round.seed_encrypted, key);
    const cards = [];
    for (let i = 0; i < quantity; i++) {
      const card = generateCard(
        round.variant,
        deterministicRandom(seed, `card:${roundId}:${purchaseId}:${i}`),
      );
      const row = await tx.query<{ id: string }>(
        'INSERT INTO bingo_cards(purchase_id,user_id,round_id,card) VALUES($1,$2,$3,$4) RETURNING id',
        [purchaseId, userId, roundId, JSON.stringify(card)],
      );
      cards.push({ id: row.rows[0]!.id, card });
    }
    // Per-purchase rounding is the published accounting basis, not rounding aggregate revenue.
    const fund = round.rules.policy === 'fixed' ? 0n : prizeFund(total, round.prize_bps);
    const house = await tx.query<{ id: string }>(
      "SELECT id FROM ledger_accounts WHERE reference='house'",
    );
    await postLedger(tx, 'CARD_PURCHASE', purchaseId, [
      { accountId: w.account_id, amount: -total },
      { accountId: round.prize_account_id, amount: fund },
      { accountId: house.rows[0]!.id, amount: total - fund },
    ]);
    await moveBalance(tx, userId, -total);
    const response = { purchaseId, cards, total: total.toString() };
    await tx.query(
      'INSERT INTO idempotency_keys(user_id,operation,key,request_hash,response) VALUES($1,$2,$3,$4,$5)',
      [userId, operation, idempotencyKey, requestHash, JSON.stringify(response)],
    );
    await audit(tx, userId, 'CARD_PURCHASE', purchaseId, {
      roundId,
      quantity,
      total: total.toString(),
    });
    await event(tx, roundId, 'CARD_PURCHASED', { quantity });
    return response;
  });
}
async function refund(tx: Tx, round: Round, reason = 'MINIMUM_NOT_MET') {
  const purchases = await tx.query<{ id: string; user_id: string; total: string }>(
    'SELECT * FROM card_purchases WHERE round_id=$1 ORDER BY user_id,id',
    [round.id],
  );
  const house = await tx.query<{ id: string }>(
    "SELECT id FROM ledger_accounts WHERE reference='house'",
  );
  for (const p of purchases.rows) {
    const w = await wallet(tx, p.user_id);
    const total = BigInt(p.total),
      fund = round.rules.policy === 'fixed' ? 0n : prizeFund(total, round.prize_bps);
    await postLedger(tx, 'REFUND', p.id, [
      { accountId: w.account_id, amount: total },
      { accountId: round.prize_account_id, amount: -fund },
      { accountId: house.rows[0]!.id, amount: -(total - fund) },
    ]);
    await moveBalance(tx, p.user_id, total);
  }
  const reserve = await tx.query<{ id: string; source_account_id: string; amount: string }>(
    "SELECT * FROM wallet_reservations WHERE round_id=$1 AND status='HELD' FOR UPDATE",
    [round.id],
  );
  if (reserve.rowCount) {
    const held = reserve.rows[0]!;
    await postLedger(tx, 'RESERVATION_RELEASE', held.id, [
      { accountId: round.prize_account_id, amount: -BigInt(held.amount) },
      { accountId: held.source_account_id, amount: BigInt(held.amount) },
    ]);
    await tx.query("UPDATE wallet_reservations SET status='RELEASED' WHERE id=$1", [held.id]);
  }
  await event(tx, round.id, 'GAME_CANCELLED', { reason });
  await transition(tx, round.id, round.state, 'CANCELLED');
  await checkpoint(tx, round.id);
}
export async function controlRoom(
  pool: pg.Pool,
  actor: string,
  id: string,
  action: 'pause' | 'resume' | 'cancel',
  reason: string,
) {
  return transaction(pool, async (tx) => {
    const result = await tx.query<Round>('SELECT * FROM game_rounds WHERE id=$1 FOR UPDATE', [id]);
    const r = result.rows[0];
    if (!r) throw new AppError('ROUND_NOT_FOUND', 404);
    if (action === 'cancel' && r.state === 'CANCELLED') return { ok: true };
    if (!['SCHEDULED', 'OPEN_FOR_SALES', 'SALES_CLOSED', 'READY'].includes(r.state))
      throw new AppError('ROUND_CANNOT_BE_CHANGED', 409);
    if (action === 'cancel') await refund(tx, r, reason);
    else {
      if (r.state !== 'OPEN_FOR_SALES') throw new AppError('SALES_NOT_OPEN', 409);
      await tx.query('UPDATE game_rounds SET sales_paused=$2 WHERE id=$1', [
        id,
        action === 'pause',
      ]);
      await event(tx, id, 'SALES_PAUSE_CHANGED', { paused: action === 'pause' });
    }
    await audit(tx, actor, `ROOM_${action.toUpperCase()}`, id, { reason });
    return { ok: true };
  });
}
export async function advanceRound(pool: pg.Pool, key: string, roundId: string) {
  return transaction(pool, async (tx) => {
    const lock = await tx.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',
      [roundId],
    );
    if (!lock.rows[0]!.locked) return;
    const selected = await tx.query<Round>('SELECT * FROM game_rounds WHERE id=$1 FOR UPDATE', [
      roundId,
    ]);
    const r = selected.rows[0];
    if (!r || ['COMPLETED', 'CANCELLED', 'FAILED'].includes(r.state)) return;
    if (r.state === 'SCHEDULED') {
      const due = await tx.query<{ due: boolean }>(
        'SELECT $1::timestamptz<=clock_timestamp() AS due',
        [r.opens_at],
      );
      if (due.rows[0]!.due) {
        await transition(tx, r.id, 'SCHEDULED', 'OPEN_FOR_SALES');
        await event(tx, r.id, 'ROOM_OPENED', { name: r.name });
      }
      return;
    }
    const ready = await tx.query<{ due: boolean }>(
      "SELECT CASE WHEN $1='OPEN_FOR_SALES' THEN $2::timestamptz<=clock_timestamp() ELSE $3::timestamptz<=clock_timestamp() END AS due",
      [r.state, r.sales_close_at, r.next_ball_at],
    );
    if (!ready.rows[0]!.due) return;
    if (r.state === 'OPEN_FOR_SALES') {
      const players = await tx.query<{ count: string }>(
        'SELECT count(DISTINCT user_id)::text AS count FROM bingo_cards WHERE round_id=$1',
        [r.id],
      );
      if (Number(players.rows[0]!.count) < r.min_players) {
        await refund(tx, r);
        return;
      }
      const cards = await tx.query<{ id: string; card: Card }>(
        'SELECT id,card FROM bingo_cards WHERE round_id=$1 ORDER BY id',
        [r.id],
      );
      const manifestHash = hash(JSON.stringify(cards.rows));
      const context = JSON.stringify([algorithmVersion, r.id, manifestHash, 0]);
      const sequence = drawSequence(decryptSeed(r.seed_encrypted, key), context, r.variant);
      await transition(tx, r.id, 'OPEN_FOR_SALES', 'SALES_CLOSED');
      await tx.query(
        'UPDATE game_rounds SET manifest_hash=$2,context=$3,sequence_encrypted=$4,next_ball_at=clock_timestamp() WHERE id=$1',
        [r.id, manifestHash, context, encryptSeed(JSON.stringify(sequence), key)],
      );
      await event(tx, r.id, 'SALES_CLOSED', { manifestHash });
      await transition(tx, r.id, 'SALES_CLOSED', 'READY');
      await transition(tx, r.id, 'READY', 'DRAWING');
      await event(tx, r.id, 'GAME_STARTED', { variant: r.variant });
      await checkpoint(tx, r.id);
      return;
    }
    if (r.state !== 'DRAWING') return;
    const sequence = JSON.parse(decryptSeed(r.sequence_encrypted!, key)) as number[];
    const position = r.current_position + 1;
    const number = sequence[position - 1];
    if (number === undefined) throw new AppError('SEQUENCE_EXHAUSTED', 500);
    await tx.query('INSERT INTO drawn_balls(round_id,position,number) VALUES($1,$2,$3)', [
      r.id,
      position,
      number,
    ]);
    await tx.query(
      "UPDATE game_rounds SET current_position=$2,next_ball_at=clock_timestamp()+($3::int*interval '1 millisecond') WHERE id=$1",
      [r.id, position, r.ball_interval_ms],
    );
    await event(tx, r.id, 'BALL_DRAWN', { number, position });
    const drawn = sequence.slice(0, position);
    const cards = await tx.query<{ id: string; user_id: string; card: Card }>(
      'SELECT id,user_id,card FROM bingo_cards WHERE round_id=$1 ORDER BY user_id,id',
      [r.id],
    );
    const revenues = await tx.query<{ fund: string }>(
      'SELECT COALESCE(sum((total*$2::bigint)/10000),0)::text AS fund FROM card_purchases WHERE round_id=$1',
      [r.id, r.prize_bps],
    );
    const totalFund =
      r.rules.policy === 'fixed' ? BigInt(r.rules.fixedPrize!) : BigInt(revenues.rows[0]!.fund);
    const completed = await tx.query<{ pattern: Pattern }>(
      'SELECT DISTINCT pattern FROM prize_awards WHERE round_id=$1',
      [r.id],
    );
    const completedSet = new Set(completed.rows.map((x) => x.pattern));
    const finishing = r.rules.patterns.every(
      (p) => completedSet.has(p.pattern) || cards.rows.some((c) => wins(c.card, p.pattern, drawn)),
    );
    if (finishing) {
      await transition(tx, r.id, 'DRAWING', 'VERIFYING');
      await transition(tx, r.id, 'VERIFYING', 'SETTLING');
    }
    for (const userId of [...new Set(cards.rows.map((c) => c.user_id))].sort())
      await wallet(tx, userId);
    let previousAllocation = 0n;
    for (const [index, p] of r.rules.patterns.entries()) {
      const allocation =
        index === r.rules.patterns.length - 1
          ? totalFund - previousAllocation
          : prizeFund(totalFund, p.bps);
      previousAllocation += allocation;
      const existing = await tx.query(
        'SELECT id FROM prize_awards WHERE round_id=$1 AND pattern=$2 LIMIT 1',
        [r.id, p.pattern],
      );
      if (existing.rowCount) continue;
      const winners = cards.rows.filter((c) => wins(c.card, p.pattern, drawn));
      if (!winners.length) continue;
      const split = splitPrize(
        allocation,
        winners.map((c) => c.id),
      );
      // All users in this batch are locked in deterministic ID order.
      for (const winner of winners) {
        const amount = split.get(winner.id)!;
        const w = await wallet(tx, winner.user_id);
        const award = await tx.query<{ id: string }>(
          'INSERT INTO prize_awards(round_id,card_id,user_id,pattern,amount) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [r.id, winner.id, winner.user_id, p.pattern, amount.toString()],
        );
        if (amount > 0n) {
          await postLedger(tx, 'PRIZE', award.rows[0]!.id, [
            { accountId: r.prize_account_id, amount: -amount },
            { accountId: w.account_id, amount },
          ]);
          await moveBalance(tx, winner.user_id, amount);
        }
      }
      await event(tx, r.id, 'PATTERN_COMPLETED', {
        pattern: p.pattern,
        winners: winners.map((c) => ({ cardId: c.id, amount: split.get(c.id)!.toString() })),
      });
      await event(tx, r.id, 'PRIZE_CONFIRMED', {
        pattern: p.pattern,
        total: allocation.toString(),
      });
    }
    if (finishing) {
      await event(tx, r.id, 'GAME_FINISHED', { position });
      await tx.query('UPDATE game_rounds SET seed_revealed=$2,next_ball_at=NULL WHERE id=$1', [
        r.id,
        decryptSeed(r.seed_encrypted, key),
      ]);
      await transition(tx, r.id, 'SETTLING', 'COMPLETED');
      await tx.query(
        "UPDATE wallet_reservations SET status='CONSUMED' WHERE round_id=$1 AND status='HELD'",
        [r.id],
      );
      await audit(tx, null, 'ROUND_COMPLETED', r.id, { position });
    }
    if (finishing || position % 10 === 0) await checkpoint(tx, r.id);
  });
}
export async function listRooms(pool: pg.Pool) {
  return (
    await pool.query(`SELECT r.id,r.name,r.variant,r.state,r.price::text,r.max_cards,r.prize_bps,r.min_players,r.sales_close_at,r.opens_at,r.sales_paused,r.version_id,r.commitment,r.current_position,r.rules,
 (SELECT count(DISTINCT user_id)::int FROM bingo_cards WHERE round_id=r.id) AS players,
 (SELECT count(*)::int FROM bingo_cards WHERE round_id=r.id) AS cards,
 (CASE WHEN r.rules->>'policy'='fixed' THEN r.rules->>'fixedPrize' ELSE (SELECT COALESCE(sum((total*r.prize_bps)/10000),0)::text FROM card_purchases WHERE round_id=r.id) END) AS prize
 FROM game_rounds r ORDER BY r.created_at DESC LIMIT 50`)
  ).rows;
}
export async function snapshot(pool: pg.Pool, roundId: string, userId: string) {
  // Repeatable read prevents snapshotSeq from moving beyond the state returned.
  return transaction(pool, async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const r = await tx.query(
      'SELECT id,name,variant,state,price::text,max_cards,prize_bps,min_players,sales_close_at,opens_at,sales_paused,version_id,commitment,current_position,event_seq,rules FROM game_rounds WHERE id=$1',
      [roundId],
    );
    if (!r.rowCount) throw new AppError('ROUND_NOT_FOUND', 404);
    const balls = await tx.query(
      'SELECT number,position FROM drawn_balls WHERE round_id=$1 ORDER BY position',
      [roundId],
    );
    const cards = await tx.query(
      'SELECT id,card FROM bingo_cards WHERE round_id=$1 AND user_id=$2 ORDER BY id',
      [roundId, userId],
    );
    const awards = await tx.query(
      'SELECT card_id,pattern,amount::text FROM prize_awards WHERE round_id=$1 AND user_id=$2',
      [roundId, userId],
    );
    return {
      round: r.rows[0],
      balls: balls.rows,
      cards: cards.rows,
      awards: awards.rows,
      completedPatterns: (
        await tx.query<{ pattern: string }>(
          'SELECT DISTINCT pattern FROM prize_awards WHERE round_id=$1',
          [roundId],
        )
      ).rows.map((r) => r.pattern),
      serverTime: new Date().toISOString(),
    };
  });
}
export async function proof(pool: pg.Pool, roundId: string) {
  const data = await pool.query<Round>('SELECT * FROM game_rounds WHERE id=$1', [roundId]);
  const r = data.rows[0];
  if (!r) throw new AppError('ROUND_NOT_FOUND', 404);
  if (r.state !== 'COMPLETED') throw new AppError('PROOF_NOT_AVAILABLE', 409);
  const cards = await pool.query('SELECT id,card FROM bingo_cards WHERE round_id=$1 ORDER BY id', [
    roundId,
  ]);
  const sequence = drawSequence(r.seed_revealed!, r.context!, r.variant);
  const balls = await pool.query<{ number: number }>(
    'SELECT number FROM drawn_balls WHERE round_id=$1 ORDER BY position',
    [roundId],
  );
  return {
    algorithmVersion,
    roundId,
    variant: r.variant,
    commitment: r.commitment,
    serverSeed: r.seed_revealed,
    context: r.context,
    manifestHash: r.manifest_hash,
    manifest: cards.rows,
    sequence,
    drawn: balls.rows.map((b) => b.number),
    valid:
      hash(r.seed_revealed!) === r.commitment &&
      hash(JSON.stringify(cards.rows)) === r.manifest_hash &&
      balls.rows.every((b, i) => b.number === sequence[i]),
  };
}

export async function runSchedules(pool: pg.Pool, key: string) {
  return transaction(pool, async (tx) => {
    const rows = await tx.query<{
      id: string;
      config: unknown;
      created_by: string;
      interval_seconds: number;
    }>(
      'SELECT * FROM room_schedules WHERE enabled AND next_open_at<=clock_timestamp() ORDER BY next_open_at FOR UPDATE SKIP LOCKED LIMIT 10',
    );
    for (const schedule of rows.rows) {
      await createRound(tx, key, schedule.created_by, roomInput.parse(schedule.config));
      await tx.query(
        "UPDATE room_schedules SET next_open_at=clock_timestamp()+($2::int*interval '1 second') WHERE id=$1",
        [schedule.id, schedule.interval_seconds],
      );
    }
    return rows.rowCount;
  });
}
