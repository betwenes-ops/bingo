import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import type pg from 'pg';
import { z } from 'zod';
import { AppError } from './db';
const claimSchema = z.object({
  sessionId: z.uuid(),
  userId: z.uuid(),
  roundId: z.uuid(),
  expires: z.number().int(),
  nonce: z.string(),
});
export function issueSocketTicket(
  key: string,
  sessionId: string,
  userId: string,
  roundId: string,
  now = Date.now(),
) {
  const body = Buffer.from(
    JSON.stringify({
      sessionId,
      userId,
      roundId,
      expires: now + 30000,
      nonce: randomBytes(12).toString('hex'),
    }),
  ).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(`bingo-ws-v1:${body}`).digest('base64url')}`;
}
export function readSocketTicket(key: string, ticket: string, roundId: string, now = Date.now()) {
  try {
    if (ticket.length > 1024) throw Error();
    const [body, sig, ...rest] = ticket.split('.');
    if (!body || !sig || rest.length) throw Error();
    const wanted = createHmac('sha256', key).update(`bingo-ws-v1:${body}`).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) throw Error();
    const claim = claimSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString()));
    if (claim.roundId !== roundId || claim.expires <= now || claim.expires > now + 30000)
      throw Error();
    return claim;
  } catch {
    throw new AppError('SOCKET_TICKET_INVALID', 401);
  }
}
export type StreamEvent = {
  eventId: string;
  roundId: string;
  seq: number;
  type: string;
  ts: string;
  v: 1;
  payload: Record<string, unknown>;
};
type Listener = { seq: number; send: (event: StreamEvent) => void };
type Feed = {
  listeners: Set<Listener>;
  timer: ReturnType<typeof setInterval>;
  busy: boolean;
  again: boolean;
};
/** Redis wakes a room feed; PostgreSQL supplies ordered, durable events. One fallback poll per room. */
export class RealtimeHub {
  private feeds = new Map<string, Feed>();
  private redis: Redis;
  private started = false;
  private closed = false;
  constructor(
    private pool: pg.Pool,
    url: string,
    private onError: (error: unknown) => void = () => {},
  ) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    this.redis.on('error', () => {});
    this.redis.on('message', (_channel, message) => {
      try {
        const e = JSON.parse(message) as { round_id?: string; roundId?: string };
        const id = e.round_id ?? e.roundId;
        if (id && this.feeds.has(id)) void this.flush(id);
      } catch {
        /* Invalid notifications never become authoritative events. */
      }
    });
  }
  subscribe(id: string, seq: number, send: Listener['send']) {
    if (this.closed) throw Error('HUB_CLOSED');
    if (!this.started) {
      this.started = true;
      void this.redis.subscribe('bingo:events').catch(this.onError);
    }
    let feed = this.feeds.get(id);
    if (!feed) {
      feed = {
        listeners: new Set(),
        timer: setInterval(() => void this.flush(id), 1000),
        busy: false,
        again: false,
      };
      this.feeds.set(id, feed);
    }
    const listener = { seq, send };
    feed.listeners.add(listener);
    void this.flush(id);
    return () => {
      feed!.listeners.delete(listener);
      if (!feed!.listeners.size) {
        clearInterval(feed!.timer);
        this.feeds.delete(id);
      }
    };
  }
  async flush(id: string) {
    const feed = this.feeds.get(id);
    if (!feed || this.closed) return;
    if (feed.busy) {
      feed.again = true;
      return;
    }
    feed.busy = true;
    try {
      const cursor = Math.min(...[...feed.listeners].map((l) => l.seq));
      if (!Number.isFinite(cursor)) return;
      const result = await this.pool.query<StreamEvent>(
        'SELECT id AS "eventId",round_id AS "roundId",seq,type,created_at AS ts,payload,1 AS v FROM game_events WHERE round_id=$1 AND seq>$2 ORDER BY seq LIMIT 500',
        [id, cursor],
      );
      for (const event of result.rows)
        for (const listener of feed.listeners)
          if (event.seq > listener.seq) {
            try {
              listener.send(event);
              listener.seq = event.seq;
            } catch {
              feed.listeners.delete(listener);
            }
          }
      if (result.rows.length === 500) feed.again = true;
    } catch (error) {
      this.onError(error);
    } finally {
      feed.busy = false;
      if (feed.again && this.feeds.has(id) && !this.closed) {
        feed.again = false;
        setImmediate(() => void this.flush(id));
      }
    }
  }
  async close() {
    this.closed = true;
    for (const feed of this.feeds.values()) clearInterval(feed.timer);
    this.feeds.clear();
    this.redis.disconnect();
  }
}
