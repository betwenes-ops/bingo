import type { Tx } from './db';
import { AppError } from './db';
import { hash, algorithmVersion } from '@bingo/domain/rng';
import { paytable, exactReturn } from '@bingo/bingo-math';
export function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
export async function ensureVersion(
  tx: Tx,
  key: string,
  version: string,
  config: unknown,
  actor: string | null = null,
  math?: unknown,
) {
  const content = JSON.stringify(jsonSafe(config)),
    digest = hash(content);
  await tx.query('INSERT INTO games(key,name) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [
    key,
    key === 'instant-75' ? 'Bingo individual 75' : `Bingo ${key.split('-')[1]}`,
  ]);
  const game = await tx.query<{ enabled: boolean }>('SELECT enabled FROM games WHERE key=$1', [
    key,
  ]);
  if (!game.rows[0]!.enabled) throw new AppError('GAME_UNAVAILABLE', 409);
  await tx.query(
    'INSERT INTO game_versions(game_key,version,config,config_hash,published_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(game_key,version) DO NOTHING',
    [key, version, content, digest, actor],
  );
  const row = await tx.query<{ id: string; config_hash: string; config: unknown }>(
    'SELECT id,config_hash,config FROM game_versions WHERE game_key=$1 AND version=$2',
    [key, version],
  );
  const v = row.rows[0]!;
  if (v.config_hash !== digest) throw new AppError('PUBLISHED_VERSION_MISMATCH', 409);
  if (math) {
    const report = JSON.stringify(jsonSafe(math));
    await tx.query(
      'INSERT INTO game_math_models(version_id,report,report_hash) VALUES($1,$2,$3) ON CONFLICT(version_id) DO NOTHING',
      [v.id, report, hash(report)],
    );
  }
  return v;
}
export async function instantVersion(tx: Tx) {
  const table = paytable();
  const report = {
    method: 'inclusion-exclusion-15-masks',
    ...(jsonSafe(table) as object),
    rtpByStake: [100n, 200n, 500n, 1000n, 2500n].map((stake) => ({
      stake: stake.toString(),
      ...exactReturn(stake),
    })),
  };
  return ensureVersion(
    tx,
    'instant-75',
    table.version,
    {
      algorithmVersion,
      draws: 30,
      stakes: ['100', '200', '500', '1000', '2500'],
      payoutBps: table.payoutBps,
    },
    null,
    report,
  );
}
