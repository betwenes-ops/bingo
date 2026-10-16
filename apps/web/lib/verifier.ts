import { wins, type Card, type Pattern } from '@bingo/domain';
const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (n) => n.toString(16).padStart(2, '0')).join('');
export async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
async function entropy(seed: string, context: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(seed.match(/../g)!, (h) => parseInt(h, 16)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  let counter = 0n,
    offset = 0,
    block = new DataView(new ArrayBuffer(0));
  return async (bound: number) => {
    const limit = Math.floor(0x100000000 / bound) * bound;
    for (;;) {
      if (offset >= block.byteLength) {
        block = new DataView(
          await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(`hmac-sha256-fy-v1\n${context}\n${counter++}`),
          ),
        );
        offset = 0;
      }
      const value = block.getUint32(offset, false);
      offset += 4;
      if (value < limit) return value % bound;
    }
  };
}
export async function reconstructDraw(
  seed: string,
  context: string,
  variant: number,
): Promise<number[]> {
  const random = await entropy(seed, context);
  const result = Array.from({ length: variant }, (_, i) => i + 1);
  for (let i = result.length - 1; i > 0; i--) {
    const j = await random(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export async function verifyDraw(proof: {
  serverSeed: string;
  commitment: string;
  context: string;
  variant: number;
  drawn: number[];
}): Promise<boolean> {
  if ((await sha256(proof.serverSeed)) !== proof.commitment) return false;
  const sequence = await reconstructDraw(proof.serverSeed, `draw:${proof.context}`, proof.variant);
  return proof.drawn.every((n, i) => sequence[i] === n);
}
export async function verifyInstant(
  proof: {
    serverSeed: string;
    commitment: string;
    context: string;
    drawn: number[];
    card: Card;
    stake: string;
    payout: string;
  },
  payoutBps: Record<string, number>,
): Promise<boolean> {
  if (proof.drawn.length !== 30 || !(await verifyDraw({ ...proof, variant: 75 }))) return false;
  const random = await entropy(proof.serverSeed, `card:${proof.context}`),
    columns: number[][] = [];
  for (let c = 0; c < 5; c++) {
    const values = Array.from({ length: 15 }, (_, i) => c * 15 + i + 1);
    for (let i = 14; i > 0; i--) {
      const j = await random(i + 1);
      [values[i], values[j]] = [values[j]!, values[i]!];
    }
    columns.push(values.slice(0, 5));
  }
  const card: Card = {
    variant: 75,
    rows: Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (r === 2 && c === 2 ? null : columns[c]![r]!)),
    ),
  };
  if (proof.card.variant !== 75 || JSON.stringify(card.rows) !== JSON.stringify(proof.card.rows))
    return false;
  let payout = 0n;
  for (const [pattern, bps] of Object.entries(payoutBps)) {
    if (wins(card, pattern as Pattern, proof.drawn)) {
      const amount = (BigInt(proof.stake) * BigInt(bps)) / 10000n;
      if (amount > payout) payout = amount;
    }
  }
  return payout === BigInt(proof.payout);
}
