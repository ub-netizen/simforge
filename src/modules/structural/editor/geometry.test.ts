import { describe, expect, it } from 'vitest';
import type { TrussModel } from '../models/truss';
import type { Viewport } from '../../../utils/viewport';
import {
  LOAD_ARROW_PX,
  distanceToSegment,
  hitTest,
  itemsInRect,
  loadArrow,
  modelBounds,
  snapPoint,
  snapValue,
  supportBox,
} from './geometry';

// 100 px/m, world origin at screen (100, 500).
const vp: Viewport = { scale: 100, originX: 100, originY: 500 };
const E = 200e9;
const A = 1e-3;

// Screen positions: N1 (100, 500), N2 (500, 500), N3 (300, 200)
const model: TrussModel = {
  nodes: [
    { id: 'N1', x: 0, y: 0 },
    { id: 'N2', x: 4, y: 0 },
    { id: 'N3', x: 2, y: 3 },
  ],
  members: [
    { id: 'M1', nodeI: 'N1', nodeJ: 'N2', E, A },
    { id: 'M2', nodeI: 'N2', nodeJ: 'N3', E, A },
    { id: 'M3', nodeI: 'N3', nodeJ: 'N1', E, A },
  ],
  supports: [
    { nodeId: 'N1', restrainX: true, restrainY: true },
    { nodeId: 'N2', restrainX: true, restrainY: false },
  ],
  loads: [{ nodeId: 'N3', fx: 0, fy: -10e3 }],
};

describe('hitTest', () => {
  it('finds nodes within the hit radius', () => {
    expect(hitTest(model, vp, { x: 303, y: 204 })).toEqual({ kind: 'node', id: 'N3' });
    expect(hitTest(model, vp, { x: 320, y: 200 })).toBeNull();
  });

  it('finds members near their centre line', () => {
    expect(hitTest(model, vp, { x: 300, y: 503 })).toEqual({ kind: 'member', id: 'M1' });
    expect(hitTest(model, vp, { x: 300, y: 515 })).toBeNull();
  });

  it('prefers nodes over members at a joint', () => {
    expect(hitTest(model, vp, { x: 104, y: 500 })).toEqual({ kind: 'node', id: 'N1' });
  });

  it('finds load arrows (a downward load is drawn above the node)', () => {
    expect(hitTest(model, vp, { x: 300, y: 200 - 30 })).toEqual({ kind: 'load', id: 'N3' });
  });

  it('finds supports: pins below the node, x-rollers to its left', () => {
    expect(hitTest(model, vp, { x: 100, y: 515 })).toEqual({ kind: 'support', id: 'N1' });
    expect(hitTest(model, vp, { x: 485, y: 500 - 8 })).toEqual({ kind: 'support', id: 'N2' });
  });

  it('returns null on empty canvas', () => {
    expect(hitTest(model, vp, { x: 900, y: 50 })).toBeNull();
  });
});

describe('glyph geometry', () => {
  it('draws a load arrow pointing at the node from the opposite side', () => {
    const { tail, tip } = loadArrow({ x: 0, y: 0 }, { fx: 0, fy: -1 });
    expect(tail.y).toBeLessThan(tip.y); // tail above, arrow points down
    expect(tip.y - tail.y).toBeCloseTo(LOAD_ARROW_PX, 9);
    const right = loadArrow({ x: 0, y: 0 }, { fx: 1, fy: 0 });
    expect(right.tail.x).toBeLessThan(right.tip.x);
  });

  it('places the support box below or beside the node', () => {
    const below = supportBox({ x: 0, y: 0 }, { nodeId: 'a', restrainX: true, restrainY: true });
    expect(below.minY).toBeGreaterThan(0);
    const left = supportBox({ x: 0, y: 0 }, { nodeId: 'a', restrainX: true, restrainY: false });
    expect(left.maxX).toBeLessThan(0);
  });
});

describe('distanceToSegment', () => {
  it('measures to the nearest point, clamped to the ends', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(Math.SQRT2, 15);
  });
});

describe('snapping', () => {
  it('rounds to the nearest grid step without binary noise', () => {
    expect(snapValue(0.61, 0.2)).toBe(0.6);
    expect(snapValue(-1.26, 0.5)).toBe(-1.5);
    expect(snapValue(-0.1, 1)).toBe(0); // no −0
    expect(snapPoint({ x: 2.24, y: 2.26 }, 0.5)).toEqual({ x: 2, y: 2.5 });
  });
});

describe('itemsInRect', () => {
  it('selects nodes inside and members with both ends inside', () => {
    expect(itemsInRect(model, { x: -1, y: -1 }, { x: 4.5, y: 1 })).toEqual(['node:N1', 'node:N2', 'member:M1']);
    expect(itemsInRect(model, { x: 5, y: 5 }, { x: -1, y: -1 })).toHaveLength(6);
    expect(itemsInRect(model, { x: 10, y: 10 }, { x: 11, y: 11 })).toEqual([]);
  });
});

describe('modelBounds', () => {
  it('returns null for an empty model and pads degenerate extents', () => {
    expect(modelBounds({ nodes: [], members: [], supports: [], loads: [] })).toBeNull();
    expect(modelBounds(model)).toEqual({ minX: 0, maxX: 4, minY: -0.5, maxY: 3.5 });
    expect(modelBounds({ ...model, nodes: [{ id: 'a', x: 1, y: 1 }] })).toEqual({ minX: -1, maxX: 3, minY: -1, maxY: 3 });
  });
});
