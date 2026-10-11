import type { Diagnostic, TrussModel } from '../models/truss';

/**
 * Input checks that do not need the stiffness matrix. Any 'error' diagnostic
 * means the model cannot be analysed. Stability (mechanisms) is detected later
 * by the factorisation, which is exact where counting rules are not.
 */
export function validateTrussModel(model: TrussModel): Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (d: Omit<Diagnostic, 'severity'>) => out.push({ ...d, severity: 'error' });
  const warn = (d: Omit<Diagnostic, 'severity'>) => out.push({ ...d, severity: 'warning' });

  if (model.nodes.length === 0) err({ code: 'EMPTY_MODEL', message: 'The model has no nodes.' });
  if (model.members.length === 0) err({ code: 'EMPTY_MODEL', message: 'The model has no members.' });

  // Nodes ------------------------------------------------------------------
  const nodes = new Map<string, { x: number; y: number }>();
  for (const n of model.nodes) {
    if (nodes.has(n.id)) err({ code: 'DUPLICATE_ID', message: `Node id "${n.id}" is used more than once.`, nodeIds: [n.id] });
    nodes.set(n.id, n);
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y))
      err({ code: 'INVALID_COORDINATE', message: `Node ${n.id} has a non-finite coordinate.`, nodeIds: [n.id] });
  }

  const finite = [...nodes.values()].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const extent = finite.length
    ? Math.max(
        Math.max(...finite.map((p) => p.x)) - Math.min(...finite.map((p) => p.x)),
        Math.max(...finite.map((p) => p.y)) - Math.min(...finite.map((p) => p.y)),
      )
    : 0;
  const lengthTol = 1e-9 * extent;

  // Distinct nodes at the same position are almost always a modelling mistake:
  // they look joined but are not.
  const ids = [...nodes.keys()];
  for (let a = 0; a < ids.length; a++)
    for (let b = a + 1; b < ids.length; b++) {
      const p = nodes.get(ids[a]!)!;
      const q = nodes.get(ids[b]!)!;
      if (Math.hypot(p.x - q.x, p.y - q.y) <= lengthTol)
        warn({
          code: 'COINCIDENT_NODES',
          message: `Nodes ${ids[a]} and ${ids[b]} are at the same position but are not the same joint.`,
          nodeIds: [ids[a]!, ids[b]!],
        });
    }

  // Members ----------------------------------------------------------------
  const memberIds = new Set<string>();
  const connected = new Set<string>();
  const pairs = new Map<string, string>();
  for (const m of model.members) {
    if (memberIds.has(m.id))
      err({ code: 'DUPLICATE_ID', message: `Member id "${m.id}" is used more than once.`, memberIds: [m.id] });
    memberIds.add(m.id);

    const missing = [m.nodeI, m.nodeJ].filter((id) => !nodes.has(id));
    if (missing.length) {
      err({ code: 'UNKNOWN_NODE', message: `Member ${m.id} refers to missing node ${missing.join(', ')}.`, memberIds: [m.id] });
      continue;
    }
    connected.add(m.nodeI);
    connected.add(m.nodeJ);

    const p = nodes.get(m.nodeI)!;
    const q = nodes.get(m.nodeJ)!;
    if (m.nodeI === m.nodeJ || Math.hypot(q.x - p.x, q.y - p.y) <= lengthTol)
      err({ code: 'ZERO_LENGTH_MEMBER', message: `Member ${m.id} has zero length.`, memberIds: [m.id] });

    if (!(Number.isFinite(m.E) && m.E > 0))
      err({ code: 'INVALID_PROPERTY', message: `Member ${m.id}: elastic modulus E must be a positive number (Pa).`, memberIds: [m.id] });
    if (!(Number.isFinite(m.A) && m.A > 0))
      err({ code: 'INVALID_PROPERTY', message: `Member ${m.id}: area A must be a positive number (m²).`, memberIds: [m.id] });

    const key = m.nodeI < m.nodeJ ? `${m.nodeI}\u0000${m.nodeJ}` : `${m.nodeJ}\u0000${m.nodeI}`;
    const other = pairs.get(key);
    if (other !== undefined)
      warn({
        code: 'DUPLICATE_MEMBER',
        message: `Members ${other} and ${m.id} connect the same two nodes and act in parallel.`,
        memberIds: [other, m.id],
      });
    else pairs.set(key, m.id);
  }

  // Supports ---------------------------------------------------------------
  const restrained = new Map<string, { x: boolean; y: boolean }>();
  let hasSettlement = false;
  for (const s of model.supports) {
    if (!nodes.has(s.nodeId)) {
      err({ code: 'UNKNOWN_NODE', message: `A support refers to missing node ${s.nodeId}.`, nodeIds: [s.nodeId] });
      continue;
    }
    if (restrained.has(s.nodeId)) {
      err({ code: 'DUPLICATE_SUPPORT', message: `Node ${s.nodeId} has more than one support.`, nodeIds: [s.nodeId] });
      continue;
    }
    restrained.set(s.nodeId, { x: s.restrainX, y: s.restrainY });
    if (!s.restrainX && !s.restrainY)
      warn({ code: 'EMPTY_SUPPORT', message: `The support on node ${s.nodeId} restrains nothing.`, nodeIds: [s.nodeId] });

    for (const [axis, value, active] of [
      ['x', s.settlementX, s.restrainX],
      ['y', s.settlementY, s.restrainY],
    ] as const) {
      if (value === undefined) continue;
      if (!Number.isFinite(value))
        err({ code: 'INVALID_SETTLEMENT', message: `Node ${s.nodeId}: settlement in ${axis} must be a finite number (m).`, nodeIds: [s.nodeId] });
      else if (!active)
        err({
          code: 'INVALID_SETTLEMENT',
          message: `Node ${s.nodeId}: a settlement in ${axis} needs the ${axis}-direction to be restrained.`,
          nodeIds: [s.nodeId],
        });
      else if (value !== 0) hasSettlement = true;
    }
  }

  // Loads ------------------------------------------------------------------
  let hasLoad = false;
  for (const l of model.loads) {
    if (!nodes.has(l.nodeId)) {
      err({ code: 'UNKNOWN_NODE', message: `A load refers to missing node ${l.nodeId}.`, nodeIds: [l.nodeId] });
      continue;
    }
    if (!Number.isFinite(l.fx) || !Number.isFinite(l.fy))
      err({ code: 'INVALID_LOAD', message: `The load on node ${l.nodeId} has a non-finite component.`, nodeIds: [l.nodeId] });
    else if (l.fx !== 0 || l.fy !== 0) hasLoad = true;
  }

  // Connectivity -------------------------------------------------------------
  for (const id of nodes.keys()) {
    if (connected.has(id)) continue;
    const r = restrained.get(id);
    if (r?.x && r.y)
      warn({
        code: 'UNCONNECTED_NODE',
        message: `Node ${id} is not connected to any member. It is fully supported, so it has no effect.`,
        nodeIds: [id],
      });
    else
      err({
        code: 'UNCONNECTED_NODE',
        message: `Node ${id} is not connected to any member, so nothing resists its movement.`,
        nodeIds: [id],
      });
  }

  if (!hasLoad && !hasSettlement)
    out.push({
      code: 'NO_LOADS',
      severity: 'info',
      message: 'No loads or support settlements are applied; all results will be zero.',
    });

  return out;
}
