import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { readConfig } from './config';
import { database } from './db';
import { advanceRound, runSchedules } from './rooms';
import { publishEvents, deliverEmails } from './jobs';
const config = readConfig();
const { pool } = database(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  connectTimeout: 2000,
  commandTimeout: 3000,
});
redis.on('error', () => {});
const mail = nodemailer.createTransport({
  url: config.SMTP_URL,
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 5000,
} as SMTPTransport.Options);
let running = true,
  advanced = 0,
  lastHeartbeat = 0,
  lastSideEffects = 0,
  sideEffects: Promise<void> | undefined;
const instance = randomUUID();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    running = false;
  });
const failure = (message: string, error: unknown) =>
  console.error(
    JSON.stringify({
      level: 'error',
      message,
      error: error instanceof Error ? error.name : 'unknown',
    }),
  );
while (running) {
  try {
    await runSchedules(pool, config.SEED_ENCRYPTION_KEY).catch((e) =>
      failure('Schedule dispatch failed', e),
    );
    const rounds = await pool.query<{ id: string }>(
      "SELECT id FROM game_rounds WHERE (state='SCHEDULED' AND opens_at<=now()) OR (state='OPEN_FOR_SALES' AND sales_close_at<=now()) OR (state='DRAWING' AND next_ball_at<=now()) ORDER BY COALESCE(next_ball_at,sales_close_at) LIMIT 100",
    );
    for (const round of rounds.rows)
      try {
        await advanceRound(pool, config.SEED_ENCRYPTION_KEY, round.id);
        advanced++;
      } catch (e) {
        failure(`Round advancement failed: ${round.id}`, e);
      }
    if (Date.now() - lastHeartbeat > 5000) {
      await pool.query(
        'INSERT INTO worker_heartbeats(instance_id,rounds_advanced) VALUES($1,$2) ON CONFLICT(instance_id) DO UPDATE SET updated_at=now(),rounds_advanced=EXCLUDED.rounds_advanced',
        [instance, advanced],
      );
      lastHeartbeat = Date.now();
    }
    if (!sideEffects && Date.now() - lastSideEffects > 1000) {
      lastSideEffects = Date.now();
      sideEffects = Promise.all([
        publishEvents(pool, (channel, data) => redis.publish(channel, data)).catch((e) =>
          failure('Outbox publish failed', e),
        ),
        deliverEmails(pool, (email) =>
          mail.sendMail({
            from: config.MAIL_FROM,
            to: email.recipient,
            subject: email.subject,
            text: email.body,
          }),
        ).catch((e) => failure('Email dispatch failed', e)),
      ])
        .then(() => {})
        .finally(() => {
          sideEffects = undefined;
        });
    }
  } catch (e) {
    failure('Worker iteration failed', e);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
await sideEffects;
redis.disconnect();
mail.close();
await pool.end();
