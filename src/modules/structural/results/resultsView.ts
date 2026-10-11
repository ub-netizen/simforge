/**
 * Pure helpers for presenting analysis results: colour scales, factor of
 * safety, deformation scaling and noise suppression. No React here.
 */
import type { MemberResult, NodeDisplacement, TrussMember, TrussModel } from '../models/truss';

export type ColorBy = 'force' | 'utilization';

export interface ResultsDisplay {
  colorBy: ColorBy;
  showDeformed: boolean;
  /** Multiplier on the automatic deformation scale (1 = auto). */
  deformMultiplier: number;
  showReactions: boolean;
  showValues: boolean;
}

export const DEFAULT_DISPLAY: ResultsDisplay = {
  colorBy: 'force',
  showDeformed: true,
  deformMultiplier: 1,
  showReactions: true,
  showValues: true,
};

// --- Factor of safety ----------------------------------------------------------

/**
 * Factor of safety against yielding, σ_y / |σ|. Infinity for an unstressed
 * member, null when the member has no yield strength. Buckling is NOT
 * considered: for compression members this is an upper bound.
 */
export function yieldFactorOfSafety(member: Pick<TrussMember, 'yieldStrength'>, result: Pick<MemberResult, 'stress' | 'state'>): number | null {
  if (member.yieldStrength === undefined) return null;
  if (result.state === 'zero' || result.stress === 0) return Infinity;
  return member.yieldStrength / Math.abs(result.stress);
}

/** |σ| / σ_y: 0 = unstressed, 1 = at yield. Null without a yield strength. */
export function utilization(member: Pick<TrussMember, 'yieldStrength'>, result: Pick<MemberResult, 'stress' | 'state'>): number | null {
  if (member.yieldStrength === undefined) return null;
  return result.state === 'zero' ? 0 : Math.abs(result.stress) / member.yieldStrength;
}

// --- Colour scales -------------------------------------------------------------

export const COLORS = {
  neutral: '#6b7480',
  tension: '#4ea1ff',
  compression: '#ff5d5d',
  ok: '#3ecf8e',
  warn: '#f5c542',
  fail: '#ff5d5d',
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/**
 * Diverging scale for axial force: neutral grey at zero, saturating to blue
 * (tension) or red (compression) at the largest |N|. Non-zero members start
 * at 35% so small forces stay distinguishable from zero-force members.
 */
export function forceColor(N: number, maxAbs: number, isZero: boolean): string {
  if (isZero || maxAbs === 0) return COLORS.neutral;
  const t = 0.35 + 0.65 * Math.min(1, Math.abs(N) / maxAbs);
  return mix(COLORS.neutral, N > 0 ? COLORS.tension : COLORS.compression, t);
}

/** Sequential utilisation scale: green → yellow at 0.75 → red at 1 and above. Grey without data. */
export function utilizationColor(u: number | null): string {
  if (u === null) return COLORS.neutral;
  if (u <= 0.75) return mix(COLORS.ok, COLORS.warn, u / 0.75);
  return mix(COLORS.warn, COLORS.fail, (u - 0.75) / 0.25);
}

/** Stroke width in px, from 2 (zero) to 6 (largest |N|). */
export function forceWidth(N: number, maxAbs: number): number {
  return maxAbs === 0 ? 2 : 2 + 4 * Math.min(1, Math.abs(N) / maxAbs);
}

// --- Deformed shape -------------------------------------------------------------

export function modelExtent(model: TrussModel): number {
  if (model.nodes.length === 0) return 0;
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/**
 * Displacement magnification so that the largest displacement is drawn as
 * `fraction` of the structure's size, rounded to a readable 1-2-5 value.
 * Null when nothing moves.
 */
export function autoDeformScale(model: TrussModel, displacements: readonly NodeDisplacement[], fraction = 0.08): number | null {
  const maxU = Math.max(0, ...displacements.map((d) => Math.hypot(d.ux, d.uy)));
  const extent = modelExtent(model);
  if (maxU === 0 || extent === 0) return null;
  return niceRound((fraction * extent) / maxU);
}

/** Nearest of 1, 2, 5 × 10^n in log space (thresholds √2, √10, √50). */
export function niceRound(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return x;
  const mag = 10 ** Math.floor(Math.log10(x));
  const m = x / mag;
  const nice = m >= Math.sqrt(50) ? 10 : m >= Math.sqrt(10) ? 5 : m >= Math.SQRT2 ? 2 : 1;
  return Number((nice * mag).toPrecision(12));
}

// --- Display helpers ------------------------------------------------------------

/** Treat values below `rel` × scale as numerical noise and show them as exactly zero. */
export function denoise(value: number, scale: number, rel = 1e-9): number {
  return Math.abs(value) <= rel * scale ? 0 : value;
}

export function maxAbs(values: Iterable<number>): number {
  let m = 0;
  for (const v of values) m = Math.max(m, Math.abs(v));
  return m;
}
