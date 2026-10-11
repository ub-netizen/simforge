/**
 * Screen-space geometry for the truss editor: glyph sizes, hit testing,
 * snapping and box selection. Shared by rendering and interaction so what
 * you see is exactly what you can click.
 */
import type { NodalLoad, TrussModel, TrussSupport } from '../models/truss';
import { worldToScreen, type Bounds, type Point, type Viewport } from '../../../utils/viewport';
import { selKey, supportType, type ItemKind, type SelectionKey } from './editorState';

export const NODE_RADIUS_PX = 5;
export const NODE_HIT_PX = 10;
export const MEMBER_HIT_PX = 6;
export const LOAD_ARROW_PX = 56;
export const LOAD_GAP_PX = 7;
/** Support glyph: triangle height and half-width, ground offset. */
export const SUPPORT_H_PX = 16;
export const SUPPORT_HALF_W_PX = 11;
export const SUPPORT_DEPTH_PX = 24;

export interface Hit {
  kind: ItemKind;
  id: string;
}

/** Unit vector of the load in screen space (y down). Zero loads point down. */
export function loadDirectionScreen(load: Pick<NodalLoad, 'fx' | 'fy'>): Point {
  const mag = Math.hypot(load.fx, load.fy);
  if (mag === 0) return { x: 0, y: 1 };
  return { x: load.fx / mag, y: -load.fy / mag };
}

/** Load arrow as a screen segment: tail away from the node, tip just outside it. */
export function loadArrow(nodeScreen: Point, load: Pick<NodalLoad, 'fx' | 'fy'>): { tail: Point; tip: Point } {
  const d = loadDirectionScreen(load);
  return {
    tail: { x: nodeScreen.x - d.x * (LOAD_ARROW_PX + LOAD_GAP_PX), y: nodeScreen.y - d.y * (LOAD_ARROW_PX + LOAD_GAP_PX) },
    tip: { x: nodeScreen.x - d.x * LOAD_GAP_PX, y: nodeScreen.y - d.y * LOAD_GAP_PX },
  };
}

/**
 * Rotation of the support glyph in degrees (SVG, clockwise). Pins and y-rollers
 * sit below the node; x-rollers sit to its left, against a vertical wall.
 */
export function supportRotation(s: TrussSupport): number {
  return supportType(s) === 'rollerX' ? 90 : 0;
}

/** Screen-space bounding box of a support glyph. */
export function supportBox(nodeScreen: Point, s: TrussSupport): Bounds {
  const { x, y } = nodeScreen;
  const w = SUPPORT_HALF_W_PX + 4;
  return supportRotation(s) === 90
    ? { minX: x - SUPPORT_DEPTH_PX, maxX: x - NODE_RADIUS_PX, minY: y - w, maxY: y + w }
    : { minX: x - w, maxX: x + w, minY: y + NODE_RADIUS_PX, maxY: y + SUPPORT_DEPTH_PX };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Topmost item under screen point `p`. Priority: nodes, then loads, then
 * supports, then members, matching the drawing order.
 */
export function hitTest(model: TrussModel, vp: Viewport, p: Point): Hit | null {
  const screen = new Map(model.nodes.map((n) => [n.id, worldToScreen(vp, n)]));

  let best: Hit | null = null;
  let bestDist = NODE_HIT_PX;
  for (const n of model.nodes) {
    const d = Math.hypot(screen.get(n.id)!.x - p.x, screen.get(n.id)!.y - p.y);
    if (d <= bestDist) {
      best = { kind: 'node', id: n.id };
      bestDist = d;
    }
  }
  if (best) return best;

  for (const l of model.loads) {
    const s = screen.get(l.nodeId);
    if (!s) continue;
    const { tail, tip } = loadArrow(s, l);
    if (distanceToSegment(p, tail, tip) <= MEMBER_HIT_PX) return { kind: 'load', id: l.nodeId };
  }

  for (const sp of model.supports) {
    const s = screen.get(sp.nodeId);
    if (!s) continue;
    const b = supportBox(s, sp);
    if (p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY) return { kind: 'support', id: sp.nodeId };
  }

  bestDist = MEMBER_HIT_PX;
  for (const m of model.members) {
    const a = screen.get(m.nodeI);
    const b = screen.get(m.nodeJ);
    if (!a || !b) continue;
    const d = distanceToSegment(p, a, b);
    if (d <= bestDist) {
      best = { kind: 'member', id: m.id };
      bestDist = d;
    }
  }
  return best;
}

/** Round to the nearest multiple of `step`, without binary noise (e.g. 3 × 0.2 → 0.6). */
export function snapValue(v: number, step: number): number {
  const snapped = Math.round(v / step) * step;
  return snapped === 0 ? 0 : Number(snapped.toPrecision(12));
}

export function snapPoint(p: Point, step: number): Point {
  return { x: snapValue(p.x, step), y: snapValue(p.y, step) };
}

/** Window selection: nodes inside the world rectangle, and members with both ends inside. */
export function itemsInRect(model: TrussModel, a: Point, b: Point): SelectionKey[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const inside = new Set(
    model.nodes.filter((n) => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY).map((n) => n.id),
  );
  return [
    ...[...inside].map((id) => selKey('node', id)),
    ...model.members.filter((m) => inside.has(m.nodeI) && inside.has(m.nodeJ)).map((m) => selKey('member', m.id)),
  ];
}

/** World bounds of all nodes, or null for an empty model. Degenerate extents are padded. */
export function modelBounds(model: TrussModel, minSpan = 4): Bounds | null {
  if (model.nodes.length === 0) return null;
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const padX = Math.max(0, minSpan - (b.maxX - b.minX)) / 2;
  const padY = Math.max(0, minSpan - (b.maxY - b.minY)) / 2;
  return { minX: b.minX - padX, maxX: b.maxX + padX, minY: b.minY - padY, maxY: b.maxY + padY };
}
