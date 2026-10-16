import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  generateCard,
  validateCard,
  shuffle,
  wins,
  remaining,
  splitPrize,
  prizeFund,
  canTransition,
  patternMasks,
  type Pattern,
} from './index';
import { deterministicRandom, drawSequence, hash, newSeed, encryptSeed, decryptSeed } from './rng';

describe('cartelas e padrões', () => {
  for (const variant of [75, 80, 90] as const) {
    it(`gera 1.000 cartelas válidas de ${variant}`, () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
          const card = generateCard(
            variant,
            deterministicRandom(Buffer.from(bytes).toString('hex'), 'cards'),
          );
          expect(validateCard(card)).toBe(true);
          for (const pattern of (variant === 90
            ? ['line', 'two-lines', 'full']
            : ['line', 'column', 'diagonal', 'corners', 'x', 'l', 'full']) as Pattern[]) {
            expect(
              wins(
                card,
                pattern,
                Array.from({ length: variant }, (_, i) => i + 1),
              ),
            ).toBe(true);
            expect(wins(card, pattern, [])).toBe(false);
            expect(remaining(card, pattern, [])).toBeGreaterThan(0);
          }
        }),
        { numRuns: 1000, seed: 20261016 },
      );
    });
  }
  it('detecta formatos inválidos e números fora da coluna', () => {
    const original = generateCard(75, deterministicRandom('01'.repeat(32), 'test'));
    const copy = () => structuredClone(original);
    let c = copy();
    c.rows.pop();
    expect(validateCard(c)).toBe(false);
    c = copy();
    c.rows[0]!.pop();
    expect(validateCard(c)).toBe(false);
    c = copy();
    c.rows[0]![0] = 76;
    expect(validateCard(c)).toBe(false);
    c = copy();
    c.rows[0]![0] = 0;
    expect(validateCard(c)).toBe(false);
    c = copy();
    c.rows[0]![0] = 1.5;
    expect(validateCard(c)).toBe(false);
    c = copy();
    c.rows[0]![0] = c.rows[1]![0]!;
    expect(validateCard(c)).toBe(false);
    c = copy();
    c.rows[2]![2] = 31;
    expect(validateCard(c)).toBe(false);
    c = copy();
    c.rows[0]![0] = null;
    expect(validateCard(c)).toBe(false);
    c = copy();
    c.rows[0]![0] = 16;
    expect(validateCard(c)).toBe(false);
    const eighty = generateCard(80, () => 0);
    eighty.rows[0]![0] = null;
    expect(validateCard(eighty)).toBe(false);
    const ninety = generateCard(90, () => 0);
    ninety.rows[0]![ninety.rows[0]!.findIndex((n) => n !== null)] = null;
    expect(validateCard(ninety)).toBe(false);
    const n = generateCard(90, () => 0);
    for (const row of n.rows) {
      const i = row.findIndex((v, c) => v === null && c > 0);
      if (row[0] !== null && i >= 0) {
        row[i] = row[0]!;
        row[0] = null;
      }
    }
    expect(validateCard(n)).toBe(false);
  });
  it('avalia linha, coluna, diagonal, cantos, X e L com centro livre', () => {
    const card = generateCard(75, () => 0);
    for (const p of ['line', 'column', 'diagonal', 'corners', 'x', 'l', 'full'] as Pattern[]) {
      const mask = patternMasks(card, p)[0]!.filter((n): n is number => n !== null);
      expect(wins(card, p, mask)).toBe(true);
      expect(remaining(card, p, mask.slice(1))).toBeGreaterThan(0);
    }
    expect(() => patternMasks(card, 'two-lines')).toThrow('UNSUPPORTED');
    expect(() =>
      patternMasks(
        generateCard(90, () => 0),
        'column',
      ),
    ).toThrow('UNSUPPORTED');
  });
  it('shuffle valida a fonte de entropia', () => {
    expect(shuffle([], () => 0)).toEqual([]);
    for (const n of [-1, 2, 0.5]) expect(() => shuffle([1, 2], () => n)).toThrow('INVALID_RANDOM');
  });
});
describe('premiação', () => {
  it('conserva o fundo e distribui resto pela ordem de ID', () => {
    expect([...splitPrize(10n, ['c', 'a', 'b'])]).toEqual([
      ['a', 4n],
      ['b', 3n],
      ['c', 3n],
    ]);
    expect(splitPrize(0n, ['a']).get('a')).toBe(0n);
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 18n }),
        fc.integer({ min: 1, max: 100 }),
        (fund, n) => {
          const awards = splitPrize(
            fund,
            Array.from({ length: n }, (_, i) => String(i)),
          );
          expect([...awards.values()].reduce((a, b) => a + b, 0n)).toBe(fund);
        },
      ),
    );
  });
  it('rejeita entradas inválidas e usa bps inteiros', () => {
    for (const fn of [
      () => splitPrize(-1n, ['a']),
      () => splitPrize(1n, []),
      () => splitPrize(1n, ['a', 'a']),
      () => prizeFund(-1n, 1),
      () => prizeFund(1n, -1),
      () => prizeFund(1n, 10001),
      () => prizeFund(1n, 1.5),
    ])
      expect(fn).toThrow();
    expect(prizeFund(101n, 8500)).toBe(85n);
    expect(prizeFund(100n, 10000)).toBe(100n);
  });
  it('não permite cancelamento durante sorteio ou depois de concluir', () => {
    expect(canTransition('DRAWING', 'VERIFYING')).toBe(true);
    expect(canTransition('DRAWING', 'CANCELLED')).toBe(false);
    expect(canTransition('COMPLETED', 'DRAWING')).toBe(false);
  });
});
describe('RNG e cifra', () => {
  it('reproduz sequência, não repete bolas e separa contextos', () => {
    const seed = 'ab'.repeat(32);
    for (const count of [75, 80, 90]) {
      const sequence = drawSequence(seed, 'round:1', count);
      expect(sequence).toEqual(drawSequence(seed, 'round:1', count));
      expect(new Set(sequence).size).toBe(count);
      expect([...sequence].sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, i) => i + 1),
      );
      expect(sequence).not.toEqual(drawSequence(seed, 'round:2', count));
    }
    expect(() => drawSequence(seed, 'x', 74)).toThrow();
    expect(hash(seed)).toHaveLength(64);
    expect(newSeed()).toHaveLength(64);
  });
  it('valida bounds e rejeita amostras fora da faixa sem viés de módulo', () => {
    const random = deterministicRandom('aa'.repeat(32), 'rejection');
    for (const bound of [0, -1, 1.1, 0x100000001]) expect(() => random(bound)).toThrow();
    expect(random(1)).toBe(0);
    for (let i = 0; i < 20; i++) {
      const n = random(0x80000001);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(0x80000001);
    }
  });
  it('cifra autenticada falha com chave errada e texto adulterado', () => {
    const key = '11'.repeat(32),
      seed = newSeed(),
      encrypted = encryptSeed(seed, key);
    expect(decryptSeed(encrypted, key)).toBe(seed);
    expect(() => decryptSeed(encrypted, '22'.repeat(32))).toThrow();
    expect(() => decryptSeed('invalid', key)).toThrow();
  });
  it('distribuição por posição em amostra fixa não apresenta desvio grosseiro', () => {
    const frequencies = Array<number>(75).fill(0);
    for (let i = 0; i < 15000; i++) {
      const seq = drawSequence(hash(String(i)), 'statistical-test', 75);
      frequencies[seq[0]! - 1]!++;
    }
    const chi = frequencies.reduce((sum, n) => sum + (n - 200) ** 2 / 200, 0);
    expect(chi).toBeLessThan(125);
  });
});
