import { describe, expect, it } from 'vitest';
import type { TrussModel } from '../models/truss';
import {
  COLORS,
  autoDeformScale,
  denoise,
  forceColor,
  forceWidth,
  mix,
  niceRound,
  utilization,
  utilizationColor,
  yieldFactorOfSafety,
} from './resultsView';

describe('factor of safety', () => {
  const steel = { yieldStrength: 250e6 };

  it('is yield strength over absolute stress', () => {
    expect(yieldFactorOfSafety(steel, { stress: 100e6, state: 'tension' })).toBe(2.5);
    expect(yieldFactorOfSafety(steel, { stress: -125e6, state: 'compression' })).toBe(2);
  });

  it('is infinite for unstressed members and null without a yield strength', () => {
    expect(yieldFactorOfSafety(steel, { stress: 1e-12, state: 'zero' })).toBe(Infinity);
    expect(yieldFactorOfSafety({}, { stress: 100e6, state: 'tension' })).toBeNull();
  });

  it('utilisation is the reciprocal', () => {
    expect(utilization(steel, { stress: -200e6, state: 'compression' })).toBe(0.8);
    expect(utilization(steel, { stress: 1e-12, state: 'zero' })).toBe(0);
    expect(utilization({}, { stress: 1, state: 'tension' })).toBeNull();
  });
});

describe('colour scales', () => {
  it('mixes colours linearly and clamps', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#102030', '#ffffff', -1)).toBe('#102030');
    expect(mix('#102030', '#ffffff', 2)).toBe('#ffffff');
  });

  it('maps force sign to hue and magnitude to saturation', () => {
    expect(forceColor(10, 10, false)).toBe(COLORS.tension);
    expect(forceColor(-10, 10, false)).toBe(COLORS.compression);
    expect(forceColor(0, 10, true)).toBe(COLORS.neutral);
    expect(forceColor(1, 10, false)).not.toBe(forceColor(10, 10, false));
    expect(forceWidth(10, 10)).toBe(6);
    expect(forceWidth(0, 10)).toBe(2);
  });

  it('runs green → yellow → red for utilisation', () => {
    expect(utilizationColor(0)).toBe(COLORS.ok);
    expect(utilizationColor(0.75)).toBe(COLORS.warn);
    expect(utilizationColor(1)).toBe(COLORS.fail);
    expect(utilizationColor(3)).toBe(COLORS.fail);
    expect(utilizationColor(null)).toBe(COLORS.neutral);
  });
});

describe('deformation scale', () => {
  const model: TrussModel = {
    nodes: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 0 },
    ],
    members: [],
    supports: [],
    loads: [],
  };

  it('draws the largest displacement at about 8% of the structure size', () => {
    // 0.8 m / 2 mm = 400, nearest 1-2-5 value is 500
    expect(autoDeformScale(model, [{ nodeId: 'b', ux: 0, uy: -0.002 }])).toBe(500);
    // 0.8 m / 3 mm = 266.7, nearest is 200
    expect(autoDeformScale(model, [{ nodeId: 'b', ux: 0.003, uy: 0 }])).toBe(200);
  });

  it('is null when nothing moves', () => {
    expect(autoDeformScale(model, [{ nodeId: 'b', ux: 0, uy: 0 }])).toBeNull();
  });

  it('rounds to the nearest 1-2-5 value', () => {
    expect([1, 1.3, 1.9, 3, 4.99, 7, 9.9, 0.034, 1234].map(niceRound)).toEqual([1, 1, 2, 2, 5, 5, 10, 0.05, 1000]);
  });
});

describe('denoise', () => {
  it('zeros values far below the problem scale only', () => {
    expect(denoise(3e-12, 1e4)).toBe(0);
    expect(denoise(-2.5, 1e4)).toBe(-2.5);
  });
});
