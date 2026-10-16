import type pg from 'pg';
import { AppError, transaction, type Tx } from './db';
import { wallet, moveBalance, postLedger, audit } from './wallet';
import type { Identity } from './identity';
export function requireRole(user: Identity, roles: readonly string[]) {
  if (!roles.includes(user.role) || !user.mfa_verified) throw new AppError('ADMIN_FORBIDDEN', 403);
}
async function actorRole(tx: Tx, actor: string, roles: readonly string[]) {
  const r = await tx.query<{ role: string; blocked: boolean }>(
    'SELECT role,blocked FROM users WHERE id=$1',
    [actor],
  );
  if (!r.rowCount || r.rows[0]!.blocked || !roles.includes(r.rows[0]!.role))
    throw new AppError('ADMIN_FORBIDDEN', 403);
}
export async function requestAdjustment(
  pool: pg.Pool,
  actor: string,
  userId: string | null,
  amount: bigint,
  reason: string,
) {
  return transaction(pool, async (tx) => {
    await actorRole(tx, actor, ['superadmin', 'finance']);
    if (amount === 0n || (!userId && amount < 0n) || reason.trim().length < 5)
      throw new AppError('INVALID_ADJUSTMENT');
    const row = await tx.query<{ id: string }>(
      'INSERT INTO admin_adjustments(user_id,kind,amount,reason,requested_by) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [userId, userId ? 'USER_ADJUSTMENT' : 'TREASURY_FUND', amount.toString(), reason, actor],
    );
    await audit(tx, actor, 'ADJUSTMENT_REQUESTED', row.rows[0]!.id, {
      userId,
      amount: amount.toString(),
      reason,
    });
    return row.rows[0]!;
  });
}
export async function decideAdjustment(
  pool: pg.Pool,
  actor: string,
  id: string,
  approve: boolean,
  reason: string,
) {
  return transaction(pool, async (tx) => {
    await actorRole(tx, actor, ['superadmin', 'finance']);
    const r = await tx.query<{
      id: string;
      user_id: string | null;
      kind: string;
      amount: string;
      requested_by: string;
      approved_by: string | null;
      status: string;
      transaction_id: string | null;
    }>('SELECT * FROM admin_adjustments WHERE id=$1 FOR UPDATE', [id]);
    const a = r.rows[0];
    if (!a) throw new AppError('ADJUSTMENT_NOT_FOUND', 404);
    if (a.requested_by === actor) throw new AppError('TWO_PERSON_REQUIRED', 403);
    if (a.status !== 'PENDING') {
      if (a.approved_by === actor && a.status === (approve ? 'APPROVED' : 'REJECTED'))
        return { id, status: a.status, transactionId: a.transaction_id };
      throw new AppError('ADJUSTMENT_ALREADY_DECIDED', 409);
    }
    let transactionId: string | null = null;
    if (approve) {
      const amount = BigInt(a.amount);
      const source = (
        await tx.query<{ id: string }>(
          "SELECT id FROM ledger_accounts WHERE reference='demo-source'",
        )
      ).rows[0]!.id;
      if (a.user_id) {
        const w = await wallet(tx, a.user_id);
        transactionId = await postLedger(tx, 'ADMIN_ADJUSTMENT', a.id, [
          { accountId: source, amount: -amount },
          { accountId: w.account_id, amount },
        ]);
        await moveBalance(tx, a.user_id, amount);
        await tx.query('INSERT INTO notifications(user_id,type,message) VALUES($1,$2,$3)', [
          a.user_id,
          'WALLET_UPDATED',
          `Ajuste de ${amount} centésimos de crédito fictício. Motivo: ${a.kind === 'USER_ADJUSTMENT' ? 'revisão administrativa' : 'demonstração'}. Consulte o extrato.`,
        ]);
      } else {
        const house = (
          await tx.query<{ id: string }>(
            "SELECT id FROM ledger_accounts WHERE reference='house' FOR UPDATE",
          )
        ).rows[0]!.id;
        transactionId = await postLedger(tx, 'TREASURY_FUND', a.id, [
          { accountId: source, amount: -amount },
          { accountId: house, amount },
        ]);
      }
    }
    const status = approve ? 'APPROVED' : 'REJECTED';
    await tx.query(
      'UPDATE admin_adjustments SET status=$2,approved_by=$3,decided_at=now(),decision_reason=$4,transaction_id=$5 WHERE id=$1',
      [id, status, actor, reason, transactionId],
    );
    await audit(tx, actor, `ADJUSTMENT_${status}`, id, { reason, transactionId });
    return { id, status, transactionId };
  });
}
export async function setUserStatus(
  pool: pg.Pool,
  actor: string,
  id: string,
  blocked: boolean,
  reason: string,
) {
  return transaction(pool, async (tx) => {
    await actorRole(tx, actor, ['superadmin', 'support']);
    if (actor === id) throw new AppError('CANNOT_BLOCK_SELF', 409);
    const r = await tx.query<{ role: string; blocked: boolean }>(
      'SELECT role,blocked FROM users WHERE id=$1 FOR UPDATE',
      [id],
    );
    if (!r.rowCount) throw new AppError('USER_NOT_FOUND', 404);
    if (r.rows[0]!.role !== 'player') await actorRole(tx, actor, ['superadmin']);
    await tx.query('UPDATE users SET blocked=$2 WHERE id=$1', [id, blocked]);
    if (blocked) await tx.query('DELETE FROM user_sessions WHERE user_id=$1', [id]);
    await audit(tx, actor, blocked ? 'USER_BLOCKED' : 'USER_UNBLOCKED', id, {
      before: r.rows[0]!.blocked,
      after: blocked,
      reason,
    });
    return { ok: true };
  });
}
export async function replySupport(
  pool: pg.Pool,
  actor: string,
  id: string,
  message: string,
  close: boolean,
) {
  return transaction(pool, async (tx) => {
    await actorRole(tx, actor, ['superadmin', 'support']);
    const r = await tx.query<{ user_id: string }>(
      'SELECT user_id FROM support_cases WHERE id=$1 FOR UPDATE',
      [id],
    );
    if (!r.rowCount) throw new AppError('CASE_NOT_FOUND', 404);
    await tx.query('INSERT INTO support_messages(case_id,author_id,message) VALUES($1,$2,$3)', [
      id,
      actor,
      message,
    ]);
    await tx.query('UPDATE support_cases SET status=$2,updated_at=now() WHERE id=$1', [
      id,
      close ? 'CLOSED' : 'ANSWERED',
    ]);
    await tx.query('INSERT INTO notifications(user_id,type,message) VALUES($1,$2,$3)', [
      r.rows[0]!.user_id,
      'SUPPORT_REPLY',
      'Sua solicitação de atendimento recebeu uma resposta.',
    ]);
    await audit(tx, actor, 'SUPPORT_REPLIED', id, { closed: close });
    return { ok: true };
  });
}
export async function report(pool: pg.Pool) {
  return (
    await pool.query(
      `SELECT date_trunc('day',t.created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS day,kind,count(DISTINCT t.id)::int AS transactions,COALESCE(sum(amount),0)::text AS volume FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id=t.id JOIN ledger_accounts a ON a.id=e.account_id WHERE a.kind='user' GROUP BY 1,2 ORDER BY 1 DESC,2 LIMIT 1000`,
    )
  ).rows;
}
