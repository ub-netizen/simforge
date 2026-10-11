/**
 * Display units. Models are stored and solved in SI; the interface shows
 * engineering units. Conversions happen only at the UI boundary.
 */

export const UNITS = {
  length: { symbol: 'm', toSI: 1 },
  displacement: { symbol: 'mm', toSI: 1e-3 },
  force: { symbol: 'kN', toSI: 1e3 },
  modulus: { symbol: 'GPa', toSI: 1e9 },
  area: { symbol: 'mm²', toSI: 1e-6 },
  stress: { symbol: 'MPa', toSI: 1e6 },
  angle: { symbol: '°', toSI: Math.PI / 180 },
} as const;

export type Quantity = keyof typeof UNITS;

/**
 * Round away binary noise such as 999.9999999999999 or 0.6000000000000001
 * (12 significant digits is far beyond any input precision).
 */
export function clean(value: number): number {
  return value === 0 ? 0 : Number(value.toPrecision(12));
}

export function fromSI(value: number, q: Quantity): number {
  return clean(value / UNITS[q].toSI);
}

export function toSI(value: number, q: Quantity): number {
  return clean(value * UNITS[q].toSI);
}

/** Compact number for display: up to `digits` significant digits, no trailing zeros. */
export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-4) return value.toExponential(digits - 1).replace(/\.?0+e/, 'e');
  return String(Number(value.toPrecision(digits)));
}

export function formatQuantity(valueSI: number, q: Quantity, digits = 4): string {
  return `${formatNumber(valueSI / UNITS[q].toSI, digits)} ${UNITS[q].symbol}`;
}
