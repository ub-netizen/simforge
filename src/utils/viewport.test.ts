import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  fitBounds,
  formatLength,
  gridValues,
  niceStep,
  panBy,
  screenToWorld,
  visibleBounds,
  worldToScreen,
  zoomAt,
  type Viewport,
} from './viewport';

const vp: Viewport = { scale: 50, originX: 100, originY: 400 };

describe('world/screen transforms', () => {
  it('maps the world origin to the viewport origin', () => {
    expect(worldToScreen(vp, { x: 0, y: 0 })).toEqual({ x: 100, y: 400 });
  });

  it('uses y-up world coordinates', () => {
    const p = worldToScreen(vp, { x: 2, y: 3 });
    expect(p).toEqual({ x: 200, y: 250 });
  });

  it('round-trips screen -> world -> screen', () => {
    for (const s of [
      { x: 0, y: 0 },
      { x: 333.3, y: -12.5 },
      { x: 1e4, y: 7 },
    ]) {
      const back = worldToScreen(vp, screenToWorld(vp, s));
      expect(back.x).toBeCloseTo(s.x, 9);
      expect(back.y).toBeCloseTo(s.y, 9);
    }
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const anchor = { x: 321, y: 123 };
    const before = screenToWorld(vp, anchor);
    const zoomed = zoomAt(vp, 1.7, anchor);
    const after = screenToWorld(zoomed, anchor);
    expect(zoomed.scale).toBeCloseTo(85, 12);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('clamps the scale to the allowed range', () => {
    expect(zoomAt(vp, 1e9, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt(vp, 1e-9, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });
});

describe('panBy', () => {
  it('translates the origin without changing scale', () => {
    expect(panBy(vp, 10, -20)).toEqual({ scale: 50, originX: 110, originY: 380 });
  });
});

describe('fitBounds', () => {
  it('centres the bounds and fits the limiting dimension', () => {
    const fitted = fitBounds({ minX: 0, minY: 0, maxX: 10, maxY: 2 }, 1000, 600, 50);
    // Width limits: (1000 - 100) / 10 = 90 px/m; height would allow 250 px/m.
    expect(fitted.scale).toBeCloseTo(90, 12);
    const centre = worldToScreen(fitted, { x: 5, y: 1 });
    expect(centre.x).toBeCloseTo(500, 9);
    expect(centre.y).toBeCloseTo(300, 9);
  });

  it('keeps a left inset clear and centres in the remaining width', () => {
    const fitted = fitBounds({ minX: 0, minY: 0, maxX: 10, maxY: 2 }, 1000, 600, 50, 300);
    // (1000 − 300 − 100) / 10 = 60 px/m
    expect(fitted.scale).toBeCloseTo(60, 12);
    expect(worldToScreen(fitted, { x: 0, y: 0 }).x).toBeCloseTo(350, 9);
    expect(worldToScreen(fitted, { x: 10, y: 0 }).x).toBeCloseTo(950, 9);
  });

  it('is consistent with visibleBounds', () => {
    const b = { minX: -3, minY: -1, maxX: 7, maxY: 4 };
    const fitted = fitBounds(b, 800, 500, 0);
    const vis = visibleBounds(fitted, 800, 500);
    expect(vis.minX).toBeLessThanOrEqual(b.minX + 1e-9);
    expect(vis.maxX).toBeGreaterThanOrEqual(b.maxX - 1e-9);
    expect(vis.minY).toBeLessThanOrEqual(b.minY + 1e-9);
    expect(vis.maxY).toBeGreaterThanOrEqual(b.maxY - 1e-9);
  });
});

describe('niceStep', () => {
  it('returns 1/2/5 x 10^n steps at least minPixels wide', () => {
    expect(niceStep(50, 40)).toBe(1); // 0.8 m -> 1 m
    expect(niceStep(100, 40)).toBe(0.5); // 0.4 m -> 0.5 m
    expect(niceStep(10, 40)).toBe(5); // 4 m -> 5 m
    expect(niceStep(1, 40)).toBe(50); // 40 m -> 50 m
    expect(niceStep(40, 40)).toBe(1); // exactly 1 m
  });

  it('always produces a step at least minPixels on screen', () => {
    for (let scale = MIN_SCALE; scale <= MAX_SCALE; scale *= 1.37) {
      const step = niceStep(scale, 32);
      expect(step * scale).toBeGreaterThanOrEqual(32 * (1 - 1e-9));
      expect(step * scale).toBeLessThan(32 * 5 + 1e-9);
    }
  });
});

describe('gridValues', () => {
  it('lists multiples of the step inside the range', () => {
    expect(gridValues(-1.2, 3.1, 1)).toEqual([-1, 0, 1, 2, 3]);
    expect(gridValues(0.1, 0.9, 1)).toEqual([]);
  });
});

describe('formatLength', () => {
  it('matches decimals to the step size', () => {
    expect(formatLength(2, 1)).toBe('2');
    expect(formatLength(2.5, 0.5)).toBe('2.5');
    expect(formatLength(0.25, 0.05)).toBe('0.25');
    expect(formatLength(-0.0001, 0.1)).toBe('0.0');
  });
});
