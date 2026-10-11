/**
 * Solver results compared against independently derived closed-form solutions
 * (see referenceCases.ts for the derivations).
 */
import { describe, expect, it } from 'vitest';
import { analyzeTruss } from '../solver/analyze';
import type { TrussAnalysis, TrussModel } from '../models/truss';
import { REFERENCE_CASES } from './referenceCases';

/** Relative agreement required between solver and hand solution. */
const REL_TOL = 1e-9;

type Solved = Extract<TrussAnalysis, { status: 'solved' }>;

function solve(model: TrussModel): Solved {
  const r = analyzeTruss(model);
  if (r.status !== 'solved') throw new Error(`expected solved, got ${r.status}: ${JSON.stringify(r.diagnostics)}`);
  return r;
}

/** |actual − expected| ≤ tol · scale, where scale is the problem's characteristic magnitude. */
function expectClose(actual: number, expected: number, scale: number, label: string) {
  const err = Math.abs(actual - expected);
  if (!(err <= REL_TOL * scale)) {
    throw new Error(`${label}: expected ${expected}, got ${actual} (error ${err.toExponential(2)}, scale ${scale})`);
  }
}

describe.each(REFERENCE_CASES)('reference case: $title', ({ model, expected }) => {
  const result = solve(model);

  const forceScale = Math.max(
    1,
    ...Object.values(expected.axialForces).map(Math.abs),
    ...model.loads.flatMap((l) => [Math.abs(l.fx), Math.abs(l.fy)]),
  );
  const dispValues = Object.values(expected.displacements ?? {}).flatMap((d) => [d.ux ?? 0, d.uy ?? 0]);
  const dispScale = Math.max(...dispValues.map(Math.abs), 1e-12);

  it('matches the analytical member forces', () => {
    for (const [id, N] of Object.entries(expected.axialForces)) {
      const m = result.members.find((r) => r.memberId === id);
      expect(m, `member ${id}`).toBeDefined();
      expectClose(m!.axialForce, N, forceScale, `N[${id}]`);
    }
  });

  it('matches the analytical reactions', () => {
    for (const [id, r] of Object.entries(expected.reactions ?? {})) {
      const got = result.reactions.find((x) => x.nodeId === id);
      expect(got, `reaction at ${id}`).toBeDefined();
      expectClose(got!.rx, r.rx, forceScale, `Rx[${id}]`);
      expectClose(got!.ry, r.ry, forceScale, `Ry[${id}]`);
    }
  });

  it('matches the analytical displacements', () => {
    for (const [id, d] of Object.entries(expected.displacements ?? {})) {
      const got = result.displacements.find((x) => x.nodeId === id)!;
      if (d.ux !== undefined) expectClose(got.ux, d.ux, dispScale, `ux[${id}]`);
      if (d.uy !== undefined) expectClose(got.uy, d.uy, dispScale, `uy[${id}]`);
    }
  });

  it('satisfies global and nodal equilibrium', () => {
    const { sumFx, sumFy, sumMoment, relativeResidual } = result.equilibrium;
    const extent = Math.max(...model.nodes.map((n) => Math.hypot(n.x, n.y)), 1);
    expect(Math.abs(sumFx)).toBeLessThan(REL_TOL * forceScale);
    expect(Math.abs(sumFy)).toBeLessThan(REL_TOL * forceScale);
    expect(Math.abs(sumMoment)).toBeLessThan(REL_TOL * forceScale * extent);
    expect(relativeResidual).toBeLessThan(1e-10);
  });

  it("balances external work and strain energy (Clapeyron's theorem)", () => {
    // ½ Σ (applied loads · u + reactions · prescribed u) = Σ N² L / (2 E A)
    const disp = new Map(result.displacements.map((d) => [d.nodeId, d]));
    let work = 0;
    for (const l of model.loads) work += l.fx * disp.get(l.nodeId)!.ux + l.fy * disp.get(l.nodeId)!.uy;
    for (const r of result.reactions) work += r.rx * disp.get(r.nodeId)!.ux + r.ry * disp.get(r.nodeId)!.uy;
    work /= 2;

    let energy = 0;
    result.members.forEach((m, i) => {
      const { E, A } = model.members[i]!;
      energy += (m.axialForce ** 2 * m.length) / (2 * E * A);
    });

    expect(Math.abs(work - energy)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(energy), 1e-12));
  });

  it('reports consistent derived quantities', () => {
    result.members.forEach((m, i) => {
      const { E, A } = model.members[i]!;
      expect(m.stress).toBeCloseTo(m.axialForce / A, 6);
      expect(m.strain).toBeCloseTo(m.axialForce / (E * A), 18);
      expect(m.elongation).toBeCloseTo(m.strain * m.length, 18);
    });
  });
});

describe('member state classification', () => {
  it('labels tension, compression and zero-force members', () => {
    const tri = REFERENCE_CASES.find((c) => c.id === 'triangle-345')!;
    const states = Object.fromEntries(solve(tri.model).members.map((m) => [m.memberId, m.state]));
    expect(states).toEqual({ '12': 'zero', '23': 'compression', '13': 'tension' });
  });
});
