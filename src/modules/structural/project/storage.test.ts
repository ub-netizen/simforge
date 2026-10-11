import { afterEach, describe, expect, it } from 'vitest';
import { EXAMPLES } from '../examples/examples';
import { AUTOSAVE_KEY, loadAutosave, saveAutosave } from './storage';

const project = { name: 'Warren', model: EXAMPLES[0]!.model };

function installStorage(impl: Partial<Storage>) {
  Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('autosave', () => {
  it('saves and restores a project', () => {
    const data = new Map<string, string>();
    installStorage({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) });
    expect(saveAutosave(project)).toBe(true);
    expect(data.has(AUTOSAVE_KEY)).toBe(true);
    expect(loadAutosave()).toEqual(project);
  });

  it('returns null without storage, for corrupt data, and when storage throws', () => {
    expect(loadAutosave()).toBeNull();
    expect(saveAutosave(project)).toBe(false);
    installStorage({ getItem: () => '{"format":"simforge.truss","version":1,"model":{"nodes":[{}]}}' });
    expect(loadAutosave()).toBeNull();
    installStorage({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(loadAutosave()).toBeNull();
    expect(saveAutosave(project)).toBe(false);
  });
});
