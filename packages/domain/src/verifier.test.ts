import { it, expect } from 'vitest';
import { generateCard, wins, type Pattern } from './index';
import { hash, drawSequence, deterministicRandom } from './rng';
import { verifyInstant, verifyDraw, reconstructDraw, sha256 } from '../../../apps/web/lib/verifier';
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

it('verifica também cartela e pagamento do individual, rejeitando adulterações', async () => {
  const serverSeed = '78'.repeat(32),
    context = 'instant-verification',
    card = generateCard(75, deterministicRandom(serverSeed, `card:${context}`)),
    drawn = drawSequence(serverSeed, context, 75).slice(0, 30),
    payoutBps = {
      line: 30000,
      column: 30000,
      diagonal: 60000,
      corners: 90000,
      x: 300000,
      full: 6000000,
    };
  let payout = 0n;
  for (const [p, bps] of Object.entries(payoutBps)) {
    if (wins(card, p as Pattern, drawn)) {
      const amount = (100n * BigInt(bps)) / 10000n;
      if (amount > payout) payout = amount;
    }
  }
  const proof = {
    serverSeed,
    context,
    card,
    drawn,
    commitment: hash(serverSeed),
    stake: '100',
    payout: payout.toString(),
  };
  expect(await verifyInstant(proof, payoutBps)).toBe(true);
  expect(await verifyInstant({ ...proof, payout: (payout + 1n).toString() }, payoutBps)).toBe(
    false,
  );
  expect(await verifyInstant({ ...proof, drawn: drawn.slice(1) }, payoutBps)).toBe(false);
  const bad = structuredClone(proof);
  bad.card.rows[0]![0] = 99;
  expect(await verifyInstant(bad, payoutBps)).toBe(false);
});
