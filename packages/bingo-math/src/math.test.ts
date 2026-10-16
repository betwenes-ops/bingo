import { it, expect } from 'vitest';
import { choose, completionProbability } from './index';
it('calcula combinações exatas sem flutuação', () => {
  expect(choose(5, 2)).toBe(10n);
  expect(choose(5, 0)).toBe(1n);
  expect(choose(2, 3)).toBe(0n);
  expect(choose(-1, 1)).toBe(0n);
  expect(choose(1, 0.5)).toBe(0n);
});
it('probabilidade marginal correta, sem alegar RTP conjunto', () => {
  expect(completionProbability(1, 30)).toEqual({
    numerator: choose(74, 29),
    denominator: choose(75, 30),
  });
  expect(completionProbability(31, 30).numerator).toBe(0n);
  for (const p of [
    [-1, 30],
    [76, 30],
    [1, -1],
    [1, 76],
  ])
    expect(() => completionProbability(p[0]!, p[1]!)).toThrow();
});
import { exactPayClasses, paytable, exactReturn, masks75, unionNumerator, bitCount } from './index';
it('partição exata cobre todas as classes sem contar padrões sobrepostos duas vezes', () => {
  const p = exactPayClasses();
  expect(p.classes.reduce((s, c) => s + c.numerator, 0n) + p.loss).toBe(p.denominator);
  expect(p.classes.every((c) => c.numerator >= 0n)).toBe(true);
  expect(unionNumerator([])).toBe(0n);
  expect(bitCount(0xffffff)).toBe(24);
  expect(masks75()).toHaveLength(15);
});
it('tabela calibrada resulta em RTP entre 94 e 96% em cada participação permitida', () => {
  const t = paytable();
  expect(t.version).toBe('instant-75-v1');
  for (const stake of [100n, 200n, 500n, 1000n, 2500n]) {
    const r = exactReturn(stake).rtp;
    expect(r).toBeGreaterThanOrEqual(0.94);
    expect(r).toBeLessThanOrEqual(0.96);
  }
});
