#!/usr/bin/env python3
"""Independent cross-check of SimForge truss results (development tool).

Solves a SimForge project file with a separate, deliberately different
implementation of the direct stiffness method, and optionally compares the
member forces with a CSV exported from SimForge.

  * Boundary conditions: rows/columns of restrained DOFs are eliminated and
    replaced by a unit diagonal (prescribed displacements moved to the RHS),
    instead of SimForge's free/restrained partitioning.
  * Linear solve: Gaussian elimination with partial pivoting on the full
    2n x 2n system, instead of SimForge's LDLT factorisation of K_ff.

Uses only the Python standard library (3.8+).

Usage:
  python3 scripts/crosscheck_truss.py model.simforge.json
  python3 scripts/crosscheck_truss.py model.simforge.json model-member-forces.csv

With a CSV the exit status is 0 when every axial force agrees to within the
relative tolerance (default 1e-9 of the largest force), and 1 otherwise.
"""
import argparse
import csv
import json
import math
import sys


def solve(model):
    index = {n["id"]: i for i, n in enumerate(model["nodes"])}
    ndof = 2 * len(model["nodes"])
    K = [[0.0] * ndof for _ in range(ndof)]
    F = [0.0] * ndof

    elements = []
    for m in model["members"]:
        i, j = index[m["nodeI"]], index[m["nodeJ"]]
        a, b = model["nodes"][i], model["nodes"][j]
        length = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
        c, s = (b["x"] - a["x"]) / length, (b["y"] - a["y"]) / length
        k = m["E"] * m["A"] / length
        dofs = [2 * i, 2 * i + 1, 2 * j, 2 * j + 1]
        T = [-c, -s, c, s]  # k_e = (EA/L) T^T T
        for p in range(4):
            for q in range(4):
                K[dofs[p]][dofs[q]] += k * T[p] * T[q]
        elements.append((m["id"], dofs, T, k))

    for load in model["loads"]:
        i = index[load["nodeId"]]
        F[2 * i] += load["fx"]
        F[2 * i + 1] += load["fy"]

    fixed = {}
    for sup in model["supports"]:
        i = index[sup["nodeId"]]
        if sup["restrainX"]:
            fixed[2 * i] = sup.get("settlementX", 0.0)
        if sup["restrainY"]:
            fixed[2 * i + 1] = sup.get("settlementY", 0.0)

    A = [row[:] for row in K]
    rhs = F[:]
    for d, value in fixed.items():
        for r in range(ndof):
            if r != d:
                rhs[r] -= A[r][d] * value
        for r in range(ndof):
            A[r][d] = 0.0
            A[d][r] = 0.0
        A[d][d] = 1.0
        rhs[d] = value

    M = [A[r][:] + [rhs[r]] for r in range(ndof)]
    scale = max((abs(K[r][r]) for r in range(ndof)), default=1.0)
    for col in range(ndof):
        pivot = max(range(col, ndof), key=lambda r: abs(M[r][col]))
        if abs(M[pivot][col]) <= 1e-12 * scale:
            raise SystemExit("The stiffness matrix is singular: the structure is unstable (a mechanism).")
        M[col], M[pivot] = M[pivot], M[col]
        for r in range(col + 1, ndof):
            f = M[r][col] / M[col][col]
            if f:
                for c_ in range(col, ndof + 1):
                    M[r][c_] -= f * M[col][c_]
    u = [0.0] * ndof
    for r in range(ndof - 1, -1, -1):
        u[r] = (M[r][ndof] - sum(M[r][c_] * u[c_] for c_ in range(r + 1, ndof))) / M[r][r]

    forces = {mid: k * sum(T[p] * u[d] for p, d in enumerate(dofs)) for mid, dofs, T, k in elements}
    reactions = {d: sum(K[d][c_] * u[c_] for c_ in range(ndof)) - F[d] for d in fixed}
    return u, forces, reactions, index


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("project", help="SimForge project file (.simforge.json)")
    parser.add_argument("csv", nargs="?", help="member forces CSV exported from SimForge")
    parser.add_argument("--tol", type=float, default=1e-9, help="relative tolerance (default 1e-9)")
    args = parser.parse_args()

    with open(args.project, encoding="utf-8") as fh:
        project = json.load(fh)
    if project.get("format") != "simforge.truss":
        raise SystemExit("Not a SimForge truss project.")
    model = project["model"]
    u, forces, reactions, index = solve(model)

    print(f"{project.get('name', 'Untitled')}: {len(model['nodes'])} nodes, {len(model['members'])} members")
    print(f"{'member':<10}{'N (kN)':>16}")
    for mid, n in forces.items():
        print(f"{mid:<10}{n / 1e3:>16.6f}")
    print(f"{'node':<10}{'Rx (kN)':>16}{'Ry (kN)':>16}")
    for sup in model["supports"]:
        i = index[sup["nodeId"]]
        rx = reactions.get(2 * i)
        ry = reactions.get(2 * i + 1)
        fmt = lambda v: f"{v / 1e3:>16.6f}" if v is not None else f"{'free':>16}"
        print(f"{sup['nodeId']:<10}{fmt(rx)}{fmt(ry)}")

    if not args.csv:
        return 0

    with open(args.csv, newline="", encoding="utf-8") as fh:
        rows = {row["member"]: float(row["axial_force_kN"]) * 1e3 for row in csv.DictReader(fh)}
    if set(rows) != set(forces):
        print("Member ids in the CSV do not match the project.", file=sys.stderr)
        return 1
    scale = max(max(abs(v) for v in forces.values()), 1e-300)
    worst = max(abs(rows[m] - forces[m]) for m in forces) / scale
    ok = worst <= args.tol
    print(f"\nLargest difference from the SimForge CSV: {worst:.2e} of max |N|  ->  {'AGREE' if ok else 'DISAGREE'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
