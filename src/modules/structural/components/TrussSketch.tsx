/**
 * Static line drawing of a truss model (geometry, supports, applied loads)
 * for thumbnails and the homepage. Presentation only: it shows inputs, never
 * analysis results.
 */
import type { TrussModel } from '../models/truss';
import { supportType } from '../editor/editorState';

interface Props {
  model: TrussModel;
  title: string;
  className?: string;
  /** Show node numbers. */
  labels?: boolean;
  /** Text for a dimension line under the span. */
  spanLabel?: string;
}

export function TrussSketch({ model, title, className, labels = false, spanLabel }: Props) {
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const margin = span * 0.09;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin * (spanLabel ? 1.9 : 1.2);
  const maxY = Math.max(...ys) + margin * (model.loads.length ? 1.8 : 1);
  const w = maxX - minX;
  const h = maxY - minY;
  // SVG is y-down; flip world y so the drawing reads y-up.
  const X = (x: number) => x - minX;
  const Y = (y: number) => maxY - y;
  const unit = Math.max(w, h) / 100; // 1% of the larger dimension, for stroke and glyph sizes
  const node = new Map(model.nodes.map((n) => [n.id, n]));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        {model.members.map((m) => {
          const a = node.get(m.nodeI);
          const b = node.get(m.nodeJ);
          if (!a || !b) return null;
          return <line key={m.id} x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} strokeWidth={unit * 0.7} />;
        })}
      </g>

      {model.supports.map((s) => {
        const n = node.get(s.nodeId);
        const type = supportType(s);
        if (!n || !type) return null;
        const sz = unit * 3.2;
        const roller = type !== 'pin';
        // x-rollers bear against a wall on the left: rotate the glyph by 90°.
        return (
          <g
            key={s.nodeId}
            transform={`translate(${X(n.x)} ${Y(n.y)}) rotate(${type === 'rollerX' ? 90 : 0})`}
            className="text-muted"
            stroke="currentColor"
            fill="none"
            strokeWidth={unit * 0.5}
          >
            <path d={`M0 0 l${-sz} ${sz * (roller ? 1.3 : 1.5)} h${2 * sz} Z`} />
            {roller && (
              <>
                <circle cx={-sz * 0.55} cy={sz * 1.65} r={sz * 0.32} />
                <circle cx={sz * 0.55} cy={sz * 1.65} r={sz * 0.32} />
              </>
            )}
            <path d={`M${-sz * 1.6} ${sz * (roller ? 2 : 1.5)} h${sz * 3.2}`} />
          </g>
        );
      })}

      {model.loads.map((l) => {
        const n = node.get(l.nodeId);
        const mag = Math.hypot(l.fx, l.fy);
        if (!n || mag === 0) return null;
        // Screen direction of the force (y flipped); the arrow points at the node.
        const dx = l.fx / mag;
        const dy = -l.fy / mag;
        const len = margin * 1.3;
        const gap = unit * 1.5;
        const head = unit * 2;
        const tip = { x: X(n.x) - dx * gap, y: Y(n.y) - dy * gap };
        const tail = { x: tip.x - dx * len, y: tip.y - dy * len };
        return (
          <g key={l.nodeId} className="text-accent" stroke="currentColor" strokeWidth={unit * 0.55} fill="none">
            <path d={`M${tail.x} ${tail.y} L${tip.x} ${tip.y}`} />
            <path
              d={`M${tip.x - dx * head - dy * head * 0.6} ${tip.y - dy * head + dx * head * 0.6} L${tip.x} ${tip.y} L${tip.x - dx * head + dy * head * 0.6} ${tip.y - dy * head - dx * head * 0.6}`}
            />
          </g>
        );
      })}

      <g fill="var(--color-bg)" stroke="currentColor" strokeWidth={unit * 0.5}>
        {model.nodes.map((n) => (
          <circle key={n.id} cx={X(n.x)} cy={Y(n.y)} r={unit * 1.1} />
        ))}
      </g>

      {labels && (
        <g className="text-faint" fill="currentColor" fontFamily="var(--font-mono)" fontSize={unit * 2.6}>
          {model.nodes.map((n, i) => (
            <text key={n.id} x={X(n.x) + unit * 2.4} y={Y(n.y) - unit * 1.8}>
              {i + 1}
            </text>
          ))}
        </g>
      )}

      {spanLabel && (
        <g className="text-faint" stroke="currentColor" strokeWidth={unit * 0.35}>
          <path
            d={`M${X(Math.min(...xs))} ${Y(Math.min(...ys)) + margin * 1.35} H${X(Math.max(...xs))} M${X(Math.min(...xs))} ${Y(Math.min(...ys)) + margin * 1.15} v${margin * 0.4} M${X(Math.max(...xs))} ${Y(Math.min(...ys)) + margin * 1.15} v${margin * 0.4}`}
          />
          <text
            x={X((Math.min(...xs) + Math.max(...xs)) / 2)}
            y={Y(Math.min(...ys)) + margin * 1.35 - unit * 1.2}
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontFamily="var(--font-mono)"
            fontSize={unit * 2.6}
          >
            {spanLabel}
          </text>
        </g>
      )}
    </svg>
  );
}
