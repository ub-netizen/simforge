import { describe, expect, it } from 'vitest';
import type { NodalLoad, TrussAnalysis, TrussModel, TrussSupport } from '../models/truss';
import { REFERENCE_CASES } from '../validation/referenceCases';
import { analyzeTruss } from './analyze';

const E = 200e9;
const A = 1e-3;
const P = 10e3;

const bar = (id: string, nodeI: string, nodeJ: string) => ({ id, nodeI, nodeJ, E, A });
const pin = (nodeId: string): TrussSupport => ({ nodeId, restrainX: true, restrainY: true });
const rollerY = (nodeId: string): TrussSupport => ({ nodeId, restrainX: false, restrainY: true });
const node = (id: string, x: number, y: number) => ({ id, x, y });

type Solved = Extract<TrussAnalysis, { status: 'solved' }>;
type Unstable = Extract<TrussAnalysis, { status: 'unstable' }>;

function solved(model: TrussModel): Solved {
  const r = analyzeTruss(model);
  expect(r.status).toBe('solved');
  return r as Solved;
}

function unstable(model: TrussModel): Unstable {
  const r = analyzeTruss(model);
  expect(r.status).toBe('unstable');
  return r as Unstable;
}

const caseModel = (id: string) => REFERENCE_CASES.find((c) => c.id === id)!.model;
const force = (r: Solved, id: string) => r.members.find((m) => m.memberId === id)!.axialForce;
const disp = (r: Solved, id: string) => r.displacements.find((d) => d.nodeId === id)!;

/** In a mechanism mode no member changes length (to first order). */
function expectInextensional(model: TrussModel, r: Unstable) {
  const pos = new Map(model.nodes.map((n) => [n.id, n]));
  for (const mode of r.mechanismModes) {
    const u = new Map(mode.displacements.map((d) => [d.nodeId, d]));
    for (const m of model.members) {
      const a = pos.get(m.nodeI)!;
      const b = pos.get(m.nodeJ)!;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const ua = u.get(m.nodeI)!;
      const ub = u.get(m.nodeJ)!;
      const stretch = ((b.x - a.x) * (ub.ux - ua.ux) + (b.y - a.y) * (ub.uy - ua.uy)) / L;
      expect(Math.abs(stretch)).toBeLessThan(1e-9);
    }
    const max = Math.max(...mode.displacements.map((d) => Math.max(Math.abs(d.ux), Math.abs(d.uy))));
    expect(max).toBeCloseTo(1, 12);
  }
}

describe('stability detection', () => {
  const square = (supports: TrussSupport[], diagonal = false): TrussModel => ({
    nodes: [node('1', 0, 0), node('2', 3, 0), node('3', 3, 3), node('4', 0, 3)],
    members: [bar('a', '1', '2'), bar('b', '2', '3'), bar('c', '3', '4'), bar('d', '4', '1'), ...(diagonal ? [bar('e', '1', '3')] : [])],
    supports,
    loads: [{ nodeId: '3', fx: P, fy: 0 }],
  });

  it('detects a square panel without a diagonal as a one-mode mechanism', () => {
    const model = square([pin('1'), rollerY('2')]);
    const r = unstable(model);
    expect(r.mechanismModes).toHaveLength(1);
    expect(r.stats.determinacyDegree).toBe(-1);
    expect(r.diagnostics.find((d) => d.code === 'MECHANISM')?.severity).toBe('error');
    expectInextensional(model, r);
    // The racking mode moves the top nodes sideways, not the base.
    const mode = new Map(r.mechanismModes[0]!.displacements.map((d) => [d.nodeId, d]));
    expect(Math.abs(mode.get('3')!.ux)).toBeCloseTo(1, 12);
    expect(Math.abs(mode.get('4')!.ux)).toBeCloseTo(1, 12);
    expect(mode.get('1')).toEqual({ nodeId: '1', ux: 0, uy: 0 });
  });

  it('solves the same panel once a diagonal is added', () => {
    solved(square([pin('1'), rollerY('2')], true));
  });

  it('finds the rigid-body rotation when only one pin is provided', () => {
    const model = { ...caseModel('triangle-345'), supports: [pin('1')] };
    const r = unstable(model);
    expect(r.mechanismModes).toHaveLength(1);
    expectInextensional(model, r);
  });

  it('finds all three rigid-body modes of an unsupported structure', () => {
    const model = { ...caseModel('triangle-345'), supports: [] };
    const r = unstable(model);
    expect(r.mechanismModes).toHaveLength(3);
    expect(r.stats.determinacyDegree).toBe(-3);
    expectInextensional(model, r);
  });

  it('detects parallel reactions even though m + r = 2n', () => {
    // Three vertical rollers cannot resist horizontal translation.
    const model = { ...caseModel('triangle-345'), supports: [rollerY('1'), rollerY('2'), rollerY('3')] };
    const r = unstable(model);
    expect(r.stats.determinacyDegree).toBe(0);
    expect(r.mechanismModes).toHaveLength(1);
    expect(r.diagnostics.find((d) => d.code === 'MECHANISM')!.message).toMatch(/arrangement is unstable/);
    expectInextensional(model, r);
  });

  it('detects a joint between collinear members (zero transverse stiffness)', () => {
    const model: TrussModel = {
      nodes: [node('1', 0, 0), node('2', 2, 0), node('3', 4, 0)],
      members: [bar('a', '1', '2'), bar('b', '2', '3')],
      supports: [pin('1'), pin('3')],
      loads: [{ nodeId: '2', fx: 0, fy: -P }],
    };
    const r = unstable(model);
    expect(r.stats.determinacyDegree).toBe(0);
    expect(r.diagnostics.find((d) => d.code === 'MECHANISM')!.nodeIds).toEqual(['2']);
    expectInextensional(model, r);
  });

  it('detects a mechanism in a larger truss with one missing diagonal', () => {
    const base = caseModel('pratt-6-panel');
    const model = { ...base, members: base.members.filter((m) => m.id !== 't2-b3') };
    const r = unstable(model);
    expect(r.mechanismModes).toHaveLength(1);
    expectInextensional(model, r);
  });
});

describe('determinacy classification', () => {
  it('counts m + r − 2n', () => {
    expect(solved(caseModel('triangle-345')).stats.determinacyDegree).toBe(0);
    expect(solved(caseModel('three-bar-hanger')).stats.determinacyDegree).toBe(1);
    expect(solved(caseModel('pratt-6-panel')).stats.determinacyDegree).toBe(0);
  });
});

describe('physical invariances', () => {
  it('gives the same member forces when the whole problem is rotated', () => {
    // Pin-only supports restrain both directions, so they rotate with the structure.
    const base = caseModel('three-bar-hanger');
    const t = (37 * Math.PI) / 180;
    const rot = (x: number, y: number) => ({ x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) });
    const rotated: TrussModel = {
      ...base,
      nodes: base.nodes.map((n) => ({ id: n.id, ...rot(n.x, n.y) })),
      loads: base.loads.map((l) => {
        const f = rot(l.fx, l.fy);
        return { nodeId: l.nodeId, fx: f.x, fy: f.y };
      }),
    };
    const r0 = solved(base);
    const r1 = solved(rotated);
    for (const m of r0.members) expect(force(r1, m.memberId)).toBeCloseTo(m.axialForce, 6);
    for (const d of r0.displacements) {
      const expected = rot(d.ux, d.uy);
      expect(disp(r1, d.nodeId).ux).toBeCloseTo(expected.x, 15);
      expect(disp(r1, d.nodeId).uy).toBeCloseTo(expected.y, 15);
    }
  });

  it('gives the same results when the structure is translated', () => {
    const base = caseModel('warren-3-panel');
    const moved = { ...base, nodes: base.nodes.map((n) => ({ ...n, x: n.x + 1234.5, y: n.y - 678.9 })) };
    const r0 = solved(base);
    const r1 = solved(moved);
    for (const m of r0.members) expect(force(r1, m.memberId)).toBeCloseTo(m.axialForce, 4);
  });

  it('does not depend on node or member ordering', () => {
    const base = caseModel('pratt-6-panel');
    const shuffled: TrussModel = {
      ...base,
      nodes: [...base.nodes].reverse(),
      members: [...base.members].reverse().map((m, i) => (i % 2 ? { ...m, nodeI: m.nodeJ, nodeJ: m.nodeI } : m)),
    };
    const r0 = solved(base);
    const r1 = solved(shuffled);
    for (const m of r0.members) expect(force(r1, m.memberId)).toBeCloseTo(m.axialForce, 6);
    for (const d of r0.displacements) {
      expect(disp(r1, d.nodeId).ux).toBeCloseTo(d.ux, 15);
      expect(disp(r1, d.nodeId).uy).toBeCloseTo(d.uy, 15);
    }
  });

  it('obeys superposition and linear scaling', () => {
    const base = caseModel('warren-3-panel');
    const loadsA: NodalLoad[] = [{ nodeId: '5', fx: 0, fy: -P }];
    const loadsB: NodalLoad[] = [{ nodeId: '4', fx: 3 * P, fy: 0.5 * P }];
    const rA = solved({ ...base, loads: loadsA });
    const rB = solved({ ...base, loads: loadsB });
    const rAB = solved({ ...base, loads: [...loadsA, ...loadsB] });
    const r2A = solved({ ...base, loads: loadsA.map((l) => ({ ...l, fy: 2 * l.fy })) });
    for (const m of rAB.members) {
      expect(m.axialForce).toBeCloseTo(force(rA, m.memberId) + force(rB, m.memberId), 6);
      expect(force(r2A, m.memberId)).toBeCloseTo(2 * force(rA, m.memberId), 6);
    }
  });
});

describe('loads and supports', () => {
  it('sums several loads on the same node', () => {
    const base = caseModel('triangle-345');
    const split = solved({
      ...base,
      loads: [
        { nodeId: '3', fx: 0.25 * P, fy: 0 },
        { nodeId: '3', fx: 0.75 * P, fy: 0 },
      ],
    });
    const whole = solved(base);
    for (const m of whole.members) expect(force(split, m.memberId)).toBeCloseTo(m.axialForce, 6);
  });

  it('sends a load applied at a support straight into the reaction', () => {
    const base = caseModel('triangle-345');
    const r = solved({ ...base, loads: [{ nodeId: '1', fx: P, fy: -2 * P }] });
    for (const m of r.members) expect(Math.abs(m.axialForce)).toBeLessThan(1e-9 * P);
    expect(r.reactions.find((x) => x.nodeId === '1')).toMatchObject({ rx: -P, ry: 2 * P });
  });

  it('handles a model with every degree of freedom restrained', () => {
    // Both ends pinned, one end displaced 1 mm: N = EA Δ / L.
    const r = solved({
      nodes: [node('1', 0, 0), node('2', 2, 0)],
      members: [bar('a', '1', '2')],
      supports: [pin('1'), { nodeId: '2', restrainX: true, restrainY: true, settlementX: 1e-3 }],
      loads: [],
    });
    expect(r.stats.freeDofs).toBe(0);
    expect(r.stats.pivotRatio).toBeNull();
    expect(force(r, 'a')).toBeCloseTo((E * A * 1e-3) / 2, 6);
    expect(r.reactions.find((x) => x.nodeId === '2')!.rx).toBeCloseTo((E * A * 1e-3) / 2, 6);
  });
});

describe('result diagnostics', () => {
  it('reports equilibrium and the buckling caveat on a solved model', () => {
    const r = solved(caseModel('warren-3-panel'));
    expect(r.diagnostics.find((d) => d.code === 'EQUILIBRIUM')?.severity).toBe('info');
    const buckling = r.diagnostics.find((d) => d.code === 'BUCKLING_NOT_CHECKED')!;
    expect(new Set(buckling.memberIds)).toEqual(new Set(['45', '56', '04', '63', '15', '52']));
  });

  it('omits the buckling caveat when nothing is in compression', () => {
    const r = solved(caseModel('single-bar'));
    expect(r.diagnostics.some((d) => d.code === 'BUCKLING_NOT_CHECKED')).toBe(false);
  });

  it('warns when displacements violate the small-displacement assumption', () => {
    const base = caseModel('two-bar');
    const r = solved({ ...base, members: base.members.map((m) => ({ ...m, E: 1e6 })) });
    expect(r.diagnostics.find((d) => d.code === 'LARGE_DISPLACEMENT')?.severity).toBe('warning');
    expect(solved(base).diagnostics.some((d) => d.code === 'LARGE_DISPLACEMENT')).toBe(false);
  });

  it('warns about extreme stiffness contrast', () => {
    const base = caseModel('series-bars');
    const r = solved({ ...base, members: base.members.map((m) => (m.id === 'al' ? { ...m, E: 1e-6 } : m)) });
    expect(r.stats.pivotRatio!).toBeLessThan(1e-12);
    expect(r.diagnostics.some((d) => d.code === 'ILL_CONDITIONED')).toBe(true);
  });

  it('returns invalid without solving when input errors exist', () => {
    const r = analyzeTruss({ ...caseModel('triangle-345'), members: [bar('a', '1', '2'), bar('b', '2', 'missing')] });
    expect(r.status).toBe('invalid');
    expect(r.diagnostics.some((d) => d.code === 'UNKNOWN_NODE')).toBe(true);
  });
});
