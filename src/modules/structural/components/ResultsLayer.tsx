/**
 * SVG layers that draw analysis results on the editor canvas (screen
 * coordinates). Values come straight from the solver output; nothing here
 * computes engineering quantities beyond unit conversion.
 */
import { worldToScreen, type Point, type Viewport } from '../../../utils/viewport';
import { formatNumber } from '../../../utils/units';
import type { TrussModel } from '../models/truss';
import { SUPPORT_DEPTH_PX } from '../editor/geometry';
import type { AnalysisRun, ResultIndex } from '../results/analysisRun';
import {
  COLORS,
  denoise,
  forceColor,
  forceWidth,
  modelExtent,
  utilization,
  utilizationColor,
  yieldFactorOfSafety,
  type ResultsDisplay,
} from '../results/resultsView';

export interface CanvasResults {
  run: AnalysisRun;
  index: ResultIndex;
  display: ResultsDisplay;
  /** Which mechanism mode to draw for an unstable model. */
  modeIndex: number;
}

/** Effective deformed-shape magnification, or null when there is nothing to draw. */
export function deformScale(r: CanvasResults): number | null {
  return r.index.autoScale === null ? null : r.index.autoScale * r.display.deformMultiplier;
}

function displaced(model: TrussModel, vp: Viewport, offsets: ReadonlyMap<string, { ux: number; uy: number }>, scale: number) {
  return new Map(
    model.nodes.map((n) => {
      const d = offsets.get(n.id);
      return [n.id, worldToScreen(vp, { x: n.x + scale * (d?.ux ?? 0), y: n.y + scale * (d?.uy ?? 0) })];
    }),
  );
}

export function DeformedShape({ model, vp, results }: { model: TrussModel; vp: Viewport; results: CanvasResults }) {
  const scale = deformScale(results);
  if (scale === null || !results.display.showDeformed) return null;
  const pos = displaced(model, vp, results.index.displacements, scale);
  return (
    <g stroke="var(--color-deformed)" fill="var(--color-deformed)">
      {model.members.map((m) => {
        const a = pos.get(m.nodeI)!;
        const b = pos.get(m.nodeJ)!;
        return <line key={m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1.5} strokeOpacity={0.9} />;
      })}
      {model.nodes.map((n) => {
        const p = pos.get(n.id)!;
        return <circle key={n.id} cx={p.x} cy={p.y} r={2.5} stroke="none" />;
      })}
    </g>
  );
}

const REACTION_LEN_PX = 40;
const REACTION_GAP_PX = SUPPORT_DEPTH_PX + 4;

export function ReactionArrows({ model, vp, results }: { model: TrussModel; vp: Viewport; results: CanvasResults }) {
  if (!results.display.showReactions || results.index.status !== 'solved') return null;
  const { forceScale } = results.index;
  const arrows: { key: string; at: Point; dir: Point; value: number }[] = [];
  for (const r of results.index.reactions.values()) {
    const n = model.nodes.find((x) => x.id === r.nodeId);
    if (!n) continue;
    const at = worldToScreen(vp, n);
    const rx = denoise(r.rx, forceScale);
    const ry = denoise(r.ry, forceScale);
    // Screen direction of the force; y is flipped.
    if (rx !== 0) arrows.push({ key: `${r.nodeId}x`, at, dir: { x: Math.sign(rx), y: 0 }, value: Math.abs(rx) });
    if (ry !== 0) arrows.push({ key: `${r.nodeId}y`, at, dir: { x: 0, y: -Math.sign(ry) }, value: Math.abs(ry) });
  }
  return (
    <g stroke="var(--color-reaction)" fill="var(--color-reaction)">
      {arrows.map(({ key, at, dir, value }) => {
        // The arrow points along the reaction, ending just beyond the support glyph.
        const tip = { x: at.x - dir.x * REACTION_GAP_PX, y: at.y - dir.y * REACTION_GAP_PX };
        const tail = { x: tip.x - dir.x * REACTION_LEN_PX, y: tip.y - dir.y * REACTION_LEN_PX };
        const h = 7;
        return (
          <g key={key}>
            <line x1={tail.x} y1={tail.y} x2={tip.x - dir.x * h} y2={tip.y - dir.y * h} strokeWidth={2} />
            <path
              d={`M${tip.x} ${tip.y} L${tip.x - dir.x * h - dir.y * 4} ${tip.y - dir.y * h + dir.x * 4} L${tip.x - dir.x * h + dir.y * 4} ${tip.y - dir.y * h - dir.x * 4} Z`}
              stroke="none"
            />
            <text
              x={tail.x - dir.x * 6 + (dir.y !== 0 ? 6 : 0)}
              y={tail.y - dir.y * 6 + (dir.x !== 0 ? -6 : 3.5)}
              textAnchor={dir.x > 0 ? 'end' : dir.x < 0 ? 'start' : 'start'}
              stroke="var(--color-bg)"
              strokeWidth={3}
              paintOrder="stroke"
              fontFamily="var(--font-mono)"
              fontSize={10.5}
            >
              {formatNumber(value / 1e3)} kN
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function MemberValueLabels({ model, vp, results }: { model: TrussModel; vp: Viewport; results: CanvasResults }) {
  if (!results.display.showValues || results.index.status !== 'solved') return null;
  const byUtil = results.display.colorBy === 'utilization';
  return (
    <g fontFamily="var(--font-mono)" fontSize={10.5} textAnchor="middle" stroke="var(--color-bg)" strokeWidth={3} paintOrder="stroke">
      {model.members.map((m) => {
        const r = results.index.members.get(m.id);
        const a = model.nodes.find((n) => n.id === m.nodeI);
        const b = model.nodes.find((n) => n.id === m.nodeJ);
        if (!r || !a || !b) return null;
        const pa = worldToScreen(vp, a);
        const pb = worldToScreen(vp, b);
        const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (len < 40) return null; // too short to label legibly
        const nx = -(pb.y - pa.y) / len;
        const ny = (pb.x - pa.x) / len;
        let text: string;
        let fill: string;
        if (byUtil) {
          const fos = yieldFactorOfSafety(m, r);
          text = fos === null ? 'no σy' : fos === Infinity ? 'FoS ∞' : `FoS ${formatNumber(fos, 3)}`;
          fill = fos !== null && fos < 1 ? COLORS.fail : 'var(--color-fg)';
        } else if (r.state === 'zero') {
          text = '0';
          fill = 'var(--color-faint)';
        } else {
          text = `${formatNumber(Math.abs(r.axialForce) / 1e3, 3)} kN ${r.state === 'tension' ? 'T' : 'C'}`;
          fill = r.state === 'tension' ? COLORS.tension : COLORS.compression;
        }
        // Clear the line: push the label out by half its width (steep members) or half its height (flat ones).
        const halfWidth = (text.length * 6.3) / 2;
        const d = 6 + Math.abs(nx) * halfWidth + Math.abs(ny) * 5;
        return (
          <text key={m.id} x={(pa.x + pb.x) / 2 + nx * d} y={(pa.y + pb.y) / 2 + ny * d + 3.5} fill={fill}>
            {text}
          </text>
        );
      })}
    </g>
  );
}

/** Mechanism mode drawn as a dashed displaced shape with motion arrows at the moving nodes. */
export function MechanismOverlay({ model, vp, results }: { model: TrussModel; vp: Viewport; results: CanvasResults }) {
  const mode = results.index.mechanismModes[results.modeIndex];
  if (!mode) return null;
  const extent = modelExtent(model) || 1;
  const scale = 0.15 * extent; // modes are normalised to a largest component of 1
  const offsets = new Map(mode.displacements.map((d) => [d.nodeId, d]));
  const pos = displaced(model, vp, offsets, scale);
  return (
    <g stroke={COLORS.compression} fill="none">
      {model.members.map((m) => {
        const a = pos.get(m.nodeI)!;
        const b = pos.get(m.nodeJ)!;
        return <line key={m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1.5} strokeDasharray="6 4" />;
      })}
      {mode.displacements.map((d) => {
        if (Math.hypot(d.ux, d.uy) < 1e-6) return null;
        const n = model.nodes.find((x) => x.id === d.nodeId);
        if (!n) return null;
        const from = worldToScreen(vp, n);
        const to = pos.get(d.nodeId)!;
        return <line key={d.nodeId} x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth={1} strokeOpacity={0.6} markerEnd="url(#mech-arrow)" />;
      })}
      <defs>
        <marker id="mech-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill={COLORS.compression} stroke="none" />
        </marker>
      </defs>
    </g>
  );
}

/** Member colour/width under the current results display, or null to use the editor style. */
export function resultMemberStyle(
  memberId: string,
  model: TrussModel,
  results: CanvasResults | null,
): { color: string; width: number; dashed: boolean } | null {
  if (!results || results.index.status !== 'solved') return null;
  const r = results.index.members.get(memberId);
  if (!r) return null;
  if (results.display.colorBy === 'utilization') {
    const m = model.members.find((x) => x.id === memberId);
    return { color: utilizationColor(m ? utilization(m, r) : null), width: 3, dashed: false };
  }
  return {
    color: forceColor(r.axialForce, results.index.maxAbsForce, r.state === 'zero'),
    width: forceWidth(r.axialForce, results.index.maxAbsForce),
    dashed: r.state === 'zero',
  };
}
