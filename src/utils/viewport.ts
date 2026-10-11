/**
 * 2D viewport transform between world coordinates (metres, y-up) and
 * screen coordinates (CSS pixels, y-down).
 *
 *   sx = originX + x * scale
 *   sy = originY - y * scale
 *
 * `scale` is pixels per metre; (originX, originY) is where the world origin
 * lands on screen. Kept free of React so it can be unit-tested directly.
 */

export interface Viewport {
  /** Pixels per metre. */
  scale: number;
  /** Screen x of the world origin, in px. */
  originX: number;
  /** Screen y of the world origin, in px. */
  originY: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_SCALE = 2; // px/m: about 500 m across a 1000 px canvas
export const MAX_SCALE = 5000; // px/m: about 0.2 m across a 1000 px canvas

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: vp.originX + p.x * vp.scale, y: vp.originY - p.y * vp.scale };
}

export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.originX) / vp.scale, y: (vp.originY - p.y) / vp.scale };
}

/** Zoom by `factor` while keeping the world point under `anchor` (screen px) fixed. */
export function zoomAt(vp: Viewport, factor: number, anchor: Point): Viewport {
  const scale = clampScale(vp.scale * factor);
  const world = screenToWorld(vp, anchor);
  return {
    scale,
    originX: anchor.x - world.x * scale,
    originY: anchor.y + world.y * scale,
  };
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, originX: vp.originX + dx, originY: vp.originY + dy };
}

/**
 * Fit world `bounds` into a `width` × `height` screen area with `padding` px
 * on each side, plus `insetLeft` px kept clear on the left (for a side panel).
 */
export function fitBounds(bounds: Bounds, width: number, height: number, padding = 48, insetLeft = 0): Viewport {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const availW = Math.max(width - insetLeft - 2 * padding, 1);
  const availH = Math.max(height - 2 * padding, 1);
  const scale = clampScale(Math.min(availW / spanX, availH / spanY));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    originX: insetLeft + (width - insetLeft) / 2 - cx * scale,
    originY: height / 2 + cy * scale,
  };
}

/** World-space rectangle currently visible on a `width` × `height` screen. */
export function visibleBounds(vp: Viewport, width: number, height: number): Bounds {
  const topLeft = screenToWorld(vp, { x: 0, y: 0 });
  const bottomRight = screenToWorld(vp, { x: width, y: height });
  return { minX: topLeft.x, maxX: bottomRight.x, minY: bottomRight.y, maxY: topLeft.y };
}

/**
 * Smallest "nice" length (1, 2 or 5 × 10^n metres) whose on-screen size is at
 * least `minPixels`. Used for minor grid spacing and the scale bar.
 */
export function niceStep(scale: number, minPixels: number): number {
  const raw = minPixels / scale;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    const step = m * magnitude;
    if (step >= raw * (1 - 1e-12)) return step;
  }
  return 10 * magnitude;
}

/** Multiples of `step` that fall inside [min, max]. */
export function gridValues(min: number, max: number, step: number): number[] {
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  const values: number[] = [];
  for (let i = first; i <= last; i++) values.push(i * step);
  return values;
}

/** Format a length in metres with precision appropriate to `step`. */
export function formatLength(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const fixed = value.toFixed(decimals);
  return fixed === '-0' || /^-0\.0*$/.test(fixed) ? fixed.slice(1) : fixed;
}
