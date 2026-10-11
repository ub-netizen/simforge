import { describe, expect, it } from 'vitest';
import { analyzeTruss } from '../solver/analyze';
import { REFERENCE_CASES } from '../validation/referenceCases';
import { indexAnalysis } from './analysisRun';

const caseModel = (id: string) => REFERENCE_CASES.find((c) => c.id === id)!.model;

describe('indexAnalysis', () => {
  it('indexes a solved run', () => {
    const model = caseModel('triangle-345');
    const idx = indexAnalysis({ model, result: analyzeTruss(model) });
    expect(idx.status).toBe('solved');
    expect(idx.members.get('13')!.axialForce).toBeCloseTo(12.5e3, 6);
    expect(idx.maxAbsForce).toBeCloseTo(12.5e3, 6);
    expect(idx.forceScale).toBeCloseTo(12.5e3, 6);
    expect(idx.autoScale).toBeGreaterThan(0);
    expect(idx.flaggedNodes.size).toBe(0);
  });

  it('flags the nodes of a mechanism and keeps its modes', () => {
    const model = { ...caseModel('triangle-345'), supports: [{ nodeId: '1', restrainX: true, restrainY: true }] };
    const idx = indexAnalysis({ model, result: analyzeTruss(model) });
    expect(idx.status).toBe('unstable');
    expect(idx.mechanismModes).toHaveLength(1);
    expect([...idx.flaggedNodes].sort()).toEqual(['2', '3']);
    expect(idx.members.size).toBe(0);
  });

  it('flags members referenced by input errors', () => {
    const base = caseModel('triangle-345');
    const model = { ...base, members: base.members.map((m) => (m.id === '23' ? { ...m, A: 0 } : m)) };
    const idx = indexAnalysis({ model, result: analyzeTruss(model) });
    expect(idx.status).toBe('invalid');
    expect([...idx.flaggedMembers]).toEqual(['23']);
  });
});
