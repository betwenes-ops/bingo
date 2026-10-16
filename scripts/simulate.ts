import { deterministicRandom } from '../packages/domain/src/rng';
import { masks75, paytable, exactReturn } from '../packages/bingo-math/src/index';
import { writeFileSync } from 'node:fs';
const trials = Number(process.env.MATH_TRIALS ?? 1000000);
if (!Number.isSafeInteger(trials) || trials < 10000)
  throw new Error('MATH_TRIALS must be integer >= 10000');
const table = paytable(),
  masks = masks75();
const random = deterministicRandom('09'.repeat(32), 'mathematical-validation-v1');
const balls = new Int32Array(75);
const amounts = new Map<string, number>();
let sum = 0,
  sumSquare = 0,
  hits = 0;
const started = Date.now();
for (let trial = 0; trial < trials; trial++) {
  for (let i = 0; i < 75; i++) balls[i] = i;
  let marked = 0;
  for (let i = 0; i < 30; i++) {
    const j = i + random(75 - i),
      number = balls[j]!;
    balls[j] = balls[i]!;
    balls[i] = number;
    if (number < 24) marked |= 1 << number;
  }
  let payout = 0;
  for (const m of masks)
    if ((marked & m.mask) === m.mask)
      payout = Math.max(payout, Math.floor(table.payoutBps[m.pattern] / 100));
  sum += payout;
  sumSquare += payout * payout;
  if (payout > 0) hits++;
  amounts.set(String(payout), (amounts.get(String(payout)) ?? 0) + 1);
}
const mean = sum / trials,
  variance = (sumSquare - trials * mean * mean) / (trials - 1),
  standardError = Math.sqrt(variance / trials) / 100;
const simulatedRtp = mean / 100,
  theoreticalRtp = exactReturn(100n).rtp;
const report = {
  version: table.version,
  trials,
  stake: '100',
  seed: '09'.repeat(32),
  rng: 'hmac-sha256-fy-v1 continuous stream; partial Fisher-Yates 30/75',
  method:
    'Exact inclusion-exclusion over 15 pattern masks; disjoint classes by highest paying completed pattern',
  payoutBps: table.payoutBps,
  theoreticalRtp,
  simulatedRtp,
  confidence95: [simulatedRtp - 1.96 * standardError, simulatedRtp + 1.96 * standardError],
  withinConfidence95: Math.abs(simulatedRtp - theoreticalRtp) <= 1.96 * standardError,
  hitRate: hits / trials,
  varianceInCreditUnits: variance,
  distribution: Object.fromEntries(amounts),
  durationMs: Date.now() - started,
};
const json = JSON.stringify(report, null, 2) + '\n';
writeFileSync(new URL('../docs/reports/instant-math.json', import.meta.url), json);
console.log(json);
if (!report.withinConfidence95) process.exitCode = 1;
