// Exact hypergeometric marginal probability. Joint highest-paying pattern
// distribution and calibrated paytable are intentionally not represented by this helper.
export function choose(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0n;
  let value = 1n;
  for (let i = 1; i <= Math.min(k, n - k); i++) value = (value * BigInt(n - i + 1)) / BigInt(i);
  return value;
}
export function completionProbability(
  required: number,
  draws: number,
  universe = 75,
): { numerator: bigint; denominator: bigint } {
  if (required < 0 || required > universe || draws < 0 || draws > universe)
    throw new Error('INVALID_PARAMETERS');
  return {
    numerator: choose(universe - required, draws - required),
    denominator: choose(universe, draws),
  };
}
export type PayPattern = 'line' | 'column' | 'diagonal' | 'corners' | 'x' | 'full';
export const baseMultipliers: Record<PayPattern, number> = {
  line: 1,
  column: 1,
  diagonal: 2,
  corners: 3,
  x: 10,
  full: 200,
};
export function bitCount(n: number): number {
  let count = 0;
  while (n) {
    n &= n - 1;
    count++;
  }
  return count;
}
export function masks75(): { pattern: PayPattern; mask: number }[] {
  const positions = new Map<number, number>();
  let index = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) if (r !== 2 || c !== 2) positions.set(r * 5 + c, index++);
  const mask = (cells: number[]) =>
    cells.reduce((bits, cell) => bits | (positions.has(cell) ? 1 << positions.get(cell)! : 0), 0);
  const masks: { pattern: PayPattern; mask: number }[] = [];
  for (let r = 0; r < 5; r++)
    masks.push({ pattern: 'line', mask: mask(Array.from({ length: 5 }, (_, c) => r * 5 + c)) });
  for (let c = 0; c < 5; c++)
    masks.push({ pattern: 'column', mask: mask(Array.from({ length: 5 }, (_, r) => r * 5 + c)) });
  const d = Array.from({ length: 5 }, (_, r) => r * 5 + r),
    a = Array.from({ length: 5 }, (_, r) => r * 5 + 4 - r);
  masks.push(
    { pattern: 'diagonal', mask: mask(d) },
    { pattern: 'diagonal', mask: mask(a) },
    { pattern: 'corners', mask: mask([0, 4, 20, 24]) },
    { pattern: 'x', mask: mask([...d, ...a]) },
    { pattern: 'full', mask: 0xffffff },
  );
  return masks;
}
export function unionNumerator(masks: readonly number[], draws = 30): bigint {
  const unions = new Int32Array(1 << masks.length);
  let total = 0n;
  const weights = Array.from({ length: 25 }, (_, k) => choose(75 - k, draws - k));
  for (let subset = 1; subset < unions.length; subset++) {
    const low = subset & -subset;
    const index = 31 - Math.clz32(low);
    unions[subset] = unions[subset ^ low]! | masks[index]!;
    const numerator = weights[bitCount(unions[subset]!)]!;
    total += bitCount(subset) % 2 === 1 ? numerator : -numerator;
  }
  return total;
}
export function exactPayClasses() {
  const masks = masks75();
  const denominator = choose(75, 30);
  const levels = [1, 2, 3, 10, 200];
  const cumulative = levels.map((level) =>
    unionNumerator(masks.filter((m) => baseMultipliers[m.pattern] >= level).map((m) => m.mask)),
  );
  return {
    denominator,
    classes: levels.map((level, i) => ({
      level,
      numerator: cumulative[i]! - (cumulative[i + 1] ?? 0n),
    })),
    loss: denominator - cumulative[0]!,
  };
}
export function paytable() {
  const exact = exactPayClasses();
  const raw = exact.classes.reduce((s, c) => s + c.numerator * BigInt(c.level), 0n);
  // Multiples are scaled in basis points, then floored in integer credit units.
  const scale = Number((9500n * exact.denominator + raw / 2n) / raw);
  return {
    version: 'instant-75-v1',
    draws: 30 as const,
    scaleBps: scale,
    payoutBps: Object.fromEntries(
      Object.entries(baseMultipliers).map(([p, m]) => [p, m * scale]),
    ) as Record<PayPattern, number>,
    ...exact,
  };
}
export function exactReturn(stake: bigint) {
  const t = paytable();
  const numerator = t.classes.reduce(
    (sum, c) => sum + c.numerator * ((stake * BigInt(c.level * t.scaleBps)) / 10000n),
    0n,
  );
  return {
    numerator,
    denominator: t.denominator * stake,
    rtp: Number(numerator) / Number(t.denominator * stake),
  };
}
