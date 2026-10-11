import { describe, expect, it } from 'vitest';
import { analyzeTruss } from '../solver/analyze';
import { REFERENCE_CASES } from '../validation/referenceCases';
import { MATERIALS } from '../models/materials';
import { EXAMPLES, getExample, relabel } from './examples';

const A36 = MATERIALS.find((m) => m.id === 'steel-a36')!;

describe.each(EXAMPLES)('example: $title', (example) => {
  const ref = REFERENCE_CASES.find((c) => c.id === example.referenceId)!;
  const result = analyzeTruss(example.model);

  it('solves without errors or warnings', () => {
    expect(result.status).toBe('solved');
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('reproduces the analytical member forces and reactions of its reference case', () => {
    if (result.status !== 'solved') throw new Error(result.status);
    const scale = Math.max(1, ...Object.values(ref.expected.axialForces).map(Math.abs));
    for (const [refId, N] of Object.entries(ref.expected.axialForces)) {
      const m = result.members.find((r) => r.memberId === example.memberIds.get(refId))!;
      expect(Math.abs(m.axialForce - N)).toBeLessThanOrEqual(1e-9 * scale);
    }
    for (const [refId, R] of Object.entries(ref.expected.reactions ?? {})) {
      const r = result.reactions.find((x) => x.nodeId === example.nodeIds.get(refId))!;
      expect(Math.abs(r.rx - R.rx)).toBeLessThanOrEqual(1e-9 * scale);
      expect(Math.abs(r.ry - R.ry)).toBeLessThanOrEqual(1e-9 * scale);
    }
  });

  it('uses editor-style ids and A36 steel with the E used in the derivation', () => {
    expect(example.model.nodes.map((n) => n.id)).toEqual(example.model.nodes.map((_, i) => `N${i + 1}`));
    for (const m of example.model.members) {
      expect(m).toMatchObject({ material: A36.id, yieldStrength: A36.yieldStrength, E: A36.E });
    }
  });
});

describe('examples', () => {
  it('have unique ids and can be looked up', () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    expect(getExample('warren')?.title).toMatch(/Warren/);
    expect(getExample('nope')).toBeUndefined();
    expect(getExample(null)).toBeUndefined();
  });

  it('relabel keeps connectivity', () => {
    const { model, nodeIds } = relabel(REFERENCE_CASES[0]!.model);
    expect(model.members[0]).toMatchObject({ id: 'M1', nodeI: nodeIds.get('1'), nodeJ: nodeIds.get('2') });
  });
});
