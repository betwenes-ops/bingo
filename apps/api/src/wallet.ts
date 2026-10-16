import { AppError, type Tx } from './db';
export async function postLedger(
  tx: Tx,
  kind: string,
  reference: string,
  entries: { accountId: string; amount: bigint }[],
) {
  if (entries.length < 2 || entries.reduce((s, e) => s + e.amount, 0n) !== 0n)
    throw new AppError('UNBALANCED_TRANSACTION');
  const header = await tx.query<{ id: string }>(
    'INSERT INTO ledger_transactions(kind,reference) VALUES($1,$2) RETURNING id',
    [kind, reference],
  );
  for (const e of entries)
    if (e.amount !== 0n)
      await tx.query(
        'INSERT INTO ledger_entries(transaction_id,account_id,amount) VALUES($1,$2,$3)',
        [header.rows[0]!.id, e.accountId, e.amount.toString()],
      );
  return header.rows[0]!.id;
}
export async function wallet(tx: Tx, userId: string) {
  const result = await tx.query<{ user_id: string; account_id: string; balance: string }>(
    'SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE',
    [userId],
  );
  if (!result.rowCount) throw new AppError('WALLET_NOT_FOUND', 404);
  return result.rows[0]!;
}
export async function moveBalance(tx: Tx, userId: string, amount: bigint) {
  const result = await tx.query(
    'UPDATE wallets SET balance=balance+$2,version=version+1 WHERE user_id=$1 AND balance+$2>=0 RETURNING balance',
    [userId, amount.toString()],
  );
  if (!result.rowCount) throw new AppError('INSUFFICIENT_CREDITS', 409);
}
export async function audit(
  tx: Tx,
  actor: string | null,
  action: string,
  subject: string,
  details: unknown = {},
) {
  await tx.query('INSERT INTO audit_logs(actor_id,action,subject,details) VALUES($1,$2,$3,$4)', [
    actor,
    action,
    subject,
    JSON.stringify(details),
  ]);
}
export async function checkLimits(tx: Tx, userId: string, amount: bigint) {
  const limits = await tx.query<{ daily_limit: string; self_excluded: boolean; paused: boolean }>(
    'SELECT daily_limit,self_excluded,paused_until>now() AS paused FROM responsible_gaming_limits WHERE user_id=$1 FOR UPDATE',
    [userId],
  );
  const l = limits.rows[0];
  if (!l || l.self_excluded || l.paused) throw new AppError('PARTICIPATION_PAUSED', 403);
  const spent = await tx.query<{ total: string }>(
    "SELECT COALESCE(sum(total),0)::text AS total FROM (SELECT user_id,total,created_at FROM card_purchases UNION ALL SELECT user_id,stake AS total,created_at FROM instant_plays) participation WHERE user_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'",
    [userId],
  );
  if (BigInt(spent.rows[0]!.total) + amount > BigInt(l.daily_limit))
    throw new AppError('DAILY_LIMIT', 409);
}

/** Refundable sales are liabilities, never available guarantee capital. */
export async function availableTreasury(tx: Tx, accountId: string) {
  const row = (
    await tx.query<{ available: string }>(
      `SELECT ((SELECT COALESCE(sum(amount),0) FROM ledger_entries WHERE account_id=$1) - COALESCE((SELECT sum(p.total-CASE WHEN r.rules->>'policy'='fixed' THEN 0 ELSE (p.total*r.prize_bps)/10000 END) FROM card_purchases p JOIN game_rounds r ON r.id=p.round_id WHERE r.state IN ('CREATED','SCHEDULED','OPEN_FOR_SALES','SALES_CLOSED','READY')),0))::text AS available`,
      [accountId],
    )
  ).rows[0]!;
  return BigInt(row.available);
}
