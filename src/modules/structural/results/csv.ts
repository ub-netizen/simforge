/**
 * CSV export of analysis results (RFC 4180: comma-separated, CRLF line ends,
 * quoted where needed). Values use the display units named in each header
 * and keep full floating-point precision; numerical noise far below the
 * problem's scale is written as 0, as in the on-screen tables.
 */
import { supportType } from '../editor/editorState';
import type { AnalysisRun, ResultIndex } from './analysisRun';
import { denoise, yieldFactorOfSafety } from './resultsView';

type Cell = string | number | null;

export function csvCell(v: Cell): string {
  if (v === null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : v > 0 ? 'inf' : v < 0 ? '-inf' : 'nan';
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(header: readonly string[], rows: readonly Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** kN, MPa etc. from SI, with 12 significant digits so values like 12.5 stay exact. */
const per = (value: number, unit: number) => Number((value / unit).toPrecision(12));

export function memberForcesCsv({ model }: AnalysisRun, index: ResultIndex): string {
  const rows = model.members.map((m) => {
    const r = index.members.get(m.id)!;
    const zero = r.state === 'zero';
    const fos = yieldFactorOfSafety(m, r);
    return [
      m.id,
      m.nodeI,
      m.nodeJ,
      per(r.length, 1),
      per(denoise(r.axialForce, index.forceScale), 1e3),
      r.state,
      zero ? 0 : per(r.stress, 1e6),
      zero ? 0 : Number(r.strain.toPrecision(12)),
      zero ? 0 : per(r.elongation, 1e-3),
      per(m.E, 1e9),
      per(m.A, 1e-6),
      m.yieldStrength === undefined ? null : per(m.yieldStrength, 1e6),
      fos === null ? null : fos === Infinity ? Infinity : Number(fos.toPrecision(12)),
    ];
  });
  return toCsv(
    [
      'member',
      'node_i',
      'node_j',
      'length_m',
      'axial_force_kN',
      'state',
      'stress_MPa',
      'strain',
      'elongation_mm',
      'E_GPa',
      'A_mm2',
      'yield_strength_MPa',
      'fos_yield',
    ],
    rows,
  );
}

export function displacementsCsv({ model }: AnalysisRun, index: ResultIndex): string {
  const rows = model.nodes.map((n) => {
    const d = index.displacements.get(n.id)!;
    const ux = denoise(d.ux, index.maxDisplacement);
    const uy = denoise(d.uy, index.maxDisplacement);
    return [n.id, n.x, n.y, per(ux, 1e-3), per(uy, 1e-3), per(Math.hypot(ux, uy), 1e-3)];
  });
  return toCsv(['node', 'x_m', 'y_m', 'ux_mm', 'uy_mm', 'u_mm'], rows);
}

export function reactionsCsv({ model }: AnalysisRun, index: ResultIndex): string {
  const rows = model.supports.map((s) => {
    const r = index.reactions.get(s.nodeId)!;
    return [
      s.nodeId,
      supportType(s) ?? 'none',
      s.restrainX ? per(denoise(r.rx, index.forceScale), 1e3) : null,
      s.restrainY ? per(denoise(r.ry, index.forceScale), 1e3) : null,
    ];
  });
  return toCsv(['node', 'support', 'rx_kN', 'ry_kN'], rows);
}
