import { useEffect, useMemo, useRef, useState } from 'react';
import { Grid3x3, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { useElementSize, type Size } from '../../hooks/useElementSize';
import {
  fitBounds,
  formatLength,
  gridValues,
  niceStep,
  panBy,
  screenToWorld,
  visibleBounds,
  worldToScreen,
  zoomAt,
  type Bounds,
  type Point,
  type Viewport,
} from '../../utils/viewport';

/**
 * Generic 2D engineering viewport: world coordinates in metres (y up), an
 * adaptive grid, axes, scale bar, zoom and pan. Simulator-specific drawing
 * and editing are layered on top via `children` and the pointer callbacks.
 */

/** World region shown when there is nothing to fit. */
export const DEFAULT_VIEW: Bounds = { minX: -1, minY: -1, maxX: 11, maxY: 6 };

const ZOOM_STEP = 1.25;

export interface GridSpacing {
  major: number;
  minor: number;
}

/** Major lines at least ~110 px apart, subdivided into 4 or 5 minor cells. */
export function gridSpacing(scale: number): GridSpacing {
  const major = niceStep(scale, 110);
  const mantissa = Math.round(major / 10 ** Math.floor(Math.log10(major)));
  return { major, minor: major / (mantissa === 2 ? 4 : 5) };
}

/** Pointer event forwarded to the layer above, with screen and world positions. */
export interface CanvasPointer {
  screen: Point;
  world: Point;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  pointerId: number;
}

interface Props {
  viewport: Viewport | null;
  onViewportChange: (vp: Viewport) => void;
  /** Primary-button drags pan the view (pan tool or Space held). */
  panMode: boolean;
  showGrid: boolean;
  onToggleGrid: () => void;
  onCursorChange?: (world: Point | null) => void;
  /** Region for "Fit view"; DEFAULT_VIEW when null. */
  fitTarget?: Bounds | null;
  /** Tailwind cursor class when not panning. */
  cursorClass?: string;
  onPointerDown?: (p: CanvasPointer) => void;
  onPointerMove?: (p: CanvasPointer) => void;
  onPointerUp?: (p: CanvasPointer) => void;
  /** SVG content drawn above the grid, in screen coordinates. */
  children?: (vp: Viewport, size: Size) => React.ReactNode;
  /** HTML overlay (hints, empty states). */
  overlay?: React.ReactNode;
  /** Extra buttons appended to the view controls. */
  controls?: React.ReactNode;
  /** Changing this value fits the view to `fitTarget` (e.g. after loading a model). */
  fitKey?: number;
  /** Receives the SVG element, for image export. */
  svgRefOut?: React.RefObject<SVGSVGElement | null>;
  /** Width (px) of an overlay on the left that "Fit view" should avoid, when the canvas is wide enough. */
  fitInsetLeft?: number;
  ariaLabel: string;
}

export function EngineeringCanvas({
  viewport,
  onViewportChange,
  panMode,
  showGrid,
  onToggleGrid,
  onCursorChange,
  fitTarget,
  cursorClass = 'cursor-crosshair',
  onPointerDown,
  onPointerMove,
  onPointerUp,
  children,
  overlay,
  controls,
  fitKey = 0,
  svgRefOut,
  fitInsetLeft = 0,
  ariaLabel,
}: Props) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const hasSize = size.width > 0 && size.height > 0;

  const zoomBy = (factor: number) => {
    if (viewport) onViewportChange(zoomAt(viewport, factor, { x: size.width / 2, y: size.height / 2 }));
  };
  const fit = () => {
    if (!hasSize) return;
    // Only reserve the inset when enough width remains for the model itself.
    const inset = size.width - fitInsetLeft >= 600 ? fitInsetLeft : 0;
    onViewportChange(fitBounds(fitTarget ?? DEFAULT_VIEW, size.width, size.height, 64, inset));
  };

  // Latest values for native event listeners, so they are bound only once.
  const latest = useRef({ viewport, onViewportChange, zoomBy, fit, onToggleGrid });
  latest.current = { viewport, onViewportChange, zoomBy, fit, onToggleGrid };

  // Fit once the canvas first has a size, and whenever fitKey changes.
  useEffect(() => {
    if (hasSize && latest.current.viewport === null) latest.current.fit();
  }, [hasSize]);
  useEffect(() => {
    if (fitKey > 0) latest.current.fit();
  }, [fitKey]);

  // View shortcuts: + / − zoom, 0 fits, G toggles the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const l = latest.current;
      if (e.key === '+' || e.key === '=') l.zoomBy(ZOOM_STEP);
      else if (e.key === '-' || e.key === '_') l.zoomBy(1 / ZOOM_STEP);
      else if (e.key === '0') l.fit();
      else if (e.key === 'g' || e.key === 'G') l.onToggleGrid();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Wheel zoom needs a non-passive listener so the page does not scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const vp = latest.current.viewport;
      if (!vp) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const r = svg.getBoundingClientRect();
      latest.current.onViewportChange(zoomAt(vp, Math.exp(-delta * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top }));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const toCanvasPointer = (e: React.PointerEvent): CanvasPointer | null => {
    if (!viewport || !svgRef.current) return null;
    const r = svgRef.current.getBoundingClientRect();
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
    return {
      screen,
      world: screenToWorld(viewport, screen),
      button: e.button,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      pointerId: e.pointerId,
    };
  };

  const handleDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toCanvasPointer(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && panMode)) {
      e.preventDefault();
      panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      setPanning(true);
      return;
    }
    if (e.button === 0) onPointerDown?.(p);
  };

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toCanvasPointer(e);
    if (!p || !viewport) return;
    onCursorChange?.(p.world);
    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      onViewportChange(panBy(viewport, e.clientX - pan.x, e.clientY - pan.y));
      panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    onPointerMove?.(p);
  };

  const handleUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current?.id === e.pointerId) {
      panRef.current = null;
      setPanning(false);
      return;
    }
    const p = toCanvasPointer(e);
    if (p && e.button === 0) onPointerUp?.(p);
  };

  const grid = useMemo(() => {
    if (!viewport || !hasSize) return null;
    const spacing = gridSpacing(viewport.scale);
    const vis = visibleBounds(viewport, size.width, size.height);
    const isMajor = (v: number) => Math.abs(v / spacing.major - Math.round(v / spacing.major)) < 1e-6;
    return { spacing, xs: gridValues(vis.minX, vis.maxX, spacing.minor), ys: gridValues(vis.minY, vis.maxY, spacing.minor), isMajor };
  }, [viewport, hasSize, size.width, size.height]);

  const crisp = (v: number) => Math.round(v) + 0.5;
  const origin = viewport ? worldToScreen(viewport, { x: 0, y: 0 }) : null;
  const cursor = panning ? 'cursor-grabbing' : panMode ? 'cursor-grab' : cursorClass;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-bg">
      <svg
        ref={(el) => {
          svgRef.current = el;
          if (svgRefOut) svgRefOut.current = el;
        }}
        width={size.width}
        height={size.height}
        className={`absolute inset-0 touch-none select-none ${cursor}`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={() => onCursorChange?.(null)}
        onAuxClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label={ariaLabel}
      >
        {grid && viewport && showGrid && (
          <g shapeRendering="crispEdges">
            {grid.xs.map((x) => {
              const sx = crisp(worldToScreen(viewport, { x, y: 0 }).x);
              return (
                <line
                  key={`x${x}`}
                  x1={sx}
                  x2={sx}
                  y1={0}
                  y2={size.height}
                  stroke={grid.isMajor(x) ? 'var(--color-grid-major)' : 'var(--color-grid-minor)'}
                />
              );
            })}
            {grid.ys.map((y) => {
              const sy = crisp(worldToScreen(viewport, { x: 0, y }).y);
              return (
                <line
                  key={`y${y}`}
                  y1={sy}
                  y2={sy}
                  x1={0}
                  x2={size.width}
                  stroke={grid.isMajor(y) ? 'var(--color-grid-major)' : 'var(--color-grid-minor)'}
                />
              );
            })}
          </g>
        )}

        {origin && (
          <g shapeRendering="crispEdges" stroke="var(--color-axis)">
            <line x1={0} x2={size.width} y1={crisp(origin.y)} y2={crisp(origin.y)} />
            <line y1={0} y2={size.height} x1={crisp(origin.x)} x2={crisp(origin.x)} />
          </g>
        )}

        {origin && <OriginGlyph x={origin.x} y={origin.y} />}

        {grid && viewport && showGrid && (
          <g fill="var(--color-faint)" fontFamily="var(--font-mono)" fontSize={10} className="tabular">
            {grid.xs.filter(grid.isMajor).map((x) => (
              <text key={`lx${x}`} x={worldToScreen(viewport, { x, y: 0 }).x + 4} y={size.height - 8}>
                {formatLength(x, grid.spacing.major)}
              </text>
            ))}
            {grid.ys.filter(grid.isMajor).map((y) => (
              <text key={`ly${y}`} x={6} y={worldToScreen(viewport, { x: 0, y }).y - 4}>
                {formatLength(y, grid.spacing.major)}
              </text>
            ))}
          </g>
        )}

        {viewport && hasSize && children?.(viewport, size)}
      </svg>

      {grid && viewport && <ScaleBar length={grid.spacing.major} scale={viewport.scale} />}

      {overlay}

      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border border-line bg-panel/95 shadow-lg shadow-black/30">
        <CanvasButton label="Zoom in (+)" onClick={() => zoomBy(ZOOM_STEP)}>
          <ZoomIn className="size-4" />
        </CanvasButton>
        <CanvasButton label="Zoom out (−)" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <ZoomOut className="size-4" />
        </CanvasButton>
        <CanvasButton label="Fit view (0)" onClick={fit}>
          <Maximize className="size-4" />
        </CanvasButton>
        <CanvasButton label={showGrid ? 'Hide grid (G)' : 'Show grid (G)'} onClick={onToggleGrid} active={showGrid}>
          <Grid3x3 className="size-4" />
        </CanvasButton>
        {controls}
      </div>
    </div>
  );
}

/** True when keyboard input should go to a form field rather than the canvas. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function CanvasButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid size-8 place-items-center border-b border-line last:border-b-0 hover:bg-raised hover:text-fg ${active ? 'text-accent' : 'text-muted'}`}
    >
      {children}
    </button>
  );
}

function OriginGlyph({ x, y }: { x: number; y: number }) {
  const len = 28;
  return (
    <g fontFamily="var(--font-mono)" fontSize={10} pointerEvents="none">
      <line x1={x} y1={y} x2={x + len} y2={y} stroke="var(--color-compression)" strokeWidth={1.5} />
      <line x1={x} y1={y} x2={x} y2={y - len} stroke="var(--color-reaction)" strokeWidth={1.5} />
      <text x={x + len + 3} y={y + 3.5} fill="var(--color-compression)">
        x
      </text>
      <text x={x - 3} y={y - len - 4} fill="var(--color-reaction)">
        y
      </text>
      <circle cx={x} cy={y} r={2.5} fill="var(--color-fg)" />
    </g>
  );
}

function ScaleBar({ length, scale }: { length: number; scale: number }) {
  return (
    <div className="pointer-events-none absolute bottom-7 left-10 font-mono text-[10px] text-muted">
      <div className="mb-1 tabular">{formatLength(length, length)} m</div>
      <div className="h-1.5 border-x border-b border-muted" style={{ width: length * scale }} />
    </div>
  );
}
