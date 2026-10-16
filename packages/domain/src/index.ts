export type Variant = 75 | 80 | 90;
export type Pattern = 'line' | 'two-lines' | 'column' | 'diagonal' | 'corners' | 'x' | 'l' | 'full';
export type Card = { variant: Variant; rows: (number | null)[][] };
export type RandomInt = (exclusiveMax: number) => number;

export function shuffle<T>(values: readonly T[], random: RandomInt): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('INVALID_RANDOM');
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
const range = (start: number, length: number) => Array.from({ length }, (_, i) => start + i);

export function generateCard(variant: Variant, random: RandomInt): Card {
  if (variant === 75 || variant === 80) {
    const size = variant === 75 ? 5 : 4;
    const width = variant === 75 ? 15 : 20;
    const columns = range(0, size).map((c) =>
      shuffle(range(c * width + 1, width), random).slice(0, size),
    );
    const rows = range(0, size).map((r) =>
      range(0, size).map((c) => (variant === 75 && r === 2 && c === 2 ? null : columns[c]![r]!)),
    );
    return { variant, rows };
  }
  // Start with one cell in each column, then add six cells while respecting
  // five per row and at most three per column. Backtracking guarantees termination.
  const rowOrder = shuffle([0, 1, 2], random);
  const counts = [0, 0, 0];
  const occupied: boolean[][] = Array.from({ length: 3 }, () => Array<boolean>(9).fill(false));
  for (const c of range(0, 9)) {
    const r = rowOrder[c % 3]!;
    occupied[r]![c] = true;
    counts[r]!++;
  }
  for (const r of rowOrder) {
    const choices = shuffle(
      range(0, 9).filter((c) => !occupied[r]![c]),
      random,
    );
    for (const c of choices.slice(0, 5 - counts[r]!)) occupied[r]![c] = true;
  }
  const rows: Card['rows'] = Array.from({ length: 3 }, () => Array<number | null>(9).fill(null));
  for (const c of range(0, 9)) {
    const rs = range(0, 3).filter((r) => occupied[r]![c]);
    const values = shuffle(range(c === 0 ? 1 : c * 10, c === 0 ? 9 : c === 8 ? 11 : 10), random)
      .slice(0, rs.length)
      .sort((a, b) => a - b);
    rs.forEach((r, i) => {
      rows[r]![c] = values[i]!;
    });
  }
  return { variant, rows };
}

export function validateCard(card: Card): boolean {
  const { variant, rows } = card;
  const height = variant === 75 ? 5 : variant === 80 ? 4 : 3;
  const width = variant === 90 ? 9 : height;
  if (rows.length !== height || rows.some((r) => r.length !== width)) return false;
  const values = rows.flat().filter((n): n is number => n !== null);
  if (
    new Set(values).size !== values.length ||
    values.some((n) => !Number.isInteger(n) || n < 1 || n > variant)
  )
    return false;
  if (variant === 75 && (rows[2]![2] !== null || values.length !== 24)) return false;
  if (variant === 80 && values.length !== 16) return false;
  if (variant === 90 && rows.some((r) => r.filter((n) => n !== null).length !== 5)) return false;
  for (let c = 0; c < width; c++) {
    const column = rows.map((r) => r[c]!).filter((n): n is number => n !== null);
    const min = variant === 90 ? (c === 0 ? 1 : c * 10) : c * (variant === 75 ? 15 : 20) + 1;
    const max = variant === 90 ? (c === 8 ? 90 : c * 10 + 9) : (c + 1) * (variant === 75 ? 15 : 20);
    if (column.some((n) => n < min || n > max)) return false;
    if (
      variant === 90 &&
      (column.length === 0 || column.some((n, i) => i > 0 && n <= column[i - 1]!))
    )
      return false;
  }
  return true;
}

export function patternMasks(card: Card, pattern: Pattern): (number | null)[][] {
  const { rows, variant } = card;
  const size = rows.length;
  const columns: (number | null)[][] = range(0, rows[0]!.length).map((c) => rows.map((r) => r[c]!));
  if (pattern === 'full') return [rows.flat()];
  if (pattern === 'line') return rows;
  if (pattern === 'two-lines' && variant === 90)
    return [rows[0]!.concat(rows[1]!), rows[0]!.concat(rows[2]!), rows[1]!.concat(rows[2]!)];
  if (variant === 90 || pattern === 'two-lines') throw new Error('UNSUPPORTED_PATTERN');
  if (pattern === 'column') return columns;
  const main = rows.map((r, i) => r[i]!);
  const anti = rows.map((r, i) => r[size - i - 1]!);
  if (pattern === 'diagonal') return [main, anti];
  if (pattern === 'corners')
    return [[rows[0]![0]!, rows[0]![size - 1]!, rows[size - 1]![0]!, rows[size - 1]![size - 1]!]];
  if (pattern === 'x') return [main.concat(anti)];
  return [columns[0]!.concat(rows[size - 1]!)];
}

export function remaining(card: Card, pattern: Pattern, drawn: readonly number[]): number {
  const balls = new Set(drawn);
  return Math.min(
    ...patternMasks(card, pattern).map(
      (mask) => new Set(mask.filter((n): n is number => n !== null && !balls.has(n))).size,
    ),
  );
}
export function wins(card: Card, pattern: Pattern, drawn: readonly number[]): boolean {
  return remaining(card, pattern, drawn) === 0;
}

export function splitPrize(total: bigint, winnerIds: readonly string[]): Map<string, bigint> {
  if (total < 0n || winnerIds.length === 0 || new Set(winnerIds).size !== winnerIds.length)
    throw new Error('INVALID_ALLOCATION');
  const sorted = [...winnerIds].sort();
  const count = BigInt(sorted.length);
  return new Map(
    sorted.map((id, i) => [id, total / count + (BigInt(i) < total % count ? 1n : 0n)]),
  );
}
export function prizeFund(revenue: bigint, basisPoints: number): bigint {
  if (revenue < 0n || !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000)
    throw new Error('INVALID_FUND');
  return (revenue * BigInt(basisPoints)) / 10000n;
}
export type RoundState =
  | 'CREATED'
  | 'SCHEDULED'
  | 'OPEN_FOR_SALES'
  | 'SALES_CLOSED'
  | 'READY'
  | 'DRAWING'
  | 'VERIFYING'
  | 'SETTLING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';
const transitions: Record<RoundState, readonly RoundState[]> = {
  CREATED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['OPEN_FOR_SALES', 'CANCELLED'],
  OPEN_FOR_SALES: ['SALES_CLOSED', 'CANCELLED'],
  SALES_CLOSED: ['READY', 'CANCELLED'],
  READY: ['DRAWING', 'CANCELLED'],
  DRAWING: ['VERIFYING', 'FAILED'],
  VERIFYING: ['SETTLING', 'FAILED'],
  SETTLING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};
export function canTransition(from: RoundState, to: RoundState): boolean {
  return transitions[from].includes(to);
}
