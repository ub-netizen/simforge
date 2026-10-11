import { describe, expect, it } from 'vitest';
import { getExample } from '../examples/examples';
import { analyzeTruss } from '../solver/analyze';
import { indexAnalysis } from './analysisRun';
import { csvCell, displacementsCsv, memberForcesCsv, reactionsCsv, toCsv } from './csv';

const parse = (csv: string) => csv.trimEnd().split('\r\n').map((line) => line.split(','));

describe('csv encoding', () => {
  it('quotes only when needed and escapes quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Infinity)).toBe('inf');
    expect(csvCell(-0.25)).toBe('-0.25');
  });

  it('uses CRLF line endings with a trailing newline', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a,b\r\n1,2\r\n');
  });
});

describe('results csv', () => {
  // 3-4-5 triangle: N(N3–N1) = +12.5 kN, N(N2–N3) = −7.5 kN, N(N1–N2) = 0.
  const example = getExample('triangle')!;
  const run = { model: example.model, result: analyzeTruss(example.model) };
  const index = indexAnalysis(run);

  it('writes member forces in kN and MPa with the yield FoS', () => {
    const rows = parse(memberForcesCsv(run, index));
    expect(rows[0]).toEqual([
      'member', 'node_i', 'node_j', 'length_m', 'axial_force_kN', 'state', 'stress_MPa', 'strain',
      'elongation_mm', 'E_GPa', 'A_mm2', 'yield_strength_MPa', 'fos_yield',
    ]);
    const byId = Object.fromEntries(rows.slice(1).map((r) => [r[0], r]));
    expect(byId.M1!.slice(3, 7)).toEqual(['4', '0', 'zero', '0']);
    expect(byId.M2!.slice(3, 7)).toEqual(['3', '-7.5', 'compression', '-7.5']);
    expect(byId.M3!.slice(3, 7)).toEqual(['5', '12.5', 'tension', '12.5']);
    expect(byId.M3![12]).toBe('20'); // 250 MPa / 12.5 MPa
    expect(byId.M1![12]).toBe('inf');
  });

  it('writes displacements in mm', () => {
    const rows = parse(displacementsCsv(run, index));
    expect(rows.find((r) => r[0] === 'N3')!.slice(3, 5)).toEqual(['0.475', '-0.1125']);
  });

  it('writes reactions in kN, leaving free directions empty', () => {
    expect(parse(reactionsCsv(run, index))).toEqual([
      ['node', 'support', 'rx_kN', 'ry_kN'],
      ['N1', 'pin', '-10', '-7.5'],
      ['N2', 'rollerY', '', '7.5'],
    ]);
  });
});
