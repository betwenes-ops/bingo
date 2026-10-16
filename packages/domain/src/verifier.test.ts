import { it, expect } from 'vitest';
import { hash, drawSequence } from './rng';
import { verifyDraw, reconstructDraw, sha256 } from '../../../apps/web/lib/verifier';
it('WebCrypto independente reproduz os vetores HMAC do servidor', async () => {
  const seed = '34'.repeat(32);
  for (const variant of [75, 80, 90]) {
    const context = JSON.stringify(['hmac-sha256-fy-v1', 'public-round', 'manifest', 0]);
    const sequence = drawSequence(seed, context, variant);
    expect(await reconstructDraw(seed, `draw:${context}`, variant)).toEqual(sequence);
    expect(
      await verifyDraw({
        serverSeed: seed,
        commitment: hash(seed),
        context,
        variant,
        drawn: sequence.slice(0, 30),
      }),
    ).toBe(true);
  }
  expect(await sha256('hello')).toBe(hash('hello'));
});
it('verificador detecta seed ou sequência adulterada', async () => {
  const seed = '56'.repeat(32);
  expect(
    await verifyDraw({
      serverSeed: seed,
      commitment: hash('wrong'),
      context: 'x',
      variant: 75,
      drawn: [],
    }),
  ).toBe(false);
  expect(
    await verifyDraw({
      serverSeed: seed,
      commitment: hash(seed),
      context: 'x',
      variant: 75,
      drawn: [99],
    }),
  ).toBe(false);
});
