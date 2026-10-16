import type pg from 'pg';
import { generateCard, patternMasks } from '@bingo/domain';
import {
  newSeed,
  hash,
  encryptSeed,
  decryptSeed,
  deterministicRandom,
  drawSequence,
  algorithmVersion,
} from '@bingo/domain/rng';
import { paytable, exactReturn, type PayPattern } from '@bingo/bingo-math';
import { instantVersion } from './catalog';
import { transaction, AppError } from './db';
import { wallet, postLedger, moveBalance, checkLimits, audit } from './wallet';
const table = paytable();
const patterns = Object.keys(table.payoutBps) as PayPattern[];
export function publicInstantGame() {
  return {
    version: table.version,
    draws: 30,
    stakes: ['100', '200', '500', '1000', '2500'],
    payoutBps: table.payoutBps,
    rtpByStake: ['100', '200', '500', '1000', '2500'].map((s) => ({
      stake: s,
      rtp: exactReturn(BigInt(s)).rtp,
    })),
    probabilities: table.classes.map((c) => ({
      multiplierBps: c.level * table.scaleBps,
      probability: Number(c.numerator) / Number(table.denominator),
    })),
    notice:
      'Créditos fictícios. Paga somente o padrão de maior valor. Pagamento total inclui a participação; não é lucro líquido.',
  };
}
export async function instantCommit(pool: pg.Pool, key: string, userId: string) {
  return transaction(pool, async (tx) => {
    const version = await instantVersion(tx);
    const seed = newSeed();
    const row = await tx.query<{ id: string }>(
      'INSERT INTO instant_commitments(user_id,commitment,seed_encrypted,version_id) VALUES($1,$2,$3,$4) RETURNING id',
      [userId, hash(seed), encryptSeed(seed, key), version.id],
    );
    return {
      id: row.rows[0]!.id,
      commitment: hash(seed),
      algorithmVersion,
      version: table.version,
      versionId: version.id,
    };
  });
}
export async function playInstant(
  pool: pg.Pool,
  key: string,
  userId: string,
  commitmentId: string,
  clientSeed: string,
  stake: bigint,
  idempotencyKey: string,
) {
  if (![100n, 200n, 500n, 1000n, 2500n].includes(stake)) throw new AppError('INVALID_STAKE');
  return transaction(pool, async (tx) => {
    const c = await tx.query<{
      id: string;
      commitment: string;
      seed_encrypted: string;
      used_at: Date | null;
      valid: boolean;
      version_id: string;
    }>(
      'SELECT *,expires_at>clock_timestamp() AS valid FROM instant_commitments WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [commitmentId, userId],
    );
    if (!c.rowCount) throw new AppError('COMMITMENT_NOT_FOUND', 404);
    const w = await wallet(tx, userId);
    const requestHash = hash(JSON.stringify({ commitmentId, clientSeed, stake: stake.toString() }));
    const prior = await tx.query<{ request_hash: string; response: unknown }>(
      "SELECT request_hash,response FROM idempotency_keys WHERE user_id=$1 AND operation='instant' AND key=$2",
      [userId, idempotencyKey],
    );
    if (prior.rowCount) {
      if (prior.rows[0]!.request_hash !== requestHash)
        throw new AppError('IDEMPOTENCY_CONFLICT', 409);
      return prior.rows[0]!.response;
    }
    const commit = c.rows[0]!;
    const version = await tx.query<{ version: string }>(
      'SELECT version FROM game_versions WHERE id=$1',
      [commit.version_id],
    );
    if (version.rows[0]?.version !== table.version) throw new AppError('VERSION_UNAVAILABLE', 409);
    if (commit.used_at || !commit.valid) throw new AppError('COMMITMENT_EXPIRED', 409);
    await checkLimits(tx, userId, stake);
    if (BigInt(w.balance) < stake) throw new AppError('INSUFFICIENT_CREDITS', 409);
    const seed = decryptSeed(commit.seed_encrypted, key),
      context = JSON.stringify([algorithmVersion, 'instant', commitmentId, clientSeed, 0]);
    const card = generateCard(75, deterministicRandom(seed, `card:${context}`));
    const sequence = drawSequence(seed, context, 75);
    const drawn = sequence.slice(0, 30);
    const balls = new Set(drawn);
    let pattern: PayPattern | null = null;
    let payout = 0n;
    for (const p of patterns) {
      const completed = patternMasks(card, p).some((m) =>
        m.every((n) => n === null || balls.has(n)),
      );
      const amount = (stake * BigInt(table.payoutBps[p])) / 10000n;
      if (completed && amount > payout) {
        payout = amount;
        pattern = p;
      }
    }
    const result = {
      version: table.version,
      card,
      drawn,
      pattern,
      payout: payout.toString(),
      stake: stake.toString(),
      commitment: commit.commitment,
      serverSeed: seed,
      clientSeed,
      context,
      algorithmVersion,
    };
    const row = await tx.query<{ id: string }>(
      'INSERT INTO instant_plays(user_id,commitment_id,stake,payout,game_version,result) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [
        userId,
        commitmentId,
        stake.toString(),
        payout.toString(),
        table.version,
        JSON.stringify(result),
      ],
    );
    const house = await tx.query<{ id: string }>(
      "SELECT id FROM ledger_accounts WHERE reference='house'",
    );
    await postLedger(tx, 'INSTANT_STAKE', row.rows[0]!.id, [
      { accountId: w.account_id, amount: -stake },
      { accountId: house.rows[0]!.id, amount: stake },
    ]);
    if (payout > 0n)
      await postLedger(tx, 'INSTANT_PRIZE', row.rows[0]!.id, [
        { accountId: house.rows[0]!.id, amount: -payout },
        { accountId: w.account_id, amount: payout },
      ]);
    await moveBalance(tx, userId, payout - stake);
    await tx.query('UPDATE instant_commitments SET used_at=now() WHERE id=$1', [commitmentId]);
    const response = { id: row.rows[0]!.id, ...result };
    await tx.query(
      "INSERT INTO idempotency_keys(user_id,operation,key,request_hash,response) VALUES($1,'instant',$2,$3,$4)",
      [userId, idempotencyKey, requestHash, JSON.stringify(response)],
    );
    await audit(tx, userId, 'INSTANT_PLAY', row.rows[0]!.id, {
      stake: stake.toString(),
      payout: payout.toString(),
    });
    return response;
  });
}
