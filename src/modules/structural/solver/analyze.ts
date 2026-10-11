import { ldltFactor, ldltSolve, nullVector, zeros } from '../../../utils/linalg';
import type {
  AxialState,
  Diagnostic,
  EquilibriumCheck,
  MechanismMode,
  MemberResult,
  NodeDisplacement,
  SolverStats,
  SupportReaction,
  TrussAnalysis,
  TrussModel,
} from '../models/truss';
import { axialForce, elementStiffness, memberGeometry, type MemberGeometry } from './stiffness';
import { validateTrussModel } from './validate';

/** Relative out-of-balance force above which results are flagged as unreliable. */
export const EQUILIBRIUM_TOLERANCE = 1e-6;

/** Largest displacement, as a fraction of the structure's size, before the small-displacement warning. */
export const LARGE_DISPLACEMENT_RATIO = 0.01;

/** Pivot ratio below which the stiffness matrix is reported as ill-conditioned. */
export const ILL_CONDITIONED_PIVOT_RATIO = 1e-12;

/**
 * Linear static analysis of a 2D pin-jointed truss by the direct stiffness
 * method.
 *
 *   1. Element stiffness matrices kₑ are assembled into the global K (2n × 2n).
 *   2. DOFs are partitioned into free (f) and restrained (s):
 *        ⎡K_ff K_fs⎤ ⎡u_f⎤   ⎡F_f      ⎤
 *        ⎣K_sf K_ss⎦ ⎣u_s⎦ = ⎣F_s + R_s⎦
 *      with u_s the prescribed support displacements (usually zero).
 *   3. K_ff u_f = F_f − K_fs u_s is solved by LDLᵀ factorisation. K_ff is
 *      symmetric positive definite exactly when the structure is stable, so a
 *      vanishing pivot identifies a mechanism; K is never inverted.
 *   4. Member forces N = (EA/L)·elongation, stresses σ = N/A, and reactions
 *      R_s = K_sf u_f + K_ss u_s − F_s are recovered and checked for equilibrium.
 */
export function analyzeTruss(model: TrussModel): TrussAnalysis {
  const diagnostics = validateTrussModel(model);
  if (diagnostics.some((d) => d.severity === 'error')) return { status: 'invalid', diagnostics };

  // --- Numbering: node k owns DOFs 2k (x) and 2k + 1 (y) ----------------------
  const nodeIndex = new Map(model.nodes.map((n, i) => [n.id, i]));
  const nNodes = model.nodes.length;
  const nDof = 2 * nNodes;

  const restrained = new Uint8Array(nDof);
  const prescribed = new Float64Array(nDof);
  for (const s of model.supports) {
    const k = nodeIndex.get(s.nodeId)!;
    if (s.restrainX) {
      restrained[2 * k] = 1;
      prescribed[2 * k] = s.settlementX ?? 0;
    }
    if (s.restrainY) {
      restrained[2 * k + 1] = 1;
      prescribed[2 * k + 1] = s.settlementY ?? 0;
    }
  }

  const F = new Float64Array(nDof);
  for (const l of model.loads) {
    const k = nodeIndex.get(l.nodeId)!;
    F[2 * k] = F[2 * k]! + l.fx;
    F[2 * k + 1] = F[2 * k + 1]! + l.fy;
  }

  // --- Assembly ---------------------------------------------------------------
  const elements = model.members.map((m) => {
    const i = nodeIndex.get(m.nodeI)!;
    const j = nodeIndex.get(m.nodeJ)!;
    const ni = model.nodes[i]!;
    const nj = model.nodes[j]!;
    const g = memberGeometry(ni.x, ni.y, nj.x, nj.y);
    return { member: m, g, dofs: [2 * i, 2 * i + 1, 2 * j, 2 * j + 1] as const };
  });

  const K = zeros(nDof);
  for (const e of elements) {
    const ke = elementStiffness(e.g, e.member.E, e.member.A);
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 4; b++) {
        const idx = e.dofs[a]! * nDof + e.dofs[b]!;
        K.data[idx] = K.data[idx]! + ke[a * 4 + b]!;
      }
  }

  // --- Partition --------------------------------------------------------------
  const free: number[] = [];
  for (let d = 0; d < nDof; d++) if (!restrained[d]) free.push(d);
  const nFree = free.length;

  const determinacyDegree = model.members.length + (nDof - nFree) - nDof;
  diagnostics.push(determinacyDiagnostic(model.members.length, nDof - nFree, nNodes, determinacyDegree));

  const Kff = zeros(nFree);
  const rhs = new Float64Array(nFree);
  for (let a = 0; a < nFree; a++) {
    const row = free[a]! * nDof;
    for (let b = 0; b < nFree; b++) Kff.data[a * nFree + b] = K.data[row + free[b]!]!;
    // F_f − K_fs u_s
    let r = F[free[a]!]!;
    for (let d = 0; d < nDof; d++) if (restrained[d] && prescribed[d] !== 0) r -= K.data[row + d]! * prescribed[d]!;
    rhs[a] = r;
  }

  const factor = ldltFactor(Kff);
  let pivotRatio: number | null = null;
  if (nFree > 0) {
    let min = Infinity;
    let max = 0;
    factor.d.forEach((v, i) => {
      if (factor.zeroPivots.includes(i)) return;
      min = Math.min(min, v);
      max = Math.max(max, v);
    });
    pivotRatio = max > 0 ? min / max : 0;
  }

  const stats: SolverStats = {
    nodes: nNodes,
    members: model.members.length,
    dofs: nDof,
    freeDofs: nFree,
    restrainedDofs: nDof - nFree,
    determinacyDegree,
    pivotRatio,
  };

  // --- Mechanism ----------------------------------------------------------------
  if (factor.zeroPivots.length > 0) {
    const mechanismModes: MechanismMode[] = factor.zeroPivots.map((k) => {
      const v = nullVector(factor, k);
      const full = new Float64Array(nDof);
      free.forEach((d, a) => (full[d] = v[a]!));
      return { displacements: toNodeDisplacements(model, full) };
    });
    const affected = new Set<string>();
    for (const mode of mechanismModes)
      for (const d of mode.displacements) if (Math.hypot(d.ux, d.uy) > 1e-6) affected.add(d.nodeId);
    const count = mechanismModes.length;
    diagnostics.push({
      code: 'MECHANISM',
      severity: 'error',
      message:
        `The structure is unstable: it has ${count} independent way${count === 1 ? '' : 's'} to move without ` +
        `deforming any member. ` +
        (determinacyDegree < 0
          ? 'It has too few members or supports (m + r < 2n). Add members or restraints.'
          : 'Although m + r ≥ 2n, the arrangement is unstable, for example a panel without a diagonal, collinear ' +
            'members at an unbraced joint, or supports whose reactions are all parallel or concurrent.'),
      nodeIds: [...affected],
    });
    return { status: 'unstable', diagnostics, stats, mechanismModes };
  }

  if (pivotRatio !== null && pivotRatio < ILL_CONDITIONED_PIVOT_RATIO)
    diagnostics.push({
      code: 'ILL_CONDITIONED',
      severity: 'warning',
      message:
        `The stiffness matrix is poorly conditioned (pivot ratio ${pivotRatio.toExponential(2)}). Results may lose ` +
        'accuracy; check for very large differences in member stiffness or nearly unstable joints.',
    });

  // --- Solve ----------------------------------------------------------------------
  const u = Float64Array.from(prescribed);
  if (nFree > 0) {
    const uf = ldltSolve(factor, rhs);
    free.forEach((d, a) => (u[d] = uf[a]!));
  }

  // --- Member results ---------------------------------------------------------------
  const memberForces = elements.map((e) => {
    const [a, b, c, d] = e.dofs;
    return axialForce(e.g, e.member.E, e.member.A, u[a]!, u[b]!, u[c]!, u[d]!);
  });

  // --- Reactions: R = K u − F at restrained DOFs -------------------------------------
  const Ku = new Float64Array(nDof);
  for (let r = 0; r < nDof; r++) {
    let s = 0;
    const row = r * nDof;
    for (let c = 0; c < nDof; c++) s += K.data[row + c]! * u[c]!;
    Ku[r] = s;
  }
  const R = new Float64Array(nDof);
  for (let d = 0; d < nDof; d++) if (restrained[d]) R[d] = Ku[d]! - F[d]!;

  // --- Equilibrium ----------------------------------------------------------------------
  const forceScale = Math.max(maxAbs(F), maxAbs(R), maxAbs(memberForces));
  const equilibrium = checkEquilibrium(model, elements, memberForces, F, R, forceScale);
  const relTol = EQUILIBRIUM_TOLERANCE;
  diagnostics.push({
    code: 'EQUILIBRIUM',
    severity: equilibrium.relativeResidual > relTol ? 'warning' : 'info',
    message:
      equilibrium.relativeResidual > relTol
        ? `Equilibrium is not satisfied to the expected accuracy (relative residual ${equilibrium.relativeResidual.toExponential(2)}). Treat these results with caution.`
        : `Equilibrium satisfied: largest nodal out-of-balance force is ${equilibrium.relativeResidual.toExponential(1)} of the largest force.`,
  });

  const zeroTol = 1e-9 * forceScale;
  const members: MemberResult[] = elements.map((e, idx) => {
    const N = memberForces[idx]!;
    const strain = N / (e.member.E * e.member.A);
    const state: AxialState = N > zeroTol ? 'tension' : N < -zeroTol ? 'compression' : 'zero';
    return {
      memberId: e.member.id,
      length: e.g.length,
      axialForce: N,
      stress: N / e.member.A,
      strain,
      elongation: strain * e.g.length,
      state,
    };
  });

  const compressed = members.filter((m) => m.state === 'compression').map((m) => m.memberId);
  if (compressed.length)
    diagnostics.push({
      code: 'BUCKLING_NOT_CHECKED',
      severity: 'info',
      message: `${compressed.length} member${compressed.length === 1 ? ' is' : 's are'} in compression. Buckling is not checked by this solver; verify compression members separately.`,
      memberIds: compressed,
    });

  const displacements = toNodeDisplacements(model, u);
  const extent = modelExtent(model);
  const maxDisp = Math.max(0, ...displacements.map((d) => Math.hypot(d.ux, d.uy)));
  if (extent > 0 && maxDisp > LARGE_DISPLACEMENT_RATIO * extent)
    diagnostics.push({
      code: 'LARGE_DISPLACEMENT',
      severity: 'warning',
      message:
        `The largest displacement is ${((100 * maxDisp) / extent).toFixed(1)}% of the structure's size. This ` +
        'linear analysis assumes small displacements, so the results may be inaccurate.',
    });

  const reactions: SupportReaction[] = model.supports.map((s) => {
    const k = nodeIndex.get(s.nodeId)!;
    return { nodeId: s.nodeId, rx: s.restrainX ? R[2 * k]! : 0, ry: s.restrainY ? R[2 * k + 1]! : 0 };
  });

  return { status: 'solved', diagnostics, stats, displacements, members, reactions, equilibrium };
}

function checkEquilibrium(
  model: TrussModel,
  elements: readonly { g: MemberGeometry; dofs: readonly number[] }[],
  memberForces: readonly number[],
  F: Float64Array,
  R: Float64Array,
  forceScale: number,
): EquilibriumCheck {
  // Nodal balance from member forces, independent of the assembled K:
  // a tension member pulls node i towards j (+N·(c, s)) and node j towards i.
  const residual = Float64Array.from(F, (f, d) => f + R[d]!);
  elements.forEach((e, idx) => {
    const N = memberForces[idx]!;
    const [a, b, c, d] = e.dofs as [number, number, number, number];
    residual[a] = residual[a]! + N * e.g.c;
    residual[b] = residual[b]! + N * e.g.s;
    residual[c] = residual[c]! - N * e.g.c;
    residual[d] = residual[d]! - N * e.g.s;
  });

  let sumFx = 0;
  let sumFy = 0;
  let sumMoment = 0;
  model.nodes.forEach((n, k) => {
    const fx = F[2 * k]! + R[2 * k]!;
    const fy = F[2 * k + 1]! + R[2 * k + 1]!;
    sumFx += fx;
    sumFy += fy;
    sumMoment += n.x * fy - n.y * fx;
  });

  const maxNodalResidual = maxAbs(residual);
  return {
    sumFx,
    sumFy,
    sumMoment,
    maxNodalResidual,
    relativeResidual: forceScale > 0 ? maxNodalResidual / forceScale : 0,
  };
}

function determinacyDiagnostic(m: number, r: number, n: number, degree: number): Diagnostic {
  const counts = `m = ${m} members, r = ${r} restraints, n = ${n} nodes`;
  const message =
    degree < 0
      ? `${counts}: m + r < 2n, so the structure cannot be stable.`
      : degree === 0
        ? `${counts}: m + r = 2n, statically determinate if stable.`
        : `${counts}: statically indeterminate to degree ${degree} if stable.`;
  return { code: 'DETERMINACY', severity: 'info', message };
}

function toNodeDisplacements(model: TrussModel, u: ArrayLike<number>): NodeDisplacement[] {
  return model.nodes.map((n, k) => ({ nodeId: n.id, ux: u[2 * k]!, uy: u[2 * k + 1]! }));
}

function modelExtent(model: TrussModel): number {
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function maxAbs(v: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < v.length; i++) m = Math.max(m, Math.abs(v[i]!));
  return m;
}
