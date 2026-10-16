import type pg from 'pg';
import { transaction } from './db';
export async function publishEvents(
  pool: pg.Pool,
  publish: (channel: string, data: string) => Promise<unknown>,
) {
  return transaction(pool, async (tx) => {
    const pending = await tx.query(
      'SELECT e.* FROM outbox_events o JOIN game_events e ON e.id=o.event_id WHERE o.published_at IS NULL ORDER BY e.round_id,e.seq FOR UPDATE OF o SKIP LOCKED LIMIT 100',
    );
    for (const event of pending.rows) {
      await publish('bingo:events', JSON.stringify(event));
      await tx.query(
        'UPDATE outbox_events SET published_at=now(),attempts=attempts+1 WHERE event_id=$1',
        [event.id],
      );
    }
    return pending.rowCount ?? 0;
  });
}
export async function deliverEmails(
  pool: pg.Pool,
  send: (email: { recipient: string; subject: string; body: string }) => Promise<unknown>,
) {
  const dispatched = await transaction(pool, async (tx) => {
    await tx.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
    const pending = await tx.query<{
      id: string;
      recipient: string;
      subject: string;
      body: string;
      attempts: number;
    }>(
      'SELECT * FROM email_outbox WHERE delivered_at IS NULL AND next_attempt_at<=now() AND attempts<12 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10',
    );
    let count = 0;
    for (const email of pending.rows) {
      try {
        await send(email);
        await tx.query(
          "UPDATE email_outbox SET delivered_at=now(),body='[delivered]',attempts=attempts+1,last_error=NULL WHERE id=$1",
          [email.id],
        );
        count++;
      } catch {
        await tx.query(
          "UPDATE email_outbox SET attempts=attempts+1,last_error='DELIVERY_FAILED',next_attempt_at=now()+($2::int*interval '1 second') WHERE id=$1",
          [email.id, Math.min(3600, 30 * 2 ** email.attempts)],
        );
      }
    }
    return count;
  });
  return dispatched;
}
