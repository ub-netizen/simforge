/**
 * Data model for linear elastic 2D pin-jointed trusses.
 *
 * All quantities are SI: coordinates and displacements in m, forces in N,
 * areas in m², elastic moduli and stresses in Pa.
 *
 * Sign conventions:
 *   - Global axes: x to the right, y upwards.
 *   - Loads, displacements and reactions are positive in +x / +y.
 *   - Reactions are the forces exerted BY the support ON the structure.
 *   - Member axial force is positive in tension.
 */

export interface TrussNode {
  id: string;
  /** m */
  x: number;
  /** m */
  y: number;
}

export interface TrussMember {
  id: string;
  /** Start node id. */
  nodeI: string;
  /** End node id. */
  nodeJ: string;
  /** Young's modulus, Pa. */
  E: number;
  /** Cross-sectional area, m². */
  A: number;
  /** Material preset id (see materials.ts); absent for custom properties. Not used by the solver. */
  material?: string;
  /** Yield strength, Pa, for factor-of-safety checks. Not used by the solver. */
  yieldStrength?: number;
}

/** Restrains global x and/or y translation of a node. */
export interface TrussSupport {
  nodeId: string;
  restrainX: boolean;
  restrainY: boolean;
  /** Prescribed displacement (support settlement) in x, m. Requires restrainX. */
  settlementX?: number;
  /** Prescribed displacement (support settlement) in y, m. Requires restrainY. */
  settlementY?: number;
}

/** Point load at a node, N. Several loads on one node are summed. */
export interface NodalLoad {
  nodeId: string;
  fx: number;
  fy: number;
}

export interface TrussModel {
  nodes: readonly TrussNode[];
  members: readonly TrussMember[];
  supports: readonly TrussSupport[];
  loads: readonly NodalLoad[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface NodeDisplacement {
  nodeId: string;
  /** m */
  ux: number;
  /** m */
  uy: number;
}

export type AxialState = 'tension' | 'compression' | 'zero';

export interface MemberResult {
  memberId: string;
  /** Undeformed length, m. */
  length: number;
  /** Axial force N, positive in tension, N. */
  axialForce: number;
  /** Axial stress σ = N / A, Pa. */
  stress: number;
  /** Axial strain ε = N / (EA). */
  strain: number;
  /** Change in length ΔL = ε L, m. */
  elongation: number;
  state: AxialState;
}

export interface SupportReaction {
  nodeId: string;
  /** N; zero in an unrestrained direction. */
  rx: number;
  /** N; zero in an unrestrained direction. */
  ry: number;
}

export interface EquilibriumCheck {
  /** Σ (applied loads + reactions) in x, N. Should be ≈ 0. */
  sumFx: number;
  /** Σ (applied loads + reactions) in y, N. Should be ≈ 0. */
  sumFy: number;
  /** Σ moments of loads and reactions about the global origin, N·m. Should be ≈ 0. */
  sumMoment: number;
  /**
   * Largest out-of-balance force at any node when member forces, applied
   * loads and reactions are summed, N.
   */
  maxNodalResidual: number;
  /** maxNodalResidual divided by the largest force in the problem. */
  relativeResidual: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'EMPTY_MODEL'
  | 'DUPLICATE_ID'
  | 'INVALID_COORDINATE'
  | 'UNKNOWN_NODE'
  | 'ZERO_LENGTH_MEMBER'
  | 'INVALID_PROPERTY'
  | 'DUPLICATE_MEMBER'
  | 'COINCIDENT_NODES'
  | 'DUPLICATE_SUPPORT'
  | 'EMPTY_SUPPORT'
  | 'INVALID_SETTLEMENT'
  | 'INVALID_LOAD'
  | 'UNCONNECTED_NODE'
  | 'NO_LOADS'
  | 'DETERMINACY'
  | 'MECHANISM'
  | 'EQUILIBRIUM'
  | 'ILL_CONDITIONED'
  | 'LARGE_DISPLACEMENT'
  | 'BUCKLING_NOT_CHECKED';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  nodeIds?: string[];
  memberIds?: string[];
}

/**
 * A displacement pattern the structure can undergo without straining any
 * member (K u = 0). Normalised so the largest component is 1.
 */
export interface MechanismMode {
  displacements: NodeDisplacement[];
}

export interface SolverStats {
  nodes: number;
  members: number;
  /** Total degrees of freedom, 2 per node. */
  dofs: number;
  freeDofs: number;
  restrainedDofs: number;
  /**
   * m + r − 2n. Negative: necessarily a mechanism. Zero: statically
   * determinate if stable. Positive: degree of static indeterminacy if stable.
   */
  determinacyDegree: number;
  /**
   * Smallest / largest pivot of the LDLᵀ factorisation of K_ff. A cheap
   * indicator of ill-conditioning (not the condition number itself).
   * null when there are no free degrees of freedom.
   */
  pivotRatio: number | null;
}

export type TrussAnalysis =
  | { status: 'invalid'; diagnostics: Diagnostic[] }
  | { status: 'unstable'; diagnostics: Diagnostic[]; stats: SolverStats; mechanismModes: MechanismMode[] }
  | {
      status: 'solved';
      diagnostics: Diagnostic[];
      stats: SolverStats;
      displacements: NodeDisplacement[];
      members: MemberResult[];
      reactions: SupportReaction[];
      equilibrium: EquilibriumCheck;
    };
