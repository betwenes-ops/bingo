import { Gauge, Histogram, type Registry } from 'prom-client';
import type pg from 'pg';
export function telemetry(registry: Registry, pool: pg.Pool) {
  const requestSeconds = new Histogram({
    name: 'bingo_http_request_seconds',
    help: 'HTTP response duration',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  const sockets = new Gauge({
    name: 'bingo_ws_connections',
    help: 'Open authenticated WebSocket connections',
    registers: [registry],
  });
  const poolWaiting = new Gauge({
    name: 'bingo_database_pool_waiting',
    help: 'Requests waiting for a database connection',
    registers: [registry],
    collect() {
      this.set(pool.waitingCount);
    },
  });
  const state = new Gauge({
    name: 'bingo_operational_state',
    help: 'Operational health values',
    labelNames: ['kind'] as const,
    registers: [registry],
    async collect() {
      const row = (
        await pool.query<{ outbox: number; email_failed: number; workers: number; lag: number }>(
          "SELECT (SELECT count(*)::int FROM outbox_events WHERE published_at IS NULL) AS outbox,(SELECT count(*)::int FROM email_outbox WHERE delivered_at IS NULL AND attempts>=12) AS email_failed,(SELECT count(*)::int FROM worker_heartbeats WHERE updated_at>now()-interval '20 seconds') AS workers,COALESCE((SELECT EXTRACT(epoch FROM now()-min(next_ball_at))::float FROM game_rounds WHERE state='DRAWING' AND next_ball_at<now()),0) AS lag",
        )
      ).rows[0]!;
      this.set({ kind: 'outbox_pending' }, row.outbox);
      this.set({ kind: 'email_failed' }, row.email_failed);
      this.set({ kind: 'workers_healthy' }, row.workers);
      this.set({ kind: 'scheduler_lag_seconds' }, Math.max(0, row.lag));
    },
  });
  void poolWaiting;
  void state;
  return { requestSeconds, sockets };
}
