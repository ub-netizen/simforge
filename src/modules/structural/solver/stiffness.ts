/**
 * Element-level relations for a 2-node linear elastic truss (bar) element.
 *
 * Local DOF order: [u_i, v_i, u_j, v_j] (global x/y displacements of the
 * start node i and end node j).
 */

export interface MemberGeometry {
  /** m */
  length: number;
  /** Direction cosine (x_j − x_i) / L. */
  c: number;
  /** Direction sine (y_j − y_i) / L. */
  s: number;
}

export function memberGeometry(xi: number, yi: number, xj: number, yj: number): MemberGeometry {
  const dx = xj - xi;
  const dy = yj - yi;
  const length = Math.hypot(dx, dy);
  return { length, c: dx / length, s: dy / length };
}

/**
 * Global element stiffness matrix
 *
 *   kₑ = (EA/L) ⎡  C  −C ⎤ ,   C = ⎡ c²  cs ⎤
 *               ⎣ −C   C ⎦         ⎣ cs  s² ⎦
 *
 * obtained from the local bar stiffness (EA/L)[1 −1; −1 1] transformed by
 * the direction cosines. Returned as a row-major 4 × 4 array.
 */
export function elementStiffness(g: MemberGeometry, E: number, A: number): Float64Array {
  const k = (E * A) / g.length;
  const cc = k * g.c * g.c;
  const cs = k * g.c * g.s;
  const ss = k * g.s * g.s;
  // prettier-ignore
  return Float64Array.of(
     cc,  cs, -cc, -cs,
     cs,  ss, -cs, -ss,
    -cc, -cs,  cc,  cs,
    -cs, -ss,  cs,  ss,
  );
}

/**
 * Axial force from the element's global displacements:
 *
 *   N = (EA/L) [−c  −s  c  s] · [u_i v_i u_j v_j]ᵀ
 *
 * i.e. EA times the axial strain (elongation / L). Positive in tension.
 */
export function axialForce(
  g: MemberGeometry,
  E: number,
  A: number,
  ui: number,
  vi: number,
  uj: number,
  vj: number,
): number {
  const elongation = g.c * (uj - ui) + g.s * (vj - vi);
  return ((E * A) / g.length) * elongation;
}
