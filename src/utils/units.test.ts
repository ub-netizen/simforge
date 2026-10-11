import { describe, expect, it } from 'vitest';
import { formatNumber, formatQuantity, fromSI, toSI } from './units';

describe('unit conversion', () => {
  it('converts between SI and display units without binary noise', () => {
    expect(fromSI(1e-3, 'area')).toBe(1000);
    expect(toSI(1000, 'area')).toBe(1e-3);
    expect(fromSI(200e9, 'modulus')).toBe(200);
    expect(toSI(-12.5, 'force')).toBe(-12500);
    expect(fromSI(0.0012, 'displacement')).toBe(1.2);
  });

  it('round-trips', () => {
    for (const v of [0.1, 0.3, 123.456, 7e-5]) expect(fromSI(toSI(v, 'area'), 'area')).toBe(v);
  });
});

describe('formatting', () => {
  it('formats compactly', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(12.34567)).toBe('12.35');
    expect(formatNumber(-0.5)).toBe('-0.5');
    expect(formatNumber(2e7)).toBe('2e+7');
    expect(formatQuantity(-10e3, 'force')).toBe('-10 kN');
  });
});
