/**
 * Truss editor state and reducer. Pure and framework-free: every edit is an
 * action producing a new immutable TrussModel, which makes undo/redo a matter
 * of keeping previous models.
 *
 * The document being edited is the solver's own TrussModel (SI units), so
 * no conversion is needed before analysis.
 */
import type { NodalLoad, TrussMember, TrussModel, TrussNode, TrussSupport } from '../models/truss';
import { MATERIALS } from '../models/materials';

export type ItemKind = 'node' | 'member' | 'support' | 'load';
export type SelectionKey = `${ItemKind}:${string}`;

export const selKey = (kind: ItemKind, id: string): SelectionKey => `${kind}:${id}`;

export function parseKey(k: SelectionKey): { kind: ItemKind; id: string } {
  const i = k.indexOf(':');
  return { kind: k.slice(0, i) as ItemKind, id: k.slice(i + 1) };
}

/** Support types offered by the editor (restraints in global axes). */
export type SupportType = 'pin' | 'rollerY' | 'rollerX';

export const SUPPORT_TYPES: readonly { type: SupportType; label: string; description: string }[] = [
  { type: 'pin', label: 'Pin', description: 'Restrains x and y' },
  { type: 'rollerY', label: 'Roller (y)', description: 'Restrains y; free to slide in x' },
  { type: 'rollerX', label: 'Roller (x)', description: 'Restrains x; free to slide in y' },
];

export function supportType(s: TrussSupport): SupportType | null {
  if (s.restrainX && s.restrainY) return 'pin';
  if (s.restrainY) return 'rollerY';
  if (s.restrainX) return 'rollerX';
  return null;
}

/** Builds a support of the given type, keeping settlements that still apply. */
export function makeSupport(nodeId: string, type: SupportType, previous?: TrussSupport): TrussSupport {
  const restrainX = type !== 'rollerY';
  const restrainY = type !== 'rollerX';
  const s: TrussSupport = { nodeId, restrainX, restrainY };
  if (restrainX && previous?.settlementX) s.settlementX = previous.settlementX;
  if (restrainY && previous?.settlementY) s.settlementY = previous.settlementY;
  return s;
}

/** Support-tool cycle: none → pin → roller (y) → roller (x) → none. */
export function nextSupportType(current: SupportType | null | undefined): SupportType | null {
  if (!current) return 'pin';
  if (current === 'pin') return 'rollerY';
  if (current === 'rollerY') return 'rollerX';
  return null;
}

export interface MemberDefaults {
  /** Pa */
  E: number;
  /** m² */
  A: number;
  /** Material preset id, or undefined for custom values. */
  material?: string;
  /** Pa */
  yieldStrength?: number;
}

const A36 = MATERIALS[0]!;

/** ASTM A36 structural steel, 1000 mm² bar. */
export const DEFAULT_MEMBER: MemberDefaults = { E: A36.E, A: 1e-3, material: A36.id, yieldStrength: A36.yieldStrength };

/**
 * Member property change. `material: null` marks the member as custom; a
 * yieldStrength of null removes it (no factor-of-safety check).
 */
export interface MemberPatch {
  E?: number;
  A?: number;
  yieldStrength?: number | null;
  material?: string | null;
}

/** Applies a patch, dropping optional fields set to null. */
export function applyMemberPatch<T extends MemberDefaults>(m: T, patch: MemberPatch): T {
  const next = { ...m };
  if (patch.E !== undefined) next.E = patch.E;
  if (patch.A !== undefined) next.A = patch.A;
  if (patch.yieldStrength === null) delete next.yieldStrength;
  else if (patch.yieldStrength !== undefined) next.yieldStrength = patch.yieldStrength;
  if (patch.material === null) delete next.material;
  else if (patch.material !== undefined) next.material = patch.material;
  return next;
}

function validPatch(p: MemberPatch): boolean {
  return isPositive(p.E) && isPositive(p.A) && (p.yieldStrength === null || isPositive(p.yieldStrength));
}

/** Default load added by the load tool: 10 kN downward. */
export const DEFAULT_LOAD = { fx: 0, fy: -10e3 };

export interface EditorState {
  model: TrussModel;
  past: TrussModel[];
  future: TrussModel[];
  selection: SelectionKey[];
  defaults: MemberDefaults;
}

export const HISTORY_LIMIT = 200;

export const EMPTY_MODEL: TrussModel = { nodes: [], members: [], supports: [], loads: [] };

export function initialEditorState(model: TrussModel = EMPTY_MODEL): EditorState {
  return { model, past: [], future: [], selection: [], defaults: DEFAULT_MEMBER };
}

/** Next free id of the form `${prefix}${n}`, e.g. N1, N2 … Derived from the model, so it is undo-safe. */
export function nextId(prefix: string, existing: readonly { id: string }[]): string {
  let max = 0;
  for (const { id } of existing) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export const nextNodeId = (m: TrussModel) => nextId('N', m.nodes);
export const nextMemberId = (m: TrussModel) => nextId('M', m.members);

export function findMemberBetween(m: TrussModel, a: string, b: string): TrussMember | undefined {
  return m.members.find((x) => (x.nodeI === a && x.nodeJ === b) || (x.nodeI === b && x.nodeJ === a));
}

export type EditorAction =
  | { type: 'addNode'; node: TrussNode; select?: boolean }
  | { type: 'addMember'; member: TrussMember; select?: boolean }
  /** `transient` updates skip the history; pair them with a preceding 'beginGesture'. */
  | { type: 'moveNodes'; positions: Readonly<Record<string, { x: number; y: number }>>; transient?: boolean }
  | { type: 'updateMembers'; ids: readonly string[]; patch: MemberPatch }
  | { type: 'setSupport'; nodeId: string; support: TrussSupport | null }
  | { type: 'setLoad'; nodeId: string; load: Pick<NodalLoad, 'fx' | 'fy'> | null }
  | { type: 'deleteSelection' }
  | { type: 'replaceModel'; model: TrussModel }
  | { type: 'select'; keys: readonly SelectionKey[]; mode?: 'replace' | 'toggle' | 'add' }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'beginGesture' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setDefaults'; patch: MemberPatch }
  /** Applies several actions as one undo step. */
  | { type: 'batch'; actions: readonly EditorAction[] };

const isPositive = (v: number | undefined) => v === undefined || (Number.isFinite(v) && v > 0);

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const m = state.model;
  switch (action.type) {
    case 'addNode': {
      const { node } = action;
      if (m.nodes.some((n) => n.id === node.id) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return state;
      const next = commit(state, { ...m, nodes: [...m.nodes, node] });
      return action.select ? { ...next, selection: [selKey('node', node.id)] } : next;
    }

    case 'addMember': {
      const { member } = action;
      const ids = new Set(m.nodes.map((n) => n.id));
      if (
        !ids.has(member.nodeI) ||
        !ids.has(member.nodeJ) ||
        member.nodeI === member.nodeJ ||
        m.members.some((x) => x.id === member.id) ||
        findMemberBetween(m, member.nodeI, member.nodeJ) ||
        !isPositive(member.E) ||
        !isPositive(member.A) ||
        !isPositive(member.yieldStrength)
      )
        return state;
      const next = commit(state, { ...m, members: [...m.members, member] });
      return action.select ? { ...next, selection: [selKey('member', member.id)] } : next;
    }

    case 'moveNodes': {
      let changed = false;
      const nodes = m.nodes.map((n) => {
        const p = action.positions[n.id];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || (p.x === n.x && p.y === n.y)) return n;
        changed = true;
        return { ...n, x: p.x, y: p.y };
      });
      if (!changed) return state;
      const model = { ...m, nodes };
      return action.transient ? { ...state, model } : commit(state, model);
    }

    case 'updateMembers': {
      const { patch } = action;
      if (!validPatch(patch)) return state;
      const ids = new Set(action.ids);
      let changed = false;
      const members = m.members.map((x) => {
        if (!ids.has(x.id)) return x;
        const updated = applyMemberPatch(x, patch);
        if (
          updated.E === x.E &&
          updated.A === x.A &&
          updated.yieldStrength === x.yieldStrength &&
          updated.material === x.material
        )
          return x;
        changed = true;
        return updated;
      });
      return changed ? commit(state, { ...m, members }) : state;
    }

    case 'setSupport': {
      if (!m.nodes.some((n) => n.id === action.nodeId)) return state;
      const others = m.supports.filter((s) => s.nodeId !== action.nodeId);
      const supports = action.support ? [...others, { ...action.support, nodeId: action.nodeId }] : others;
      return commit(state, { ...m, supports });
    }

    case 'setLoad': {
      if (!m.nodes.some((n) => n.id === action.nodeId)) return state;
      const { load } = action;
      if (load && (!Number.isFinite(load.fx) || !Number.isFinite(load.fy))) return state;
      const others = m.loads.filter((l) => l.nodeId !== action.nodeId);
      const loads = load ? [...others, { nodeId: action.nodeId, fx: load.fx, fy: load.fy }] : others;
      return commit(state, { ...m, loads });
    }

    case 'deleteSelection': {
      if (state.selection.length === 0) return state;
      const del = { node: new Set<string>(), member: new Set<string>(), support: new Set<string>(), load: new Set<string>() };
      for (const k of state.selection) {
        const { kind, id } = parseKey(k);
        del[kind].add(id);
      }
      // Deleting a node removes everything attached to it.
      const model: TrussModel = {
        nodes: m.nodes.filter((n) => !del.node.has(n.id)),
        members: m.members.filter((x) => !del.member.has(x.id) && !del.node.has(x.nodeI) && !del.node.has(x.nodeJ)),
        supports: m.supports.filter((s) => !del.support.has(s.nodeId) && !del.node.has(s.nodeId)),
        loads: m.loads.filter((l) => !del.load.has(l.nodeId) && !del.node.has(l.nodeId)),
      };
      return { ...commit(state, model), selection: [] };
    }

    case 'replaceModel':
      return { ...commit(state, action.model), selection: [] };

    case 'select': {
      const valid = action.keys.filter((k) => exists(m, k));
      const mode = action.mode ?? 'replace';
      if (mode === 'replace') return { ...state, selection: unique(valid) };
      if (mode === 'add') return { ...state, selection: unique([...state.selection, ...valid]) };
      const current = new Set(state.selection);
      for (const k of valid) {
        if (current.has(k)) current.delete(k);
        else current.add(k);
      }
      return { ...state, selection: [...current] };
    }

    case 'selectAll':
      return {
        ...state,
        selection: [...m.nodes.map((n) => selKey('node', n.id)), ...m.members.map((x) => selKey('member', x.id))],
      };

    case 'clearSelection':
      return state.selection.length ? { ...state, selection: [] } : state;

    case 'beginGesture':
      return { ...state, past: pushPast(state.past, m), future: [] };

    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        model: prev,
        past: state.past.slice(0, -1),
        future: [m, ...state.future],
        selection: prune(state.selection, prev),
      };
    }

    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { ...state, model: next, past: pushPast(state.past, m), future: rest, selection: prune(state.selection, next) };
    }

    case 'batch': {
      let s = state;
      for (const a of action.actions) s = editorReducer(s, a);
      if (s.model === state.model) return s;
      return { ...s, past: pushPast(state.past, state.model), future: [] };
    }

    case 'setDefaults': {
      if (!validPatch(action.patch)) return state;
      return { ...state, defaults: applyMemberPatch(state.defaults, action.patch) };
    }
  }
}

function commit(state: EditorState, model: TrussModel): EditorState {
  if (model === state.model) return state;
  return { ...state, model, past: pushPast(state.past, state.model), future: [], selection: prune(state.selection, model) };
}

function pushPast(past: TrussModel[], model: TrussModel): TrussModel[] {
  const next = [...past, model];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function exists(m: TrussModel, k: SelectionKey): boolean {
  const { kind, id } = parseKey(k);
  switch (kind) {
    case 'node':
      return m.nodes.some((n) => n.id === id);
    case 'member':
      return m.members.some((x) => x.id === id);
    case 'support':
      return m.supports.some((s) => s.nodeId === id);
    case 'load':
      return m.loads.some((l) => l.nodeId === id);
  }
}

function prune(selection: SelectionKey[], m: TrussModel): SelectionKey[] {
  const kept = selection.filter((k) => exists(m, k));
  return kept.length === selection.length ? selection : kept;
}

function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}
