# Contributing to SimForge

Thanks for your interest in SimForge. It aims to be a trustworthy engineering tool
for students, so contributions are held to one rule above all:

> **Never fabricate engineering results.** Every number SimForge shows must come
> from a documented method and be checked against an independently derived result.

## Ways to help

- **Validation cases:** a truss with a hand-derived solution (method of joints,
  sections, unit-load method) is one of the most valuable contributions.
- **Bug reports:** attach the `.simforge.json` file (File → Save project). For a
  wrong result, include the value you expected and how you got it.
- **Features and new simulators:** open an issue first to agree on the method,
  assumptions and scope.
- **Documentation, accessibility and interface improvements.**

## Development setup

Requirements: Node.js 20.19+ (the project uses 24, see `.nvmrc`), and Google
Chrome for the browser tests.

```bash
git clone <repository-url>
cd simforge
npm install
npm run dev        # http://localhost:5173/simforge/
```

Before opening a pull request, run:

```bash
npm run typecheck
npm run test       # unit and validation tests
npm run test:e2e   # builds, then runs browser and accessibility tests
```

CI runs the same checks on every pull request.

## Code organisation

- Engineering calculations are **plain TypeScript with no React**, kept under
  `src/modules/<module>/solver` (and `src/utils` for shared numerics). React
  components only display results and collect input.
- Models are stored and solved in **SI units**. Conversion to display units (kN,
  MPa, mm…) happens only at the interface, through `src/utils/units.ts`.
- The truss editor is a pure reducer (`editor/editorState.ts`). Every edit is an
  action, which keeps undo/redo and testing simple.
- TypeScript runs in strict mode with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Please keep it compiling cleanly.

## Adding a validation case

1. Derive the solution by hand: forces, reactions and ideally a displacement.
2. Add it to `src/modules/structural/validation/referenceCases.ts`, with the
   derivation summarised in a comment next to the data, as the existing cases do.
   The expected values must come from your derivation, never from running the
   solver.
3. `npm run test`. The suite checks forces, reactions and displacements to 10⁻⁹,
   plus equilibrium and the energy balance, for every case.
4. If it is a good teaching example, add it to `examples/examples.ts`. The example
   tests then check it as well.

## Changing the solver

- Explain the engineering reasoning in the pull request, and update
  `docs/METHODOLOGY.md`.
- Add tests that would fail without your change.
- Keep diagnostics honest: if a result may be unreliable (instability,
  ill-conditioning, large displacements), say so to the user rather than hiding it.

## Adding a simulator

New simulators get a folder under `src/modules/`, an entry in
`src/modules/registry.ts`, and a route in `src/app/App.tsx`. Keep the registry status
honest:

- **`planned`**: nothing is implemented yet.
- **`in-development`**: the simulator works but is not validated.
- **`available`**: the simulator is functional and validated.

The shared `EngineeringCanvas` component provides the pan/zoom grid view.

## Pull requests

- Keep each pull request focused on one change, with a clear description of what
  changed and how you verified it. The PR template has a short checklist.
- Update `CHANGELOG.md` under "Unreleased" for user-visible changes.
- By contributing, you agree that your contributions are licensed under the
  project's [MIT License](LICENSE), and you agree to follow the
  [Code of Conduct](CODE_OF_CONDUCT.md).
