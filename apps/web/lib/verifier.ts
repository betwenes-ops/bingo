const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (n) => n.toString(16).padStart(2, '0')).join('');
export async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
export async function reconstructDraw(
  seed: string,
  context: string,
  variant: number,
): Promise<number[]> {
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
  const random = async (bound: number) => {
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
