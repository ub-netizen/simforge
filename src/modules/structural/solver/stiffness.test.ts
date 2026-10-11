import { describe, expect, it } from 'vitest';
import { axialForce, elementStiffness, memberGeometry } from './stiffness';

const mul = (k: Float64Array, u: number[]) =>
  [0, 1, 2, 3].map((r) => [0, 1, 2, 3].reduce((s, c) => s + k[r * 4 + c]! * u[c]!, 0));

describe('memberGeometry', () => {
  it('computes length and direction cosines', () => {
    const g = memberGeometry(1, 2, 4, 6);
    expect(g.length).toBe(5);
    expect(g.c).toBeCloseTo(0.6, 15);
    expect(g.s).toBeCloseTo(0.8, 15);
  });
});

describe('elementStiffness', () => {
  const E = 200e9;
  const A = 1e-3;

  it('reduces to (EA/L)[1 −1; −1 1] for a horizontal bar', () => {
    const k = elementStiffness(memberGeometry(0, 0, 2, 0), E, A);
    const ka = (E * A) / 2;
    // `+ 0` normalises −0 to 0 so the comparison is on values only.
    // prettier-ignore
    expect(Array.from(k, (v) => v + 0)).toEqual([
       ka, 0, -ka, 0,
       0,  0,  0,  0,
      -ka, 0,  ka, 0,
       0,  0,  0,  0,
    ]);
  });

  it('matches the hand-computed matrix for a 3-4-5 bar', () => {
    // c = 0.6, s = 0.8, EA/L = 2e8 / 5 = 4e7
    const k = elementStiffness(memberGeometry(0, 0, 3, 4), E, A);
    const kl = 4e7;
    const expected = [0.36, 0.48, -0.36, -0.48, 0.48, 0.64, -0.48, -0.64, -0.36, -0.48, 0.36, 0.48, -0.48, -0.64, 0.48, 0.64];
    expected.forEach((v, i) => expect(k[i]!).toBeCloseTo(v * kl, 3));
  });

  it('is symmetric and has the three rigid-body modes as its null space', () => {
    const [xi, yi, xj, yj] = [0.3, -1.2, 2.9, 0.7];
    const k = elementStiffness(memberGeometry(xi, yi, xj, yj), E, A);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) expect(k[r * 4 + c]).toBe(k[c * 4 + r]);

    const scale = (E * A) / Math.hypot(xj - xi, yj - yi);
    const translateX = [1, 0, 1, 0];
    const translateY = [0, 1, 0, 1];
    const rotate = [-yi, xi, -yj, xj]; // small rotation about the origin
    for (const mode of [translateX, translateY, rotate])
      for (const f of mul(k, mode)) expect(Math.abs(f)).toBeLessThan(1e-12 * scale * 3);
  });

  it('gives end forces consistent with the axial force', () => {
    const g = memberGeometry(0, 0, 3, 4);
    const u = [1e-4, -2e-4, 3e-4, 5e-4];
    const f = mul(elementStiffness(g, E, A), u);
    const N = axialForce(g, E, A, ...(u as [number, number, number, number]));
    // kₑ uₑ = N [−c −s c s]
    [-g.c, -g.s, g.c, g.s].forEach((dir, i) => expect(f[i]!).toBeCloseTo(N * dir, 3));
  });
});

describe('axialForce', () => {
  it('is EA times the axial strain, positive in tension', () => {
    const g = memberGeometry(0, 0, 4, 0);
    expect(axialForce(g, 200e9, 1e-3, 0, 0, 1e-3, 0)).toBeCloseTo(5e4, 6); // stretched 1 mm over 4 m
    expect(axialForce(g, 200e9, 1e-3, 0, 0, -1e-3, 0)).toBeCloseTo(-5e4, 6);
    expect(axialForce(g, 200e9, 1e-3, 0, 0, 0, 1e-3)).toBe(0); // transverse motion: no first-order strain
  });
});
