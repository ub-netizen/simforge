/**
 * Example projects for the truss workspace.
 *
 * Every example is a validation reference case (see validation/referenceCases.ts)
 * with an independently derived analytical solution. They are relabelled to
 * the editor's N1…/M1… ids and given ASTM A36 steel, whose E (200 GPa) is the
 * value used in the derivations. examples.test.ts checks every example
 * against its reference solution.
 */
import type { TrussMember, TrussModel } from '../models/truss';
import { MATERIALS } from '../models/materials';
import { REFERENCE_CASES } from '../validation/referenceCases';

export interface TrussExample {
  id: string;
  title: string;
  summary: string;
  /** Reference case this example is derived from. */
  referenceId: string;
  model: TrussModel;
  /** Reference-case id → example id, for nodes and members. */
  nodeIds: ReadonlyMap<string, string>;
  memberIds: ReadonlyMap<string, string>;
}

const A36 = MATERIALS.find((m) => m.id === 'steel-a36')!;

const DEFINITIONS: { id: string; referenceId: string; title: string; summary: string }[] = [
  {
    id: 'warren',
    referenceId: 'warren-3-panel',
    title: 'Warren bridge truss',
    summary: 'Three panels with equal loads on the top chord. The diagonals alternate between tension and compression.',
  },
  {
    id: 'pratt',
    referenceId: 'pratt-6-panel',
    title: 'Pratt bridge truss',
    summary: 'Diagonals slope towards midspan so they carry tension. Two verticals are zero-force members.',
  },
  {
    id: 'howe',
    referenceId: 'howe-roof',
    title: 'Howe roof truss',
    summary: 'Pitched roof under three point loads: compression rafters and diagonals, tension in the centre vertical.',
  },
  {
    id: 'cantilever',
    referenceId: 'cantilever',
    title: 'Cantilever truss',
    summary: 'Projecting from a wall with a tip load: top chord in tension, bottom chord in compression.',
  },
  {
    id: 'triangle',
    referenceId: 'triangle-345',
    title: '3-4-5 triangle',
    summary: 'Three bars with a horizontal load. A good first check, and it contains a zero-force member.',
  },
  {
    id: 'hanger',
    referenceId: 'three-bar-hanger',
    title: 'Three-bar hanger (indeterminate)',
    summary: 'Statically indeterminate: member forces depend on the relative stiffness of the bars.',
  },
  {
    id: 'settlement',
    referenceId: 'three-bar-settlement',
    title: 'Support settlement',
    summary: 'No loads, but the middle support moves 1 mm. In an indeterminate structure that alone induces forces.',
  },
];

/** Renames nodes N1…Nn and members M1…Mm in their existing order. */
export function relabel(model: TrussModel) {
  const nodeIds = new Map(model.nodes.map((n, i) => [n.id, `N${i + 1}`]));
  const memberIds = new Map(model.members.map((m, i) => [m.id, `M${i + 1}`]));
  const node = (id: string) => nodeIds.get(id)!;
  const relabelled: TrussModel = {
    nodes: model.nodes.map((n) => ({ ...n, id: node(n.id) })),
    members: model.members.map(
      (m): TrussMember => ({ ...m, id: memberIds.get(m.id)!, nodeI: node(m.nodeI), nodeJ: node(m.nodeJ) }),
    ),
    supports: model.supports.map((s) => ({ ...s, nodeId: node(s.nodeId) })),
    loads: model.loads.map((l) => ({ ...l, nodeId: node(l.nodeId) })),
  };
  return { model: relabelled, nodeIds, memberIds };
}

export const EXAMPLES: readonly TrussExample[] = DEFINITIONS.map((d) => {
  const ref = REFERENCE_CASES.find((c) => c.id === d.referenceId);
  if (!ref) throw new Error(`Unknown reference case ${d.referenceId}`);
  const { model, nodeIds, memberIds } = relabel(ref.model);
  return {
    ...d,
    model: {
      ...model,
      members: model.members.map((m) => ({ ...m, material: A36.id, yieldStrength: A36.yieldStrength })),
    },
    nodeIds,
    memberIds,
  };
});

export function getExample(id: string | null | undefined): TrussExample | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
