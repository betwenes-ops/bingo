import { Redis } from 'ioredis';
import nodemailer from 'nodemailer';
import { readConfig } from './config';
import { database, transaction } from './db';
import { advanceRound } from './rooms';
const config = readConfig();
const { pool } = database(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
redis.on('error', () => {});
const mail = nodemailer.createTransport(config.SMTP_URL);
let running = true;
process.on('SIGINT', () => {
  running = false;
});
process.on('SIGTERM', () => {
  running = false;
});
while (running) {
  try {
    const rounds = await pool.query<{ id: string }>(
      "SELECT id FROM game_rounds WHERE (state='OPEN_FOR_SALES' AND sales_close_at<=now()) OR (state='DRAWING' AND next_ball_at<=now()) ORDER BY COALESCE(next_ball_at,sales_close_at) LIMIT 100",
    );
    for (const r of rounds.rows) {
      try {
        await advanceRound(pool, config.SEED_ENCRYPTION_KEY, r.id);
      } catch (error) {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'Round advancement failed',
            roundId: r.id,
            error: error instanceof Error ? error.message : 'unknown',
          }),
        );
      }
    }
    await transaction(pool, async (tx) => {
      const pending = await tx.query(
        'SELECT o.id,e.* FROM outbox_events o JOIN game_events e ON e.id=o.event_id WHERE o.published_at IS NULL ORDER BY e.round_id,e.seq FOR UPDATE OF o SKIP LOCKED LIMIT 100',
      );
      for (const e of pending.rows) {
        await redis.publish('bingo:events', JSON.stringify(e));
        await tx.query(
          'UPDATE outbox_events SET published_at=now(),attempts=attempts+1 WHERE event_id=$1',
          [e.id],
        );
      }
    });
    await transaction(pool, async (tx) => {
      const emails = await tx.query(
        'SELECT * FROM email_outbox WHERE delivered_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10',
      );
      for (const e of emails.rows) {
        await mail.sendMail({
          from: config.MAIL_FROM,
          to: e.recipient as string,
          subject: e.subject as string,
          text: e.body as string,
        });
        await tx.query('UPDATE email_outbox SET delivered_at=now(),body=$2 WHERE id=$1', [
          e.id,
          '[delivered]',
        ]);
      }
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Worker iteration failed',
        error: error instanceof Error ? error.message : 'unknown',
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
await redis.quit().catch(() => {});
await pool.end();
