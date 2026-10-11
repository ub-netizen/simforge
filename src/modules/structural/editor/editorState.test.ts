import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEMBER,
  HISTORY_LIMIT,
  editorReducer,
  initialEditorState,
  makeSupport,
  nextId,
  nextSupportType,
  selKey,
  supportType,
  type EditorAction,
  type EditorState,
} from './editorState';

const run = (actions: EditorAction[], start: EditorState = initialEditorState()) => actions.reduce(editorReducer, start);

const node = (id: string, x: number, y: number): EditorAction => ({ type: 'addNode', node: { id, x, y } });
const member = (id: string, i: string, j: string): EditorAction => ({
  type: 'addMember',
  member: { id, nodeI: i, nodeJ: j, ...DEFAULT_MEMBER },
});

/** Triangle N1-N2-N3 with members M1-M3, a pin, a roller and a load. */
const triangle = () =>
  run([
    node('N1', 0, 0),
    node('N2', 4, 0),
    node('N3', 2, 3),
    member('M1', 'N1', 'N2'),
    member('M2', 'N2', 'N3'),
    member('M3', 'N3', 'N1'),
    { type: 'setSupport', nodeId: 'N1', support: makeSupport('N1', 'pin') },
    { type: 'setSupport', nodeId: 'N2', support: makeSupport('N2', 'rollerY') },
    { type: 'setLoad', nodeId: 'N3', load: { fx: 0, fy: -10e3 } },
  ]);

describe('ids', () => {
  it('uses one more than the largest existing number', () => {
    expect(nextId('N', [])).toBe('N1');
    expect(nextId('N', [{ id: 'N1' }, { id: 'N7' }, { id: 'X9' }, { id: 'Nfoo' }])).toBe('N8');
  });
});

describe('adding items', () => {
  it('adds nodes and members', () => {
    const s = triangle();
    expect(s.model.nodes.map((n) => n.id)).toEqual(['N1', 'N2', 'N3']);
    expect(s.model.members.map((m) => m.id)).toEqual(['M1', 'M2', 'M3']);
    expect(s.model.members[0]).toMatchObject({ E: 200e9, A: 1e-3, material: 'steel-a36', yieldStrength: 250e6 });
  });

  it('rejects duplicate ids, self-loops, missing nodes and duplicate connections', () => {
    const s = triangle();
    for (const a of [
      node('N1', 9, 9),
      member('M9', 'N1', 'N1'),
      member('M9', 'N1', 'N99'),
      member('M9', 'N2', 'N1'), // same pair as M1, reversed
      member('M1', 'N1', 'N3'),
    ])
      expect(editorReducer(s, a)).toBe(s);
  });

  it('rejects non-positive member properties', () => {
    const s = run([node('N1', 0, 0), node('N2', 1, 0)]);
    const bad: EditorAction = { type: 'addMember', member: { id: 'M1', nodeI: 'N1', nodeJ: 'N2', E: 0, A: 1e-3 } };
    expect(editorReducer(s, bad)).toBe(s);
  });

  it('can select what it adds', () => {
    const s = run([{ type: 'addNode', node: { id: 'N1', x: 0, y: 0 }, select: true }]);
    expect(s.selection).toEqual(['node:N1']);
  });
});

describe('supports and loads', () => {
  it('replaces the support on a node rather than adding a second one', () => {
    const s = run([{ type: 'setSupport', nodeId: 'N1', support: makeSupport('N1', 'rollerX') }], triangle());
    expect(s.model.supports.filter((x) => x.nodeId === 'N1')).toEqual([{ nodeId: 'N1', restrainX: true, restrainY: false }]);
  });

  it('keeps one load per node', () => {
    const s = run([{ type: 'setLoad', nodeId: 'N3', load: { fx: 5e3, fy: 0 } }], triangle());
    expect(s.model.loads).toEqual([{ nodeId: 'N3', fx: 5e3, fy: 0 }]);
  });

  it('removes supports and loads with null', () => {
    const s = run(
      [
        { type: 'setSupport', nodeId: 'N1', support: null },
        { type: 'setLoad', nodeId: 'N3', load: null },
      ],
      triangle(),
    );
    expect(s.model.supports.map((x) => x.nodeId)).toEqual(['N2']);
    expect(s.model.loads).toEqual([]);
  });

  it('cycles support types and keeps applicable settlements', () => {
    expect([undefined, 'pin', 'rollerY', 'rollerX'].map((t) => nextSupportType(t as never))).toEqual([
      'pin',
      'rollerY',
      'rollerX',
      null,
    ]);
    const prev = { nodeId: 'N1', restrainX: true, restrainY: true, settlementX: 0.01, settlementY: -0.02 };
    expect(makeSupport('N1', 'rollerY', prev)).toEqual({ nodeId: 'N1', restrainX: false, restrainY: true, settlementY: -0.02 });
    expect(supportType(makeSupport('N1', 'rollerX'))).toBe('rollerX');
  });
});

describe('editing', () => {
  it('moves nodes', () => {
    const s = run([{ type: 'moveNodes', positions: { N3: { x: 2, y: 4 } } }], triangle());
    expect(s.model.nodes.find((n) => n.id === 'N3')).toEqual({ id: 'N3', x: 2, y: 4 });
  });

  it('updates properties of several members at once', () => {
    const s = run([{ type: 'updateMembers', ids: ['M1', 'M3'], patch: { A: 2e-3 } }], triangle());
    expect(s.model.members.map((m) => m.A)).toEqual([2e-3, 1e-3, 2e-3]);
  });

  it('ignores invalid property values', () => {
    const s = triangle();
    expect(editorReducer(s, { type: 'updateMembers', ids: ['M1'], patch: { E: -1 } })).toBe(s);
    expect(editorReducer(s, { type: 'updateMembers', ids: ['M1'], patch: { A: NaN } })).toBe(s);
  });

  it('does not create history entries for edits that change nothing', () => {
    const s = triangle();
    expect(editorReducer(s, { type: 'moveNodes', positions: { N1: { x: 0, y: 0 } } })).toBe(s);
    expect(editorReducer(s, { type: 'updateMembers', ids: ['M1'], patch: { E: 200e9 } })).toBe(s);
  });
});

describe('deleting', () => {
  it('cascades from nodes to their members, support and load', () => {
    const s = run([{ type: 'select', keys: [selKey('node', 'N3')] }, { type: 'deleteSelection' }], triangle());
    expect(s.model.nodes.map((n) => n.id)).toEqual(['N1', 'N2']);
    expect(s.model.members.map((m) => m.id)).toEqual(['M1']);
    expect(s.model.loads).toEqual([]);
    expect(s.selection).toEqual([]);
  });

  it('deletes only the selected member, support or load', () => {
    const s = run(
      [{ type: 'select', keys: [selKey('member', 'M2'), selKey('support', 'N1'), selKey('load', 'N3')] }, { type: 'deleteSelection' }],
      triangle(),
    );
    expect(s.model.nodes).toHaveLength(3);
    expect(s.model.members.map((m) => m.id)).toEqual(['M1', 'M3']);
    expect(s.model.supports.map((x) => x.nodeId)).toEqual(['N2']);
    expect(s.model.loads).toEqual([]);
  });
});

describe('selection', () => {
  it('replaces, adds and toggles', () => {
    let s = run([{ type: 'select', keys: ['node:N1'] }], triangle());
    expect(s.selection).toEqual(['node:N1']);
    s = editorReducer(s, { type: 'select', keys: ['member:M1'], mode: 'add' });
    expect(s.selection).toEqual(['node:N1', 'member:M1']);
    s = editorReducer(s, { type: 'select', keys: ['node:N1', 'node:N2'], mode: 'toggle' });
    expect(s.selection).toEqual(['member:M1', 'node:N2']);
  });

  it('ignores keys for items that do not exist', () => {
    const s = run([{ type: 'select', keys: ['node:N99', 'support:N3', 'load:N3'] }], triangle());
    expect(s.selection).toEqual(['load:N3']);
  });

  it('selects all nodes and members', () => {
    expect(run([{ type: 'selectAll' }], triangle()).selection).toHaveLength(6);
  });
});

describe('undo and redo', () => {
  it('steps backwards and forwards through edits', () => {
    const s = triangle();
    const moved = editorReducer(s, { type: 'moveNodes', positions: { N3: { x: 2, y: 5 } } });
    const undone = editorReducer(moved, { type: 'undo' });
    expect(undone.model).toBe(s.model);
    const redone = editorReducer(undone, { type: 'redo' });
    expect(redone.model).toBe(moved.model);
  });

  it('can undo all the way back to an empty model', () => {
    let s = triangle();
    while (s.past.length) s = editorReducer(s, { type: 'undo' });
    expect(s.model.nodes).toEqual([]);
    expect(editorReducer(s, { type: 'undo' })).toBe(s);
  });

  it('clears the redo stack on a new edit', () => {
    let s = run([{ type: 'undo' }], triangle());
    expect(s.future).toHaveLength(1);
    s = editorReducer(s, node('N9', 9, 9));
    expect(s.future).toEqual([]);
  });

  it('records a drag gesture as a single undo step', () => {
    const s = triangle();
    let g = editorReducer(s, { type: 'beginGesture' });
    for (const y of [3.1, 3.4, 3.9, 4.5])
      g = editorReducer(g, { type: 'moveNodes', positions: { N3: { x: 2, y } }, transient: true });
    expect(g.past.length).toBe(s.past.length + 1);
    expect(editorReducer(g, { type: 'undo' }).model).toBe(s.model);
  });

  it('drops selection of items that no longer exist after undo', () => {
    const s = run([node('N9', 9, 9), { type: 'select', keys: ['node:N9'] }, { type: 'undo' }], triangle());
    expect(s.selection).toEqual([]);
  });

  it('limits the history length', () => {
    let s = initialEditorState();
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) s = editorReducer(s, node(`N${i + 1}`, i, 0));
    expect(s.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('batch', () => {
  it('applies several actions as one undo step', () => {
    const s = triangle();
    const b = editorReducer(s, {
      type: 'batch',
      actions: [node('N4', 6, 3), member('M4', 'N3', 'N4'), { type: 'select', keys: ['member:M4'] }],
    });
    expect(b.model.nodes).toHaveLength(4);
    expect(b.model.members).toHaveLength(4);
    expect(b.selection).toEqual(['member:M4']);
    expect(b.past.length).toBe(s.past.length + 1);
    expect(editorReducer(b, { type: 'undo' }).model).toBe(s.model);
  });

  it('adds no history when nothing changes', () => {
    const s = triangle();
    expect(editorReducer(s, { type: 'batch', actions: [member('M9', 'N1', 'N2')] }).past).toBe(s.past);
  });
});

describe('defaults', () => {
  it('updates member defaults but rejects invalid values', () => {
    const s = run([{ type: 'setDefaults', patch: { E: 70e9, material: null } }]);
    expect(s.defaults).toEqual({ E: 70e9, A: 1e-3, yieldStrength: 250e6 });
    expect(editorReducer(s, { type: 'setDefaults', patch: { A: 0 } })).toBe(s);
    expect(editorReducer(s, { type: 'setDefaults', patch: { yieldStrength: -1 } })).toBe(s);
  });
});

describe('member materials', () => {
  it('applies a material preset and can clear optional fields', () => {
    let s = run([{ type: 'updateMembers', ids: ['M1'], patch: { E: 68.9e9, yieldStrength: 276e6, material: 'al-6061-t6' } }], triangle());
    expect(s.model.members[0]).toMatchObject({ E: 68.9e9, yieldStrength: 276e6, material: 'al-6061-t6' });
    s = editorReducer(s, { type: 'updateMembers', ids: ['M1'], patch: { yieldStrength: null, material: null } });
    expect(s.model.members[0]).not.toHaveProperty('yieldStrength');
    expect(s.model.members[0]).not.toHaveProperty('material');
  });
});
