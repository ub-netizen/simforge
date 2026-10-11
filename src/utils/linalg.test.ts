import { describe, expect, it } from 'vitest';
import { fromRows, ldltFactor, ldltSolve, matVec, nullVector, zeros, type DenseMatrix } from './linalg';

/** Deterministic PRNG (mulberry32) so test matrices are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
}

/** A = B Bᵀ (+ shift·I) with B an n × r random matrix: PSD with rank min(n, r) when shift = 0. */
function gram(n: number, r: number, seed: number, shift = 0): DenseMatrix {
  const rand = rng(seed);
  const b = Array.from({ length: n }, () => Array.from({ length: r }, rand));
  const a = zeros(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = i === j ? shift : 0;
      for (let k = 0; k < r; k++) s += b[i]![k]! * b[j]![k]!;
      a.data[i * n + j] = s;
    }
  return a;
}

const maxAbs = (v: ArrayLike<number>) => Array.from(v).reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('ldltFactor / ldltSolve', () => {
  it('solves a hand-checked 3 × 3 SPD system', () => {
    // A = [[4, 2, 0], [2, 5, 3], [0, 3, 6]], x = [1, -1, 2]  =>  b = A x = [2, 3, 9]
    const a = fromRows([
      [4, 2, 0],
      [2, 5, 3],
      [0, 3, 6],
    ]);
    const f = ldltFactor(a);
    expect(f.zeroPivots).toEqual([]);
    // Hand factorisation: d1 = 4, l21 = 1/2, d2 = 5 − 1 = 4, l32 = 3/4, d3 = 6 − 9/4 = 15/4
    expect(Array.from(f.d)).toEqual([4, 4, 3.75]);
    const x = ldltSolve(f, [2, 3, 9]);
    expect(x[0]).toBeCloseTo(1, 14);
    expect(x[1]).toBeCloseTo(-1, 14);
    expect(x[2]).toBeCloseTo(2, 14);
  });

  it('reconstructs A = L D Lᵀ', () => {
    const a = gram(12, 12, 7, 1);
    const { L, d, n } = ldltFactor(a);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k <= Math.min(i, j); k++) s += L[i * n + k]! * d[k]! * L[j * n + k]!;
        expect(s).toBeCloseTo(a.data[i * n + j]!, 12);
      }
  });

  it('solves random SPD systems to near machine precision', () => {
    for (const [n, seed] of [
      [5, 1],
      [30, 2],
      [120, 3],
    ] as const) {
      const a = gram(n, n, seed, 0.5);
      const rand = rng(seed + 100);
      const xTrue = Float64Array.from({ length: n }, rand);
      const b = matVec(a, xTrue);
      const x = ldltSolve(ldltFactor(a), b);
      const residual = matVec(a, x).map((v, i) => v - b[i]!);
      expect(maxAbs(residual) / maxAbs(b)).toBeLessThan(1e-12);
    }
  });

  it('refuses to solve a singular system', () => {
    const f = ldltFactor(fromRows([[1, 1], [1, 1]]));
    expect(() => ldltSolve(f, [1, 1])).toThrow(/singular/);
  });
});

describe('singularity detection', () => {
  it('reports one zero pivot for [[1, 1], [1, 1]]', () => {
    expect(ldltFactor(fromRows([[1, 1], [1, 1]])).zeroPivots).toEqual([1]);
  });

  it('reports a zero diagonal as a zero pivot', () => {
    expect(ldltFactor(fromRows([[0, 0], [0, 3]])).zeroPivots).toEqual([0]);
  });

  it('counts the null-space dimension of rank-deficient PSD matrices', () => {
    for (const [n, r] of [
      [6, 5],
      [10, 7],
      [40, 31],
    ] as const) {
      const f = ldltFactor(gram(n, r, n * 13 + r));
      expect(f.zeroPivots.length).toBe(n - r);
    }
  });

  it('returns null vectors with A x ≈ 0', () => {
    const a = gram(10, 7, 99);
    const f = ldltFactor(a);
    const scale = maxAbs(a.data);
    for (const k of f.zeroPivots) {
      const x = nullVector(f, k);
      expect(maxAbs(x)).toBeCloseTo(1, 14);
      expect(maxAbs(matVec(a, x)) / scale).toBeLessThan(1e-10);
    }
  });
});
