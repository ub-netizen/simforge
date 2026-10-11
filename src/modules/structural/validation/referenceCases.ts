/**
 * Reference problems with independently derived closed-form solutions.
 *
 * Each expected value below comes from hand analysis (method of joints,
 * compatibility, or the unit-load method), NOT from running the solver. The
 * derivations are summarised next to each case so they can be checked.
 *
 * Units: N, m, Pa. Tension positive; reactions act on the structure.
 */
import type { TrussModel } from '../models/truss';

export interface ReferenceCase {
  id: string;
  title: string;
  model: TrussModel;
  expected: {
    /** Member id → axial force, N. */
    axialForces: Record<string, number>;
    /** Node id → reaction components, N. */
    reactions?: Record<string, { rx: number; ry: number }>;
    /** Node id → displacement components, m. Omitted components are not checked. */
    displacements?: Record<string, { ux?: number; uy?: number }>;
  };
}

const STEEL_E = 200e9; // Pa
const AREA = 1e-3; // m² (10 cm²)
const EA = STEEL_E * AREA; // 2e8 N
const P = 10e3; // N

const bar = (id: string, nodeI: string, nodeJ: string, E = STEEL_E, A = AREA) => ({ id, nodeI, nodeJ, E, A });
const pin = (nodeId: string) => ({ nodeId, restrainX: true, restrainY: true });
const rollerY = (nodeId: string) => ({ nodeId, restrainX: false, restrainY: true });

// ---------------------------------------------------------------------------
// 1. Single horizontal bar, axial load
//    u = P L / (EA), N = P, reaction at the pin = −P.
// ---------------------------------------------------------------------------
const L1 = 3;
const singleBar: ReferenceCase = {
  id: 'single-bar',
  title: 'Single bar under axial tension',
  model: {
    nodes: [
      { id: '1', x: 0, y: 0 },
      { id: '2', x: L1, y: 0 },
    ],
    members: [bar('a', '1', '2')],
    supports: [pin('1'), rollerY('2')],
    loads: [{ nodeId: '2', fx: P, fy: 0 }],
  },
  expected: {
    axialForces: { a: P },
    reactions: { '1': { rx: -P, ry: 0 }, '2': { rx: 0, ry: 0 } },
    displacements: { '2': { ux: (P * L1) / EA, uy: 0 } },
  },
};

// ---------------------------------------------------------------------------
// 2. Symmetric two-bar truss (pins at (±b, 0), apex at (0, h), load P down)
//    Joint equilibrium at the apex: 2 N sin α = −P  ⇒  N = −P / (2 sin α).
//    Unit-load method: δ = Σ N n L / (EA) = P L / (2 EA sin² α), downward.
//    Pin reactions: R_y = P/2 each; R_x = ±P b / (2h) (pushed outward).
// ---------------------------------------------------------------------------
const b2 = 2;
const h2 = 1.5;
const L2 = Math.hypot(b2, h2); // 2.5 m
const sin2 = h2 / L2;
const twoBar: ReferenceCase = {
  id: 'two-bar',
  title: 'Symmetric two-bar truss',
  model: {
    nodes: [
      { id: 'A', x: -b2, y: 0 },
      { id: 'B', x: b2, y: 0 },
      { id: 'C', x: 0, y: h2 },
    ],
    members: [bar('AC', 'A', 'C'), bar('BC', 'B', 'C')],
    supports: [pin('A'), pin('B')],
    loads: [{ nodeId: 'C', fx: 0, fy: -P }],
  },
  expected: {
    axialForces: { AC: -P / (2 * sin2), BC: -P / (2 * sin2) },
    reactions: { A: { rx: (P * b2) / (2 * h2), ry: P / 2 }, B: { rx: (-P * b2) / (2 * h2), ry: P / 2 } },
    displacements: { C: { ux: 0, uy: -(P * L2) / (2 * EA * sin2 * sin2) } },
  },
};

// ---------------------------------------------------------------------------
// 3. 3-4-5 right-angle triangle, horizontal load at the top
//    Nodes 1 (0,0) pin, 2 (4,0) roller (y), 3 (4,3); load P in +x at node 3.
//    ΣM₁: 4 R₂y − 3P = 0 ⇒ R₂y = 3P/4.  ΣFy ⇒ R₁y = −3P/4.  ΣFx ⇒ R₁x = −P.
//    Joint 2: N₁₂ = 0, N₂₃ = −R₂y = −3P/4.  Joint 3 (x): P − (4/5) N₁₃ = 0 ⇒ N₁₃ = 5P/4.
//    Compatibility (u₁ = v₁ = v₂ = 0):
//      e₁₂ = u₂ = 0;  e₂₃ = v₃ = N₂₃·3/EA;  e₁₃ = (4u₃ + 3v₃)/5 = N₁₃·5/EA.
// ---------------------------------------------------------------------------
const N23 = (-3 * P) / 4;
const N13 = (5 * P) / 4;
const v3 = (N23 * 3) / EA;
const u3 = ((5 * N13 * 5) / EA - 3 * v3) / 4;
const triangle: ReferenceCase = {
  id: 'triangle-345',
  title: '3-4-5 triangle with horizontal load',
  model: {
    nodes: [
      { id: '1', x: 0, y: 0 },
      { id: '2', x: 4, y: 0 },
      { id: '3', x: 4, y: 3 },
    ],
    members: [bar('12', '1', '2'), bar('23', '2', '3'), bar('13', '1', '3')],
    supports: [pin('1'), rollerY('2')],
    loads: [{ nodeId: '3', fx: P, fy: 0 }],
  },
  expected: {
    axialForces: { '12': 0, '23': N23, '13': N13 },
    reactions: { '1': { rx: -P, ry: (-3 * P) / 4 }, '2': { rx: 0, ry: (3 * P) / 4 } },
    displacements: { '2': { ux: 0, uy: 0 }, '3': { ux: u3, uy: v3 } },
  },
};

// ---------------------------------------------------------------------------
// 4. Statically indeterminate three-bar hanger
//    Free node D at (0, 0) carries P downward. Pins at (−a, h), (0, h), (a, h)
//    with a = h tan θ. Compatibility: outer elongation = δ cos θ.
//    Equilibrium: N_c + 2 N_o cos θ = P, with N_c = EA δ / h and
//    N_o = EA δ cos² θ / h  ⇒  δ = P h / (EA (1 + 2 cos³ θ)),
//    N_c = P / (1 + 2 cos³ θ),  N_o = P cos² θ / (1 + 2 cos³ θ).
// ---------------------------------------------------------------------------
const h4 = 2;
const theta = Math.PI / 6; // 30°
const a4 = h4 * Math.tan(theta);
const cos4 = Math.cos(theta);
const denom4 = 1 + 2 * cos4 ** 3;
const threeBar: ReferenceCase = {
  id: 'three-bar-hanger',
  title: 'Statically indeterminate three-bar hanger',
  model: {
    nodes: [
      { id: 'D', x: 0, y: 0 },
      { id: 'L', x: -a4, y: h4 },
      { id: 'M', x: 0, y: h4 },
      { id: 'R', x: a4, y: h4 },
    ],
    members: [bar('DL', 'D', 'L'), bar('DM', 'D', 'M'), bar('DR', 'D', 'R')],
    supports: [pin('L'), pin('M'), pin('R')],
    loads: [{ nodeId: 'D', fx: 0, fy: -P }],
  },
  expected: {
    axialForces: { DM: P / denom4, DL: (P * cos4 ** 2) / denom4, DR: (P * cos4 ** 2) / denom4 },
    reactions: {
      M: { rx: 0, ry: P / denom4 },
      // An outer bar in tension pulls its pin towards D, so the support pushes
      // back away from D: R = N · (unit vector D → pin). For L that is (−sin θ, cos θ).
      L: { rx: -((P * cos4 ** 2) / denom4) * Math.sin(theta), ry: ((P * cos4 ** 2) / denom4) * cos4 },
      R: { rx: ((P * cos4 ** 2) / denom4) * Math.sin(theta), ry: ((P * cos4 ** 2) / denom4) * cos4 },
    },
    displacements: { D: { ux: 0, uy: -(P * h4) / (EA * denom4) } },
  },
};

// ---------------------------------------------------------------------------
// 5. Three-bar hanger, settlement Δ of the middle support, no load
//    Centre elongation = δ − Δ, outer elongation = δ cos θ (δ, Δ downward).
//    ΣFy at D: N_c + 2 N_o cos θ = 0  ⇒  δ = Δ / (1 + 2 cos³ θ),
//    N_c = −EA Δ 2 cos³ θ / (h (1 + 2 cos³ θ)),  N_o = EA Δ cos² θ / (h (1 + 2 cos³ θ)).
// ---------------------------------------------------------------------------
const delta5 = 1e-3; // 1 mm downward
const threeBarSettlement: ReferenceCase = {
  id: 'three-bar-settlement',
  title: 'Three-bar hanger with support settlement',
  model: {
    ...threeBar.model,
    supports: [pin('L'), { nodeId: 'M', restrainX: true, restrainY: true, settlementY: -delta5 }, pin('R')],
    loads: [],
  },
  expected: {
    axialForces: {
      DM: (-EA * delta5 * 2 * cos4 ** 3) / (h4 * denom4),
      DL: (EA * delta5 * cos4 ** 2) / (h4 * denom4),
      DR: (EA * delta5 * cos4 ** 2) / (h4 * denom4),
    },
    displacements: { D: { ux: 0, uy: -delta5 / denom4 }, M: { ux: 0, uy: -delta5 } },
  },
};

// ---------------------------------------------------------------------------
// 6. Statically determinate triangle with settlement of the roller
//    A determinate structure follows a settlement as a rigid body: no member
//    forces and no reactions. Settlement v₂ = −Δ rotates it about node 1 by
//    φ = −Δ/4 (small rotation): node 3 (4, 3) moves (−φ·3, φ·4).
// ---------------------------------------------------------------------------
const delta6 = 0.01;
const phi6 = -delta6 / 4;
const triangleSettlement: ReferenceCase = {
  id: 'triangle-settlement',
  title: 'Determinate triangle with support settlement',
  model: {
    ...triangle.model,
    supports: [pin('1'), { nodeId: '2', restrainX: false, restrainY: true, settlementY: -delta6 }],
    loads: [],
  },
  expected: {
    axialForces: { '12': 0, '23': 0, '13': 0 },
    reactions: { '1': { rx: 0, ry: 0 }, '2': { rx: 0, ry: 0 } },
    displacements: { '2': { ux: 0, uy: -delta6 }, '3': { ux: -phi6 * 3, uy: phi6 * 4 } },
  },
};

// ---------------------------------------------------------------------------
// 7. Warren truss, 3 panels × 4 m, depth 3 m, P down at each top node
//    Bottom 0 (0,0), 1 (4,0), 2 (8,0), 3 (12,0); top 4 (2,3), 5 (6,3), 6 (10,3).
//    Diagonals have length √13; sin α = 3/√13, cos α = 2/√13. R₀ = R₃ = 1.5P.
//    Method of joints:
//      joint 0: N₀₄ = −(√13/2) P,  N₀₁ = P
//      joint 4: N₄₁ = (√13/6) P,   N₄₅ = −(4/3) P
//      joint 1: N₁₅ = −(√13/6) P,  N₁₂ = (5/3) P
//    and symmetric counterparts. Midspan (node 5) deflection by the unit-load
//    method (unit load at node 5 alone):
//      δ₅ = Σ N n L / (EA) = (P/EA) (148/9 + 65√13/18).
//    Horizontal displacements: the roller lets node 3 slide, so it moves by the
//    total bottom-chord elongation, u₃ = (4P + 4·5P/3 + 4P)/EA = 44P/(3EA).
//    The symmetric solution (u = 0 on the centre line) shifted rigidly so that
//    node 0 stays put gives u₅ = u₃ / 2 = 22P/(3EA).
// ---------------------------------------------------------------------------
const r13 = Math.sqrt(13);
const warren: ReferenceCase = {
  id: 'warren-3-panel',
  title: 'Warren truss, three panels',
  model: {
    nodes: [
      { id: '0', x: 0, y: 0 },
      { id: '1', x: 4, y: 0 },
      { id: '2', x: 8, y: 0 },
      { id: '3', x: 12, y: 0 },
      { id: '4', x: 2, y: 3 },
      { id: '5', x: 6, y: 3 },
      { id: '6', x: 10, y: 3 },
    ],
    members: [
      bar('01', '0', '1'),
      bar('12', '1', '2'),
      bar('23', '2', '3'),
      bar('45', '4', '5'),
      bar('56', '5', '6'),
      bar('04', '0', '4'),
      bar('41', '4', '1'),
      bar('15', '1', '5'),
      bar('52', '5', '2'),
      bar('26', '2', '6'),
      bar('63', '6', '3'),
    ],
    supports: [pin('0'), rollerY('3')],
    loads: ['4', '5', '6'].map((nodeId) => ({ nodeId, fx: 0, fy: -P })),
  },
  expected: {
    axialForces: {
      '01': P,
      '12': (5 * P) / 3,
      '23': P,
      '45': (-4 * P) / 3,
      '56': (-4 * P) / 3,
      '04': (-r13 / 2) * P,
      '63': (-r13 / 2) * P,
      '41': (r13 / 6) * P,
      '26': (r13 / 6) * P,
      '15': (-r13 / 6) * P,
      '52': (-r13 / 6) * P,
    },
    reactions: { '0': { rx: 0, ry: 1.5 * P }, '3': { rx: 0, ry: 1.5 * P } },
    displacements: {
      '3': { ux: (44 * P) / (3 * EA), uy: 0 },
      '5': { ux: (22 * P) / (3 * EA), uy: -(P / EA) * (148 / 9 + (65 * r13) / 18) },
    },
  },
};

// ---------------------------------------------------------------------------
// 8. Two bars in series with different stiffness (axial springs in series)
//    Load P at the free end: N = P in both; u₂ = P L₁ / (E₁A₁),
//    u₃ = u₂ + P L₂ / (E₂A₂).
// ---------------------------------------------------------------------------
const E8 = 70e9; // aluminium
const A8 = 4e-4;
const series: ReferenceCase = {
  id: 'series-bars',
  title: 'Steel and aluminium bars in series',
  model: {
    nodes: [
      { id: '1', x: 0, y: 0 },
      { id: '2', x: 2, y: 0 },
      { id: '3', x: 3.5, y: 0 },
    ],
    members: [bar('s', '1', '2'), bar('al', '2', '3', E8, A8)],
    supports: [pin('1'), rollerY('2'), rollerY('3')],
    loads: [{ nodeId: '3', fx: P, fy: 0 }],
  },
  expected: {
    axialForces: { s: P, al: P },
    reactions: { '1': { rx: -P, ry: 0 } },
    displacements: { '2': { ux: (P * 2) / EA }, '3': { ux: (P * 2) / EA + (P * 1.5) / (E8 * A8) } },
  },
};

// ---------------------------------------------------------------------------
// 9. Pratt truss, 6 panels × 3 m, depth 3 m, P down at top nodes x = 6, 9, 12
//    Bottom nodes b0…b6 at x = 0…18; top nodes t1…t5 at x = 3…15, y = 3.
//    Diagonals slope down towards midspan. R = 1.5P at each support.
//    Joint b0: N(b0–t1) sin 45° = −1.5P ⇒ −1.5√2 P;  N(b0–b1) = 1.5P.
//    Joint b1 (unloaded, one vertical): N(b1–t1) = 0.
//    Section through panel 3, moments about t2 (6, 3):
//      −1.5P·6 + 3·N(b2–b3) = 0 ⇒ N(b2–b3) = 3P.
//    Section through panel 4, moments about b3 (9, 0):
//      −1.5P·9 + P·3 − 3·N(t3–t4) = 0 ⇒ N(t3–t4) = −3.5P.
//    Joint t3 (no diagonals, load P): N(b3–t3) = −P.
// ---------------------------------------------------------------------------
const prattNodes = [
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: `b${i}`, x: 3 * i, y: 0 })),
  ...[1, 2, 3, 4, 5].map((i) => ({ id: `t${i}`, x: 3 * i, y: 3 })),
];
const prattMembers = [
  ...[0, 1, 2, 3, 4, 5].map((i) => bar(`b${i}-b${i + 1}`, `b${i}`, `b${i + 1}`)),
  ...[1, 2, 3, 4].map((i) => bar(`t${i}-t${i + 1}`, `t${i}`, `t${i + 1}`)),
  ...[1, 2, 3, 4, 5].map((i) => bar(`b${i}-t${i}`, `b${i}`, `t${i}`)),
  bar('b0-t1', 'b0', 't1'),
  bar('b6-t5', 'b6', 't5'),
  bar('t1-b2', 't1', 'b2'),
  bar('t2-b3', 't2', 'b3'),
  bar('t4-b3', 't4', 'b3'),
  bar('t5-b4', 't5', 'b4'),
];
const pratt: ReferenceCase = {
  id: 'pratt-6-panel',
  title: 'Pratt truss, six panels',
  model: {
    nodes: prattNodes,
    members: prattMembers,
    supports: [pin('b0'), rollerY('b6')],
    loads: ['t2', 't3', 't4'].map((nodeId) => ({ nodeId, fx: 0, fy: -P })),
  },
  expected: {
    axialForces: {
      'b0-t1': -1.5 * Math.SQRT2 * P,
      'b6-t5': -1.5 * Math.SQRT2 * P,
      'b0-b1': 1.5 * P,
      'b1-t1': 0,
      'b5-t5': 0,
      'b2-b3': 3 * P,
      'b3-b4': 3 * P,
      't3-t4': -3.5 * P,
      't2-t3': -3.5 * P,
      'b3-t3': -P,
    },
    reactions: { b0: { rx: 0, ry: 1.5 * P }, b6: { rx: 0, ry: 1.5 * P } },
  },
};

// ---------------------------------------------------------------------------
// 10. Howe roof truss, span 12 m, rise 3 m, P down at the three top nodes
//     Bottom 0 (0,0), 1 (3,0), 2 (6,0), 3 (9,0), 4 (12,0); top 5 (3,1.5),
//     6 (6,3), 7 (9,1.5). Rafter slope: sin θ = 1/√5, cos θ = 2/√5. R = 1.5P each.
//     Joint 0: N₀₅ sin θ = −1.5P ⇒ N₀₅ = −1.5√5 P;  N₀₁ = −N₀₅ cos θ = 3P.
//     Joint 1: N₁₅ = 0, N₁₂ = 3P.
//     Joint 5 (x): N₅₆ + N₅₂ = N₅₀;  (y): sin θ (N₅₆ − N₅₂ − N₅₀) = P
//       ⇒ N₅₆ = −√5 P, N₅₂ = −0.5√5 P.
//     Joint 2 (y): N₂₆ + 2 N₂₅ sin θ = 0 ⇒ N₂₆ = P;  (x): N₂₃ = N₂₁ = 3P.
//     Symmetric counterparts follow; joint 6 checks: 2√5P·(1/√5) − 2P = 0.
// ---------------------------------------------------------------------------
const r5 = Math.sqrt(5);
const howe: ReferenceCase = {
  id: 'howe-roof',
  title: 'Howe roof truss',
  model: {
    nodes: [
      { id: '0', x: 0, y: 0 },
      { id: '1', x: 3, y: 0 },
      { id: '2', x: 6, y: 0 },
      { id: '3', x: 9, y: 0 },
      { id: '4', x: 12, y: 0 },
      { id: '5', x: 3, y: 1.5 },
      { id: '6', x: 6, y: 3 },
      { id: '7', x: 9, y: 1.5 },
    ],
    members: [
      bar('01', '0', '1'),
      bar('12', '1', '2'),
      bar('23', '2', '3'),
      bar('34', '3', '4'),
      bar('05', '0', '5'),
      bar('56', '5', '6'),
      bar('67', '6', '7'),
      bar('74', '7', '4'),
      bar('15', '1', '5'),
      bar('26', '2', '6'),
      bar('37', '3', '7'),
      bar('52', '5', '2'),
      bar('72', '7', '2'),
    ],
    supports: [pin('0'), rollerY('4')],
    loads: ['5', '6', '7'].map((nodeId) => ({ nodeId, fx: 0, fy: -P })),
  },
  expected: {
    axialForces: {
      '01': 3 * P,
      '12': 3 * P,
      '23': 3 * P,
      '34': 3 * P,
      '05': -1.5 * r5 * P,
      '74': -1.5 * r5 * P,
      '56': -r5 * P,
      '67': -r5 * P,
      '15': 0,
      '37': 0,
      '26': P,
      '52': -0.5 * r5 * P,
      '72': -0.5 * r5 * P,
    },
    reactions: { '0': { rx: 0, ry: 1.5 * P }, '4': { rx: 0, ry: 1.5 * P } },
  },
};

// ---------------------------------------------------------------------------
// 11. Cantilever truss from a wall, tip load P downward
//     Wall pins 0 (0,0) and 1 (0,2). Bottom 2 (2.5,0), 4 (5,0); top 3 (2.5,2),
//     5 (5,2); tip 6 (7.5,1). L = √7.25 (tip members), D = √10.25 (diagonals).
//     Joint 6: N₄₆ = −PL/2, N₅₆ = PL/2.
//     Joint 5: N₃₅ = N₅₆·2.5/L = 1.25P;  N₄₅ = −N₅₆/L = −P/2.
//     Joint 4: N₃₄ = PD/2;  N₂₄ = N₄₆·2.5/L − N₃₄·2.5/D = −2.5P.
//     Joint 3: N₁₃ = 2.5P;  N₂₃ = −2N₃₄/D = −P.
//     Joint 2: N₁₂ = PD/2;  N₀₂ = N₂₄ − N₁₂·2.5/D = −3.75P.
//     Reactions: R₀ = (3.75P, 0), R₁ = (−3.75P, P).
//     Check ΣM about the origin: R₁ gives +7.5P, the load −7.5P.
// ---------------------------------------------------------------------------
const Lc = Math.sqrt(7.25);
const Dc = Math.sqrt(10.25);
const cantilever: ReferenceCase = {
  id: 'cantilever',
  title: 'Cantilever truss',
  model: {
    nodes: [
      { id: '0', x: 0, y: 0 },
      { id: '1', x: 0, y: 2 },
      { id: '2', x: 2.5, y: 0 },
      { id: '3', x: 2.5, y: 2 },
      { id: '4', x: 5, y: 0 },
      { id: '5', x: 5, y: 2 },
      { id: '6', x: 7.5, y: 1 },
    ],
    members: [
      bar('02', '0', '2'),
      bar('24', '2', '4'),
      bar('13', '1', '3'),
      bar('35', '3', '5'),
      bar('46', '4', '6'),
      bar('56', '5', '6'),
      bar('23', '2', '3'),
      bar('45', '4', '5'),
      bar('12', '1', '2'),
      bar('34', '3', '4'),
    ],
    supports: [pin('0'), pin('1')],
    loads: [{ nodeId: '6', fx: 0, fy: -P }],
  },
  expected: {
    axialForces: {
      '46': (-P * Lc) / 2,
      '56': (P * Lc) / 2,
      '35': 1.25 * P,
      '45': -P / 2,
      '34': (P * Dc) / 2,
      '24': -2.5 * P,
      '13': 2.5 * P,
      '23': -P,
      '12': (P * Dc) / 2,
      '02': -3.75 * P,
    },
    reactions: { '0': { rx: 3.75 * P, ry: 0 }, '1': { rx: -3.75 * P, ry: P } },
  },
};

export const REFERENCE_CASES: readonly ReferenceCase[] = [
  singleBar,
  twoBar,
  triangle,
  threeBar,
  threeBarSettlement,
  triangleSettlement,
  warren,
  series,
  pratt,
  howe,
  cantilever,
];
