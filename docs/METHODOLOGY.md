# Engineering methodology: 2D truss solver

This document describes how SimForge analyses plane trusses, the assumptions it
makes, and how the implementation is validated. Source:
[`src/modules/structural/solver/`](../src/modules/structural/solver/).

## Scope and assumptions

The solver performs a **linear static analysis of a pin-jointed plane truss**
by the **direct stiffness method**.

- Members are straight two-node bars joined by frictionless pins. They carry
  axial force only: no bending moment and no shear.
- Material is linear elastic (Hooke's law, σ = E ε).
- Displacements and strains are small, so equilibrium is written on the
  undeformed geometry (first-order theory).
- Loads are point forces applied at nodes. Member self-weight and distributed
  loads are not modelled.
- Supports restrain translation in global x and/or y. Inclined rollers and
  spring supports are not yet supported. Restrained directions may have a
  prescribed displacement (support settlement).

### Not checked

- **Buckling.** Compression members can fail by buckling at loads well below
  their yield strength. The solver reports which members are in compression
  but does not check their stability. Check them separately (for example with
  Euler's formula P_cr = π² E I / (K L)²).
- Yielding, plasticity, fatigue, fracture, connection design.
- Dynamic, thermal and geometrically nonlinear effects.

## Units and sign conventions

All internal quantities are SI: m, N, m², Pa.

| Quantity | Positive direction |
| --- | --- |
| Coordinates, displacements, loads | global +x (right), +y (up) |
| Reactions | force exerted **by the support on the structure**, global +x / +y |
| Member axial force N | tension |

## Formulation

### Element stiffness

For a member from node i to node j with length L and direction cosines
c = (x_j − x_i)/L and s = (y_j − y_i)/L, the element stiffness in global
coordinates, with DOF order [u_i, v_i, u_j, v_j], is

```
           ⎡  c²   cs  −c²  −cs ⎤
kₑ = EA/L  ⎢  cs   s²  −cs  −s² ⎥
           ⎢ −c²  −cs   c²   cs ⎥
           ⎣ −cs  −s²   cs   s² ⎦
```

This is the local bar stiffness (EA/L)[1 −1; −1 1] transformed by Tᵀ k T with
T = [c s 0 0; 0 0 c s].

### Assembly

Node k owns global DOFs 2k (x) and 2k + 1 (y). Each kₑ is added into the
global stiffness matrix K (2n × 2n) at its members' DOFs. Several loads on
the same node are summed into F.

### Boundary conditions

The DOFs are partitioned into free (f) and restrained (s) sets:

```
⎡K_ff K_fs⎤ ⎡u_f⎤   ⎡F_f      ⎤
⎣K_sf K_ss⎦ ⎣u_s⎦ = ⎣F_s + R_s⎦
```

u_s holds the prescribed support displacements (zero unless a settlement is
given), and R_s the unknown reactions. The free displacements satisfy

```
K_ff u_f = F_f − K_fs u_s
```

### Solution

K_ff is symmetric, and for positive EA it is positive semi-definite. It is
**positive definite exactly when the structure is stable**, meaning it cannot
move without stretching a member. SimForge therefore factorises it with a
square-root-free Cholesky decomposition, K_ff = L D Lᵀ, and solves by forward
and back substitution. The stiffness matrix is never explicitly inverted.

If a pivot of D vanishes (pivot ≤ 10⁻¹⁰ × the original diagonal entry), that
degree of freedom has no stiffness given the preceding ones, and the
structure is reported as **unstable**. The factorisation continues past a
vanishing pivot, so every independent mechanism is found. For each one the
solver returns a **mechanism mode**, a displacement pattern u with K_ff u = 0,
obtained by solving Lᵀ u = e_k.

This detects instability that counting rules miss, such as collinear
members meeting at an unbraced joint, or supports whose reactions are all
parallel or concurrent.

A pivoted LU fallback was considered and rejected. For this problem a failed
Cholesky pivot is the instability diagnosis, and a general solver would hide
it behind meaningless huge displacements.

### Post-processing

| Result | Formula |
| --- | --- |
| Member axial force | N = (EA/L) [−c −s c s] · [u_i v_i u_j v_j]ᵀ |
| Axial stress | σ = N / A |
| Axial strain | ε = N / (EA) |
| Elongation | ΔL = ε L |
| Reactions | R_s = (K u − F)_s |

## Factor of safety

For members with a yield strength, SimForge reports the factor of safety against
yielding, FoS = σy / |σ|, and the utilisation |σ| / σy. This checks material yield
only:

- **Buckling is not included.** For a compression member the yield FoS is an upper
  bound, and the true capacity can be far lower.
- No partial safety factors, net-section, or connection checks are applied.

### Material presets

Preset values are nominal properties for preliminary analysis and teaching. Design
must use the governing specification, whose values can depend on product form and
thickness.

| Preset | E | σy | Source |
| --- | --- | --- | --- |
| Steel ASTM A36 | 200 GPa | 250 MPa | ASTM A36 minimum yield 36 ksi |
| Steel EN S355 | 210 GPa | 355 MPa | EN 1993-1-1 Table 3.1, t ≤ 40 mm |
| Stainless 304 (annealed) | 193 GPa | 215 MPa | ASM property data |
| Aluminium 6061-T6 | 68.9 GPa | 276 MPa | ASM property data |
| Ti-6Al-4V (annealed) | 113.8 GPa | 880 MPa | ASM property data |

## Diagnostics

Before solving, the model is checked for empty models, duplicate ids, missing
node references, non-finite input, zero-length members, non-positive E or A,
duplicate supports, invalid settlements, and nodes not connected to any member.
Any of these stops the analysis with an `invalid` status.

| Code | Severity | Meaning |
| --- | --- | --- |
| `DETERMINACY` | info | m + r − 2n. Negative means it must be a mechanism; zero means statically determinate if stable; positive is the degree of indeterminacy. |
| `MECHANISM` | error | Zero pivot found; lists the affected nodes and returns mechanism modes. |
| `EQUILIBRIUM` | info / warning | Largest nodal out-of-balance force, computed from member forces, loads and reactions independently of K. Warns above 10⁻⁶ of the largest force. |
| `ILL_CONDITIONED` | warning | Smallest/largest LDLᵀ pivot below 10⁻¹². Usually extreme stiffness contrast. |
| `LARGE_DISPLACEMENT` | warning | Largest displacement above 1% of the structure size; the small-displacement assumption is doubtful. |
| `BUCKLING_NOT_CHECKED` | info | Lists members in compression. |
| `COINCIDENT_NODES`, `DUPLICATE_MEMBER`, `EMPTY_SUPPORT`, `UNCONNECTED_NODE` (fully supported) | warning | Likely modelling mistakes that do not prevent a solution. |
| `NO_LOADS` | info | Nothing is loaded; all results are zero. |

## Validation

### Analytical reference cases

[`src/modules/structural/validation/referenceCases.ts`](../src/modules/structural/validation/referenceCases.ts)
holds problems with closed-form solutions derived by hand (method of joints,
method of sections, compatibility, unit-load method). The derivations are
written next to each case. The solver must reproduce every listed force,
reaction and displacement to a relative tolerance of 10⁻⁹:

1. Single bar in axial tension
2. Symmetric two-bar truss
3. 3-4-5 triangle with horizontal load
4. Statically indeterminate three-bar hanger
5. Three-bar hanger with support settlement (indeterminate: settlement induces forces)
6. Determinate triangle with support settlement (rigid-body motion, zero forces)
7. Warren truss, three panels, including the midspan deflection by the unit-load method
8. Steel and aluminium bars in series
9. Pratt truss, six panels (method of sections)
10. Howe roof truss (method of joints)
11. Cantilever truss from a wall (method of joints)

The seven example projects in the workspace are built from these cases, and
`examples.test.ts` checks every one against its reference solution.

For every case the tests also check:

- global equilibrium (ΣFx, ΣFy, ΣM)
- nodal equilibrium
- **Clapeyron's theorem**: ½ Σ (loads · u + reactions · prescribed u) = Σ N² L / (2EA)
- consistency of stress, strain and elongation

### Property tests

[`analyze.test.ts`](../src/modules/structural/solver/analyze.test.ts) checks
behaviour that must hold for any structure:

- Invariance under rotation and translation of the whole problem, and under
  renumbering of nodes and members or reversing member direction.
- Superposition and linear scaling of loads.
- Detection of mechanisms: an unbraced panel, a truss with a missing diagonal,
  insufficient supports, parallel reactions, collinear members. Every returned
  mechanism mode is checked to be inextensional (no member changes length).

### Independent cross-check

During development the solver was compared against a separate stdlib-only
Python implementation that deliberately uses different numerics: boundary
conditions by row/column elimination, and Gaussian elimination with partial
pivoting on the full system. Five asymmetric cases with no simple closed form
(lateral loads, settlement, a fully pinned indeterminate Pratt truss, mixed
member sections) agreed to a relative difference of at most 6 × 10⁻¹⁵.

A reusable version of this check is in
[`scripts/crosscheck_truss.py`](../scripts/crosscheck_truss.py). It reads a
saved project and the exported member-forces CSV, and reports the largest
difference.

### Mutation checks

To confirm that the tests can catch real defects, deliberate bugs were
injected one at a time. Each one made the suite fail:

- sign error in kₑ
- EA/L² instead of EA/L
- reactions ignoring loads applied at supports
- dropped K_fs u_s term
- off-by-one in back substitution
- disabled zero-pivot detection

## Performance

The solver uses dense matrices (O(n²) memory, O(n³) factorisation). Measured
under Node.js on a development laptop, Warren trusses gave:

| DOFs | Nodes | Time | Relative residual |
| --- | --- | --- | --- |
| 102 | 51 | 3 ms | 7 × 10⁻¹⁴ |
| 402 | 201 | 13 ms | 2 × 10⁻¹² |
| 1,002 | 501 | 131 ms | 2 × 10⁻¹¹ |
| 2,002 | 1,001 | ≈ 1 s | 8 × 10⁻¹¹ |

This comfortably covers interactive use for typical trusses. A banded or
sparse factorisation would be the next step for much larger models.
