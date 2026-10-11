/**
 * SimForge truss project files (.simforge.json).
 *
 *   {
 *     "format": "simforge.truss",
 *     "version": 1,
 *     "name": "Warren bridge truss",
 *     "units": { "length": "m", "force": "N", "modulus": "Pa", "area": "m^2", "stress": "Pa" },
 *     "model": { "nodes": [...], "members": [...], "supports": [...], "loads": [...] }
 *   }
 *
 * Values are stored in SI, exactly as the solver uses them. Parsing is strict:
 * a file is either accepted as a fully consistent model or rejected with a
 * list of problems, because a half-loaded model with dangling references
 * would mislead rather than help. Unknown extra fields are ignored.
 */
import type { NodalLoad, TrussMember, TrussModel, TrussNode, TrussSupport } from '../models/truss';
import { APP_VERSION } from '../../../app/config';

export const PROJECT_FORMAT = 'simforge.truss';
export const PROJECT_VERSION = 1;
export const PROJECT_UNITS = { length: 'm', force: 'N', modulus: 'Pa', area: 'm^2', stress: 'Pa' } as const;

export interface TrussProject {
  name: string;
  model: TrussModel;
}

export function serializeProject(project: TrussProject): string {
  return JSON.stringify(
    {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      name: project.name,
      createdWith: `SimForge ${APP_VERSION}`,
      units: PROJECT_UNITS,
      model: project.model,
    },
    null,
    2,
  );
}

export type ParseResult = { ok: true; project: TrussProject } | { ok: false; errors: string[] };

/** Parses project JSON text. Never throws. */
export function parseProjectText(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  return parseProject(data);
}

export function parseProject(data: unknown): ParseResult {
  const errors: string[] = [];
  if (!isObject(data)) return { ok: false, errors: ['The file does not contain a SimForge project object.'] };
  if (data.format !== PROJECT_FORMAT)
    return { ok: false, errors: [`Not a SimForge truss project (expected "format": "${PROJECT_FORMAT}").`] };
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1)
    return { ok: false, errors: ['The project has no valid "version" number.'] };
  if (data.version > PROJECT_VERSION)
    return {
      ok: false,
      errors: [`This project uses file version ${data.version}, but this SimForge supports up to version ${PROJECT_VERSION}. Update SimForge to open it.`],
    };
  if (data.units !== undefined && !sameUnits(data.units))
    return { ok: false, errors: ['The project declares units other than SI (m, N, Pa, m²), which is not supported.'] };

  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : 'Untitled truss';
  const raw = data.model;
  if (!isObject(raw)) return { ok: false, errors: ['The project has no "model" object.'] };

  const nodes = list(raw.nodes, 'nodes', errors).map((n, i) => readNode(n, i, errors));
  const members = list(raw.members, 'members', errors).map((m, i) => readMember(m, i, errors));
  const supports = list(raw.supports, 'supports', errors).map((s, i) => readSupport(s, i, errors));
  const loads = list(raw.loads, 'loads', errors).map((l, i) => readLoad(l, i, errors));
  if (errors.length) return { ok: false, errors: cap(errors) };

  // Referential integrity: the editor relies on every reference resolving.
  const nodeIds = new Set<string>();
  for (const n of nodes as TrussNode[]) {
    if (nodeIds.has(n.id)) errors.push(`Duplicate node id "${n.id}".`);
    nodeIds.add(n.id);
  }
  const memberIds = new Set<string>();
  const pairs = new Set<string>();
  for (const m of members as TrussMember[]) {
    if (memberIds.has(m.id)) errors.push(`Duplicate member id "${m.id}".`);
    memberIds.add(m.id);
    for (const end of [m.nodeI, m.nodeJ]) if (!nodeIds.has(end)) errors.push(`Member "${m.id}" refers to missing node "${end}".`);
    if (m.nodeI === m.nodeJ) errors.push(`Member "${m.id}" connects node "${m.nodeI}" to itself.`);
    const key = [m.nodeI, m.nodeJ].sort().join('\u0000');
    if (pairs.has(key)) errors.push(`More than one member connects "${m.nodeI}" and "${m.nodeJ}".`);
    pairs.add(key);
  }
  const once = (items: { nodeId: string }[], what: string) => {
    const seen = new Set<string>();
    for (const x of items) {
      if (!nodeIds.has(x.nodeId)) errors.push(`A ${what} refers to missing node "${x.nodeId}".`);
      if (seen.has(x.nodeId)) errors.push(`Node "${x.nodeId}" has more than one ${what}.`);
      seen.add(x.nodeId);
    }
  };
  once(supports as TrussSupport[], 'support');
  once(loads as NodalLoad[], 'load');
  if (errors.length) return { ok: false, errors: cap(errors) };

  return {
    ok: true,
    project: {
      name,
      model: {
        nodes: nodes as TrussNode[],
        members: members as TrussMember[],
        supports: supports as TrussSupport[],
        loads: loads as NodalLoad[],
      },
    },
  };
}

// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0;
const idString = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

function sameUnits(u: unknown): boolean {
  return isObject(u) && Object.entries(PROJECT_UNITS).every(([k, v]) => u[k] === undefined || u[k] === v);
}

function list(v: unknown, field: string, errors: string[]): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    errors.push(`"model.${field}" must be an array.`);
    return [];
  }
  return v;
}

function readNode(v: unknown, i: number, errors: string[]): TrussNode | null {
  if (!isObject(v) || !idString(v.id) || !finite(v.x) || !finite(v.y)) {
    errors.push(`Node ${i + 1}: needs a text "id" and numeric "x" and "y" (m).`);
    return null;
  }
  return { id: v.id, x: v.x, y: v.y };
}

function readMember(v: unknown, i: number, errors: string[]): TrussMember | null {
  if (!isObject(v) || !idString(v.id) || !idString(v.nodeI) || !idString(v.nodeJ)) {
    errors.push(`Member ${i + 1}: needs text "id", "nodeI" and "nodeJ".`);
    return null;
  }
  if (!positive(v.E) || !positive(v.A)) {
    errors.push(`Member "${v.id}": "E" (Pa) and "A" (m²) must be positive numbers.`);
    return null;
  }
  if (v.yieldStrength !== undefined && !positive(v.yieldStrength)) {
    errors.push(`Member "${v.id}": "yieldStrength" (Pa) must be a positive number.`);
    return null;
  }
  const m: TrussMember = { id: v.id, nodeI: v.nodeI, nodeJ: v.nodeJ, E: v.E, A: v.A };
  if (typeof v.material === 'string' && v.material) m.material = v.material;
  if (positive(v.yieldStrength)) m.yieldStrength = v.yieldStrength;
  return m;
}

function readSupport(v: unknown, i: number, errors: string[]): TrussSupport | null {
  if (!isObject(v) || !idString(v.nodeId) || typeof v.restrainX !== 'boolean' || typeof v.restrainY !== 'boolean') {
    errors.push(`Support ${i + 1}: needs "nodeId" and boolean "restrainX" and "restrainY".`);
    return null;
  }
  const s: TrussSupport = { nodeId: v.nodeId, restrainX: v.restrainX, restrainY: v.restrainY };
  for (const [key, active] of [
    ['settlementX', v.restrainX],
    ['settlementY', v.restrainY],
  ] as const) {
    const value = v[key];
    if (value === undefined || value === 0) continue;
    if (!finite(value) || !active) {
      errors.push(`Support on "${v.nodeId}": "${key}" must be a number (m) on a restrained direction.`);
      return null;
    }
    s[key] = value;
  }
  return s;
}

function readLoad(v: unknown, i: number, errors: string[]): NodalLoad | null {
  if (!isObject(v) || !idString(v.nodeId) || !finite(v.fx) || !finite(v.fy)) {
    errors.push(`Load ${i + 1}: needs "nodeId" and numeric "fx" and "fy" (N).`);
    return null;
  }
  return { nodeId: v.nodeId, fx: v.fx, fy: v.fy };
}

/** Long error lists are truncated so the message stays readable. */
function cap(errors: string[], max = 8): string[] {
  return errors.length <= max ? errors : [...errors.slice(0, max), `…and ${errors.length - max} more problems.`];
}

/** File name for downloads: "Warren bridge truss" → "warren-bridge-truss". */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // drop combining accents: "Ü" → "U"
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'truss'
  );
}
