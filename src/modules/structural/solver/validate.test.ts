import { describe, expect, it } from 'vitest';
import type { DiagnosticCode, TrussModel } from '../models/truss';
import { validateTrussModel } from './validate';

const E = 200e9;
const A = 1e-3;

const valid: TrussModel = {
  nodes: [
    { id: '1', x: 0, y: 0 },
    { id: '2', x: 4, y: 0 },
    { id: '3', x: 2, y: 2 },
  ],
  members: [
    { id: 'a', nodeI: '1', nodeJ: '2', E, A },
    { id: 'b', nodeI: '2', nodeJ: '3', E, A },
    { id: 'c', nodeI: '3', nodeJ: '1', E, A },
  ],
  supports: [
    { nodeId: '1', restrainX: true, restrainY: true },
    { nodeId: '2', restrainX: false, restrainY: true },
  ],
  loads: [{ nodeId: '3', fx: 0, fy: -1000 }],
};

const codes = (m: TrussModel, severity?: string) =>
  validateTrussModel(m)
    .filter((d) => !severity || d.severity === severity)
    .map((d) => d.code);

function expectError(model: TrussModel, code: DiagnosticCode) {
  expect(codes(model, 'error')).toContain(code);
}

describe('validateTrussModel', () => {
  it('accepts a valid model without diagnostics', () => {
    expect(validateTrussModel(valid)).toEqual([]);
  });

  it('rejects an empty model', () => {
    expect(codes({ nodes: [], members: [], supports: [], loads: [] }, 'error')).toEqual(['EMPTY_MODEL', 'EMPTY_MODEL']);
  });

  it('rejects duplicate ids', () => {
    expectError({ ...valid, nodes: [...valid.nodes, { id: '1', x: 9, y: 9 }] }, 'DUPLICATE_ID');
    expectError({ ...valid, members: [...valid.members, { id: 'a', nodeI: '1', nodeJ: '3', E, A }] }, 'DUPLICATE_ID');
  });

  it('rejects non-finite coordinates', () => {
    expectError({ ...valid, nodes: [{ id: '1', x: NaN, y: 0 }, ...valid.nodes.slice(1)] }, 'INVALID_COORDINATE');
  });

  it('rejects references to missing nodes', () => {
    expectError({ ...valid, members: [...valid.members, { id: 'd', nodeI: '1', nodeJ: '9', E, A }] }, 'UNKNOWN_NODE');
    expectError({ ...valid, supports: [...valid.supports, { nodeId: '9', restrainX: true, restrainY: true }] }, 'UNKNOWN_NODE');
    expectError({ ...valid, loads: [{ nodeId: '9', fx: 1, fy: 0 }] }, 'UNKNOWN_NODE');
  });

  it('rejects zero-length members', () => {
    expectError({ ...valid, members: [...valid.members, { id: 'd', nodeI: '3', nodeJ: '3', E, A }] }, 'ZERO_LENGTH_MEMBER');
    const coincident: TrussModel = {
      ...valid,
      nodes: [...valid.nodes, { id: '4', x: 2, y: 2 }],
      members: [...valid.members, { id: 'd', nodeI: '3', nodeJ: '4', E, A }],
    };
    expectError(coincident, 'ZERO_LENGTH_MEMBER');
    expect(codes(coincident, 'warning')).toContain('COINCIDENT_NODES');
  });

  it('rejects non-positive or non-finite E and A', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expectError({ ...valid, members: [{ ...valid.members[0]!, E: bad }, ...valid.members.slice(1)] }, 'INVALID_PROPERTY');
      expectError({ ...valid, members: [{ ...valid.members[0]!, A: bad }, ...valid.members.slice(1)] }, 'INVALID_PROPERTY');
    }
  });

  it('warns about parallel duplicate members, in either direction', () => {
    const dup = { ...valid, members: [...valid.members, { id: 'd', nodeI: '2', nodeJ: '1', E, A }] };
    expect(codes(dup, 'warning')).toEqual(['DUPLICATE_MEMBER']);
    expect(codes(dup, 'error')).toEqual([]);
  });

  it('checks supports', () => {
    expectError({ ...valid, supports: [...valid.supports, { nodeId: '1', restrainX: true, restrainY: false }] }, 'DUPLICATE_SUPPORT');
    expect(codes({ ...valid, supports: [...valid.supports, { nodeId: '3', restrainX: false, restrainY: false }] }, 'warning')).toContain(
      'EMPTY_SUPPORT',
    );
  });

  it('checks settlements', () => {
    const withSettlement = (s: TrussModel['supports'][number]) => ({ ...valid, supports: [valid.supports[0]!, s] });
    expectError(withSettlement({ nodeId: '2', restrainX: false, restrainY: true, settlementX: 0.01 }), 'INVALID_SETTLEMENT');
    expectError(withSettlement({ nodeId: '2', restrainX: false, restrainY: true, settlementY: NaN }), 'INVALID_SETTLEMENT');
    expect(validateTrussModel(withSettlement({ nodeId: '2', restrainX: false, restrainY: true, settlementY: -0.01 }))).toEqual([]);
  });

  it('rejects non-finite loads', () => {
    expectError({ ...valid, loads: [{ nodeId: '3', fx: Infinity, fy: 0 }] }, 'INVALID_LOAD');
  });

  it('treats an unconnected node as an error unless it is fully supported', () => {
    const extra = { ...valid, nodes: [...valid.nodes, { id: '4', x: 10, y: 0 }] };
    expectError(extra, 'UNCONNECTED_NODE');
    const pinned = { ...extra, supports: [...valid.supports, { nodeId: '4', restrainX: true, restrainY: true }] };
    expect(codes(pinned, 'error')).toEqual([]);
    expect(codes(pinned, 'warning')).toEqual(['UNCONNECTED_NODE']);
  });

  it('notes when nothing is loaded', () => {
    expect(codes({ ...valid, loads: [] }, 'info')).toEqual(['NO_LOADS']);
    expect(codes({ ...valid, loads: [{ nodeId: '3', fx: 0, fy: 0 }] }, 'info')).toEqual(['NO_LOADS']);
  });
});
