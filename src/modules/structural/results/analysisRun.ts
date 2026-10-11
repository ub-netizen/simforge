import type {
  MechanismMode,
  MemberResult,
  NodeDisplacement,
  SupportReaction,
  TrussAnalysis,
  TrussModel,
} from '../models/truss';
import { autoDeformScale, maxAbs } from './resultsView';

/**
 * An analysis together with the exact model it was computed from. Results are
 * shown only while the editor's model is this same object; any edit makes
 * them stale.
 */
export interface AnalysisRun {
  model: TrussModel;
  result: TrussAnalysis;
}

/** Lookup tables and scales derived once per run, shared by all result views. */
export interface ResultIndex {
  status: TrussAnalysis['status'];
  members: ReadonlyMap<string, MemberResult>;
  displacements: ReadonlyMap<string, NodeDisplacement>;
  reactions: ReadonlyMap<string, SupportReaction>;
  /** Largest |N|, N. */
  maxAbsForce: number;
  /** Largest force of any kind (N, loads, reactions), N: the reference for noise suppression. */
  forceScale: number;
  /** Largest |u|, m. */
  maxDisplacement: number;
  /** Automatic deformed-shape magnification, or null when nothing moves. */
  autoScale: number | null;
  mechanismModes: readonly MechanismMode[];
  /** Items referenced by error diagnostics, for highlighting. */
  flaggedNodes: ReadonlySet<string>;
  flaggedMembers: ReadonlySet<string>;
}

export function indexAnalysis({ model, result }: AnalysisRun): ResultIndex {
  const flaggedNodes = new Set<string>();
  const flaggedMembers = new Set<string>();
  for (const d of result.diagnostics) {
    if (d.severity !== 'error') continue;
    d.nodeIds?.forEach((id) => flaggedNodes.add(id));
    d.memberIds?.forEach((id) => flaggedMembers.add(id));
  }

  if (result.status !== 'solved') {
    return {
      status: result.status,
      members: new Map(),
      displacements: new Map(),
      reactions: new Map(),
      maxAbsForce: 0,
      forceScale: 0,
      maxDisplacement: 0,
      autoScale: null,
      mechanismModes: result.status === 'unstable' ? result.mechanismModes : [],
      flaggedNodes,
      flaggedMembers,
    };
  }

  const maxAbsForce = maxAbs(result.members.map((m) => m.axialForce));
  const forceScale = Math.max(
    maxAbsForce,
    maxAbs(model.loads.flatMap((l) => [l.fx, l.fy])),
    maxAbs(result.reactions.flatMap((r) => [r.rx, r.ry])),
  );
  return {
    status: 'solved',
    members: new Map(result.members.map((m) => [m.memberId, m])),
    displacements: new Map(result.displacements.map((d) => [d.nodeId, d])),
    reactions: new Map(result.reactions.map((r) => [r.nodeId, r])),
    maxAbsForce,
    forceScale,
    maxDisplacement: Math.max(0, ...result.displacements.map((d) => Math.hypot(d.ux, d.uy))),
    autoScale: autoDeformScale(model, result.displacements),
    mechanismModes: [],
    flaggedNodes,
    flaggedMembers,
  };
}
