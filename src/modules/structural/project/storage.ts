/**
 * Autosave of the current project in the browser's localStorage. Storage can
 * be unavailable or full (private windows, blocked site data), so every
 * access is guarded and failure simply means "not saved".
 */
import { parseProjectText, serializeProject, type TrussProject } from './projectFile';

export const AUTOSAVE_KEY = 'simforge.truss.autosave';

export function loadAutosave(): TrussProject | null {
  try {
    const text = globalThis.localStorage?.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    const r = parseProjectText(text);
    return r.ok ? r.project : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refused to store the project. */
export function saveAutosave(project: TrussProject): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
    return true;
  } catch {
    return false;
  }
}
