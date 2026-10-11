import { useMemo, useRef, useState } from 'react';
import { Magnet } from 'lucide-react';
import { CanvasButton, EngineeringCanvas, type CanvasPointer } from '../../../components/canvas/EngineeringCanvas';
import { worldToScreen, type Point, type Viewport } from '../../../utils/viewport';
import { formatNumber } from '../../../utils/units';
import type { TrussModel } from '../models/truss';
import {
  DEFAULT_LOAD,
  findMemberBetween,
  makeSupport,
  nextMemberId,
  nextNodeId,
  nextSupportType,
  selKey,
  supportType,
  type EditorAction,
  type EditorState,
  type SelectionKey,
} from '../editor/editorState';
import {
  NODE_RADIUS_PX,
  SUPPORT_H_PX,
  SUPPORT_HALF_W_PX,
  hitTest,
  itemsInRect,
  loadArrow,
  modelBounds,
  snapPoint,
  supportRotation,
  type Hit,
} from '../editor/geometry';
import type { ToolId } from './tools';
import { DeformedShape, MechanismOverlay, MemberValueLabels, ReactionArrows, resultMemberStyle, type CanvasResults } from './ResultsLayer';

/** Pointer travel (px) before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 3;

interface Props {
  editor: EditorState;
  dispatch: (a: EditorAction) => void;
  tool: ToolId;
  spacePan: boolean;
  viewport: Viewport | null;
  onViewportChange: (vp: Viewport) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  snap: boolean;
  onToggleSnap: () => void;
  snapStep: number;
  showLabels: boolean;
  onCursorChange: (p: Point | null) => void;
  /** Node the member tool is drawing from (owned by the workspace, which also shows it in the hint). */
  memberStart: string | null;
  onMemberStartChange: (nodeId: string | null) => void;
  /** Results to draw, or null to show the plain editing view (no run yet, or results out of date). */
  results: CanvasResults | null;
  /** HTML overlay for result display controls and legend. */
  resultsOverlay?: React.ReactNode;
  fitKey: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** Hide selection, hover and drawing previews (used while exporting an image). */
  plain: boolean;
}

type Gesture =
  | {
      kind: 'drag';
      startScreen: Point;
      startWorld: Point;
      anchor: string;
      origins: Record<string, Point>;
      began: boolean;
    }
  | { kind: 'marquee'; startScreen: Point; startWorld: Point; additive: boolean };

export function TrussEditorCanvas({
  editor,
  dispatch,
  tool,
  spacePan,
  viewport,
  onViewportChange,
  showGrid,
  onToggleGrid,
  snap,
  onToggleSnap,
  snapStep,
  showLabels,
  onCursorChange,
  memberStart: requestedStart,
  onMemberStartChange: setMemberStart,
  results,
  resultsOverlay,
  fitKey,
  svgRef,
  plain,
}: Props) {
  const { model, selection } = editor;
  const [hover, setHover] = useState<Hit | null>(null);
  const [pointer, setPointer] = useState<CanvasPointer | null>(null);
  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const selected = useMemo(() => new Set(selection), [selection]);
  const nodeById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);
  // A chain start only counts while the member tool is active and the node still exists (e.g. after undo).
  const memberStart = tool === 'member' && requestedStart && nodeById.has(requestedStart) ? requestedStart : null;

  /** Snapped placement point; Alt disables snapping. Unsnapped values are kept to 0.1 mm. */
  const place = (p: CanvasPointer): Point => {
    if (snap && !p.altKey) return snapPoint(p.world, snapStep);
    return { x: Number(p.world.x.toFixed(4)), y: Number(p.world.y.toFixed(4)) };
  };

  const nodeAt = (pt: Point) => model.nodes.find((n) => Math.abs(n.x - pt.x) < 1e-9 && Math.abs(n.y - pt.y) < 1e-9);

  /** Nodes moved when dragging `keys`: selected nodes plus the ends of selected members. */
  const dragNodes = (keys: readonly SelectionKey[]): string[] => {
    const ids = new Set<string>();
    for (const k of keys) {
      const i = k.indexOf(':');
      const kind = k.slice(0, i);
      const id = k.slice(i + 1);
      if (kind === 'member') {
        const m = model.members.find((x) => x.id === id);
        if (m) ids.add(m.nodeI).add(m.nodeJ);
      } else ids.add(id); // node, or the node carrying a support / load
    }
    return [...ids].filter((id) => nodeById.has(id));
  };

  const startDrag = (p: CanvasPointer, anchor: string, nodeIds: string[]) => {
    const origins: Record<string, Point> = {};
    for (const id of nodeIds) {
      const n = nodeById.get(id)!;
      origins[id] = { x: n.x, y: n.y };
    }
    gesture.current = { kind: 'drag', startScreen: p.screen, startWorld: p.world, anchor, origins, began: false };
  };

  const anchorNode = (hit: Hit): string =>
    hit.kind === 'member' ? model.members.find((m) => m.id === hit.id)!.nodeI : hit.id;

  const handleDown = (p: CanvasPointer) => {
    if (!viewport) return;
    const hit = hitTest(model, viewport, p.screen);

    switch (tool) {
      case 'select':
      case 'node': {
        if (hit) {
          const k = selKey(hit.kind, hit.id);
          if (p.shiftKey) {
            dispatch({ type: 'select', keys: [k], mode: 'toggle' });
            return;
          }
          const keys = selected.has(k) ? selection : [k];
          if (!selected.has(k)) dispatch({ type: 'select', keys: [k] });
          startDrag(p, anchorNode(hit), dragNodes(keys));
          return;
        }
        if (tool === 'node') {
          const pt = place(p);
          const existing = nodeAt(pt);
          if (existing) dispatch({ type: 'select', keys: [selKey('node', existing.id)] });
          else dispatch({ type: 'addNode', node: { id: nextNodeId(model), ...pt }, select: true });
          return;
        }
        if (!p.shiftKey) dispatch({ type: 'clearSelection' });
        gesture.current = { kind: 'marquee', startScreen: p.screen, startWorld: p.world, additive: p.shiftKey };
        setMarquee({ a: p.world, b: p.world });
        return;
      }

      case 'member': {
        const actions: EditorAction[] = [];
        let target: string;
        if (hit?.kind === 'node') target = hit.id;
        else {
          const pt = place(p);
          const existing = nodeAt(pt);
          if (existing) target = existing.id;
          else {
            target = nextNodeId(model);
            actions.push({ type: 'addNode', node: { id: target, ...pt } });
          }
        }
        if (memberStart === null || memberStart === target) {
          if (actions.length) dispatch({ type: 'batch', actions: [...actions, { type: 'select', keys: [selKey('node', target)] }] });
          setMemberStart(memberStart === target ? null : target);
          return;
        }
        const existingMember = findMemberBetween(model, memberStart, target);
        if (existingMember) actions.push({ type: 'select', keys: [selKey('member', existingMember.id)] });
        else {
          const id = nextMemberId(model);
          actions.push(
            { type: 'addMember', member: { id, nodeI: memberStart, nodeJ: target, ...editor.defaults } },
            { type: 'select', keys: [selKey('member', id)] },
          );
        }
        dispatch({ type: 'batch', actions });
        setMemberStart(target);
        return;
      }

      case 'support': {
        if (!hit || (hit.kind !== 'node' && hit.kind !== 'support')) return;
        const current = model.supports.find((s) => s.nodeId === hit.id);
        const next = nextSupportType(current ? supportType(current) : null);
        dispatch({
          type: 'batch',
          actions: [
            { type: 'setSupport', nodeId: hit.id, support: next ? makeSupport(hit.id, next, current) : null },
            { type: 'select', keys: [selKey(next ? 'support' : 'node', hit.id)] },
          ],
        });
        return;
      }

      case 'load': {
        if (!hit || (hit.kind !== 'node' && hit.kind !== 'load')) return;
        const actions: EditorAction[] = [];
        if (!model.loads.some((l) => l.nodeId === hit.id)) actions.push({ type: 'setLoad', nodeId: hit.id, load: DEFAULT_LOAD });
        actions.push({ type: 'select', keys: [selKey('load', hit.id)] });
        dispatch({ type: 'batch', actions });
        return;
      }

      case 'pan':
        return;
    }
  };

  const handleMove = (p: CanvasPointer) => {
    setPointer(p);
    const g = gesture.current;
    if (!g) {
      if (viewport) setHover(hitTest(model, viewport, p.screen));
      return;
    }
    if (g.kind === 'marquee') {
      setMarquee({ a: g.startWorld, b: p.world });
      return;
    }
    if (!g.began) {
      if (Math.hypot(p.screen.x - g.startScreen.x, p.screen.y - g.startScreen.y) < DRAG_THRESHOLD_PX) return;
      g.began = true;
      dispatch({ type: 'beginGesture' });
    }
    // Snap the anchor node and move the others by the same offset, preserving their relative layout.
    const origin = g.origins[g.anchor]!;
    const raw = { x: origin.x + p.world.x - g.startWorld.x, y: origin.y + p.world.y - g.startWorld.y };
    const target = place({ ...p, world: raw });
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const positions: Record<string, Point> = {};
    for (const [id, o] of Object.entries(g.origins)) positions[id] = { x: clean(o.x + dx), y: clean(o.y + dy) };
    dispatch({ type: 'moveNodes', positions, transient: true });
  };

  const handleUp = (p: CanvasPointer) => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === 'marquee') {
      setMarquee(null);
      const moved = Math.hypot(p.screen.x - g.startScreen.x, p.screen.y - g.startScreen.y) >= DRAG_THRESHOLD_PX;
      if (moved) dispatch({ type: 'select', keys: itemsInRect(model, g.startWorld, p.world), mode: g.additive ? 'add' : 'replace' });
    }
  };

  const cursorClass = tool === 'select' ? (hover ? 'cursor-pointer' : 'cursor-default') : 'cursor-crosshair';
  const showSnapMarker = pointer && (tool === 'node' || tool === 'member') && !(hover?.kind === 'node');

  return (
    <EngineeringCanvas
      viewport={viewport}
      onViewportChange={onViewportChange}
      panMode={tool === 'pan' || spacePan}
      showGrid={showGrid}
      onToggleGrid={onToggleGrid}
      onCursorChange={(w) => {
        onCursorChange(w);
        if (!w) {
          setPointer(null);
          setHover(null);
        }
      }}
      fitTarget={modelBounds(model)}
      cursorClass={cursorClass}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      ariaLabel="Truss model editor. Use the tools to place nodes, members, supports and loads."
      controls={
        <CanvasButton label={snap ? 'Snap to grid: on (Alt to bypass)' : 'Snap to grid: off'} onClick={onToggleSnap} active={snap}>
          <Magnet className="size-4" />
        </CanvasButton>
      }
      overlay={model.nodes.length === 0 ? <EmptyHint /> : resultsOverlay}
      fitKey={fitKey}
      svgRefOut={svgRef}
      fitInsetLeft={RESULTS_OVERLAY_PX}
    >
      {(vp) => (
        <ModelLayer
          model={model}
          vp={vp}
          selected={plain ? EMPTY_SELECTION : selected}
          hover={plain ? null : hover}
          showLabels={showLabels}
          results={results}
          preview={
            plain ? null : (
              <>
                {memberStart && pointer && (
                  <MemberPreview
                    from={worldToScreen(vp, nodeById.get(memberStart)!)}
                    to={hover?.kind === 'node' ? worldToScreen(vp, nodeById.get(hover.id)!) : worldToScreen(vp, place(pointer))}
                  />
                )}
                {showSnapMarker && <SnapMarker at={worldToScreen(vp, place(pointer))} />}
                {marquee && <Marquee a={worldToScreen(vp, marquee.a)} b={worldToScreen(vp, marquee.b)} />}
              </>
            )
          }
        />
      )}
    </EngineeringCanvas>
  );
}

const clean = (v: number) => (v === 0 ? 0 : Number(v.toPrecision(12)));
const EMPTY_SELECTION: ReadonlySet<SelectionKey> = new Set();
/** Width of the floating results panel (w-64 at left-3) plus a margin, kept clear by "Fit view". */
const RESULTS_OVERLAY_PX = 280;

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-6">
      <div className="max-w-sm rounded-md border border-line bg-panel/90 px-4 py-3 text-sm text-muted backdrop-blur">
        <p className="font-medium text-fg">Start a model</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>
            <Kbd>N</Kbd> Node tool: click the grid to place joints.
          </li>
          <li>
            <Kbd>M</Kbd> Member tool: click node to node. Clicking empty space adds a node.
          </li>
          <li>
            <Kbd>S</Kbd> Support tool: click a node; click again to change type.
          </li>
          <li>
            <Kbd>F</Kbd> Load tool: click a node, then edit the load in the properties panel.
          </li>
        </ol>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-1 rounded border border-line-strong bg-raised px-1 font-mono text-[11px] text-fg">{children}</kbd>
  );
}

// ---------------------------------------------------------------------------
// Rendering (screen coordinates)
// ---------------------------------------------------------------------------

interface LayerProps {
  model: TrussModel;
  vp: Viewport;
  selected: ReadonlySet<SelectionKey>;
  hover: Hit | null;
  showLabels: boolean;
  results: CanvasResults | null;
  preview: React.ReactNode;
}

function ModelLayer({ model, vp, selected, hover, showLabels, results, preview }: LayerProps) {
  const screen = new Map(model.nodes.map((n) => [n.id, worldToScreen(vp, n)]));
  const isHover = (kind: Hit['kind'], id: string) => hover?.kind === kind && hover.id === id;
  const flaggedNodes = results?.index.flaggedNodes;
  const flaggedMembers = results?.index.flaggedMembers;
  // Force/FoS labels replace member ids while results are shown.
  const showMemberIds = showLabels && !(results?.index.status === 'solved' && results.display.showValues);

  return (
    <g pointerEvents="none">
      {/* Members */}
      {model.members.map((m) => {
        const a = screen.get(m.nodeI);
        const b = screen.get(m.nodeJ);
        if (!a || !b) return null;
        const sel = selected.has(selKey('member', m.id));
        const hov = isHover('member', m.id);
        const style = resultMemberStyle(m.id, model, results);
        const flagged = flaggedMembers?.has(m.id);
        const base = style?.width ?? 2;
        return (
          <g key={m.id}>
            {flagged && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-compression)" strokeOpacity={0.35} strokeWidth={12} strokeLinecap="round" />}
            {sel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-accent)" strokeOpacity={0.3} strokeWidth={base + 7} strokeLinecap="round" />}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={style ? style.color : sel ? 'var(--color-accent)' : hov ? 'var(--color-fg)' : 'var(--color-member)'}
              strokeWidth={hov || sel ? base + 0.5 : base}
              strokeDasharray={style?.dashed ? '5 4' : undefined}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {results && <DeformedShape model={model} vp={vp} results={results} />}
      {results && <MechanismOverlay model={model} vp={vp} results={results} />}

      {showMemberIds &&
        model.members.map((m) => {
          const a = screen.get(m.nodeI);
          const b = screen.get(m.nodeJ);
          if (!a || !b) return null;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          // Offset to the left of the member direction, so labels do not sit on the line.
          const nx = -(b.y - a.y) / len;
          const ny = (b.x - a.x) / len;
          return (
            <text
              key={`l-${m.id}`}
              x={(a.x + b.x) / 2 + nx * 10}
              y={(a.y + b.y) / 2 + ny * 10 + 3}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={10}
              fill={selected.has(selKey('member', m.id)) ? 'var(--color-accent)' : 'var(--color-faint)'}
            >
              {m.id}
            </text>
          );
        })}

      {/* Supports */}
      {model.supports.map((s) => {
        const p = screen.get(s.nodeId);
        const type = supportType(s);
        if (!p || !type) return null;
        const sel = selected.has(selKey('support', s.nodeId));
        const hov = isHover('support', s.nodeId);
        return (
          <SupportGlyph
            key={`s-${s.nodeId}`}
            at={p}
            type={type}
            rotation={supportRotation(s)}
            color={sel ? 'var(--color-accent)' : hov ? 'var(--color-fg)' : 'var(--color-muted)'}
          />
        );
      })}

      {results && <ReactionArrows model={model} vp={vp} results={results} />}

      {/* Loads */}
      {model.loads.map((l) => {
        const p = screen.get(l.nodeId);
        if (!p) return null;
        const sel = selected.has(selKey('load', l.nodeId));
        const hov = isHover('load', l.nodeId);
        const { tail, tip } = loadArrow(p, l);
        const mag = Math.hypot(l.fx, l.fy);
        const dx = (tip.x - tail.x) / Math.hypot(tip.x - tail.x, tip.y - tail.y);
        const dy = (tip.y - tail.y) / Math.hypot(tip.x - tail.x, tip.y - tail.y);
        const head = 8;
        const color = sel ? 'var(--color-fg)' : hov ? 'var(--color-accent-strong)' : 'var(--color-load)';
        return (
          <g key={`f-${l.nodeId}`} stroke={color} fill={color} strokeWidth={sel ? 2.5 : 2}>
            {sel && <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} stroke="var(--color-accent)" strokeOpacity={0.3} strokeWidth={9} />}
            <line x1={tail.x} y1={tail.y} x2={tip.x - dx * head} y2={tip.y - dy * head} strokeDasharray={mag === 0 ? '3 3' : undefined} />
            <path
              d={`M${tip.x} ${tip.y} L${tip.x - dx * head - dy * 4.5} ${tip.y - dy * head + dx * 4.5} L${tip.x - dx * head + dy * 4.5} ${tip.y - dy * head - dx * 4.5} Z`}
              stroke="none"
            />
            <text
              x={tail.x - dx * 8}
              y={tail.y - dy * 8 + 3.5}
              textAnchor={dx > 0.3 ? 'end' : dx < -0.3 ? 'start' : 'middle'}
              stroke="none"
              fontFamily="var(--font-mono)"
              fontSize={11}
            >
              {formatNumber(mag / 1e3)} kN
            </text>
          </g>
        );
      })}

      {/* Nodes */}
      {model.nodes.map((n) => {
        const p = screen.get(n.id)!;
        const sel = selected.has(selKey('node', n.id));
        const hov = isHover('node', n.id);
        return (
          <g key={n.id}>
            {flaggedNodes?.has(n.id) && <circle cx={p.x} cy={p.y} r={NODE_RADIUS_PX + 7} fill="var(--color-compression)" fillOpacity={0.3} />}
            {sel && <circle cx={p.x} cy={p.y} r={NODE_RADIUS_PX + 5} fill="var(--color-accent)" fillOpacity={0.25} />}
            <circle
              cx={p.x}
              cy={p.y}
              r={hov ? NODE_RADIUS_PX + 1 : NODE_RADIUS_PX}
              fill={sel ? 'var(--color-accent)' : 'var(--color-bg)'}
              stroke={sel ? 'var(--color-accent)' : 'var(--color-fg)'}
              strokeWidth={1.75}
            />
            {showLabels && (
              <text x={p.x + 8} y={p.y - 8} fontFamily="var(--font-mono)" fontSize={10.5} fill={sel ? 'var(--color-accent)' : 'var(--color-muted)'}>
                {n.id}
              </text>
            )}
          </g>
        );
      })}

      {results && <MemberValueLabels model={model} vp={vp} results={results} />}

      {preview}
    </g>
  );
}

function SupportGlyph({ at, type, rotation, color }: { at: Point; type: 'pin' | 'rollerY' | 'rollerX'; rotation: number; color: string }) {
  const h = SUPPORT_H_PX;
  const w = SUPPORT_HALF_W_PX;
  const top = NODE_RADIUS_PX - 1;
  const roller = type !== 'pin';
  const ground = roller ? top + h + 8 : top + h + 1;
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${rotation})`} stroke={color} fill="none" strokeWidth={1.5}>
      <path d={`M0 ${top} L${-w} ${top + h} H${w} Z`} fill="var(--color-bg)" />
      {roller && (
        <>
          <circle cx={-w / 2} cy={top + h + 3.5} r={3} />
          <circle cx={w / 2} cy={top + h + 3.5} r={3} />
        </>
      )}
      <path d={`M${-w - 4} ${ground} H${w + 4}`} />
      {[-w, -w / 2, 0, w / 2, w].map((x) => (
        <path key={x} d={`M${x} ${ground} l-4 5`} strokeWidth={1} />
      ))}
    </g>
  );
}

function MemberPreview({ from, to }: { from: Point; to: Point }) {
  return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="6 4" />;
}

function SnapMarker({ at }: { at: Point }) {
  return (
    <g stroke="var(--color-accent)" strokeWidth={1}>
      <circle cx={at.x} cy={at.y} r={4} fill="none" />
      <path d={`M${at.x - 9} ${at.y} h5 M${at.x + 4} ${at.y} h5 M${at.x} ${at.y - 9} v5 M${at.x} ${at.y + 4} v5`} />
    </g>
  );
}

function Marquee({ a, b }: { a: Point; b: Point }) {
  return (
    <rect
      x={Math.min(a.x, b.x)}
      y={Math.min(a.y, b.y)}
      width={Math.abs(b.x - a.x)}
      height={Math.abs(b.y - a.y)}
      fill="var(--color-accent)"
      fillOpacity={0.08}
      stroke="var(--color-accent)"
      strokeDasharray="4 3"
    />
  );
}
