import { describe, expect, it } from 'vitest';
import { MODULES } from './registry';

describe('module registry', () => {
  it('has unique ids', () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every non-planned module a route, and no planned module one', () => {
    for (const m of MODULES) {
      if (m.status === 'planned') expect(m.path).toBeUndefined();
      else expect(m.path).toMatch(/^\//);
    }
  });
});
