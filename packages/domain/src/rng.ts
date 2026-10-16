import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { shuffle, type RandomInt } from './index';
export const algorithmVersion = 'hmac-sha256-fy-v1';
export function hash(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
export function newSeed(): string {
  return randomBytes(32).toString('hex');
}
export function deterministicRandom(seed: string, context: string): RandomInt {
  let counter = 0n;
  let block = Buffer.alloc(0),
    offset = 0;
  return (bound: number) => {
    if (!Number.isSafeInteger(bound) || bound < 1 || bound > 0x100000000)
      throw new Error('INVALID_BOUND');
    const limit = Math.floor(0x100000000 / bound) * bound;
    for (;;) {
      if (offset >= block.length) {
        block = createHmac('sha256', Buffer.from(seed, 'hex'))
          .update(`${algorithmVersion}\n${context}\n${counter++}`)
          .digest();
        offset = 0;
      }
      const value = block.readUInt32BE(offset);
      offset += 4;
      if (value < limit) return value % bound;
    }
  };
}
export function drawSequence(seed: string, context: string, count: number): number[] {
  if (![75, 80, 90].includes(count)) throw new Error('INVALID_VARIANT');
  return shuffle(
    Array.from({ length: count }, (_, i) => i + 1),
    deterministicRandom(seed, `draw:${context}`),
  );
}
export function encryptSeed(seed: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(seed, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(
    ':',
  );
}
export function decryptSeed(encrypted: string, key: string): string {
  const [iv, tag, data] = encrypted.split(':');
  if (!iv || !tag || !data) throw new Error('INVALID_CIPHERTEXT');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}
