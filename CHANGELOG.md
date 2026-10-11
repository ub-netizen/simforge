# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project foundation: Vite, React, TypeScript (strict), Tailwind CSS, Vitest.
- Homepage with simulator library, methodology overview, example structures and open-source section.
- Structural workspace layout: tool bar, engineering canvas, properties panel, results panel, status bar.
- Engineering canvas with world coordinates in metres, adaptive grid, axes, scale bar,
  scroll-wheel zoom, pan (middle-drag, Space + drag, Pan tool), fit view and grid toggle.
- Unit-tested viewport transform utilities.
- Hash-based routing so direct links and refreshes work on GitHub Pages.
- 2D truss solver (direct stiffness method): element stiffness, assembly, DOF partitioning with
  support settlements, LDLᵀ factorisation, member forces/stresses/strains, reactions.
- Mechanism detection from vanishing pivots, with mechanism mode shapes.
- Input validation and result diagnostics (determinacy, equilibrium residual, conditioning,
  large displacements, buckling caveat).
- Validation suite: 9 hand-derived reference cases plus energy-balance, invariance, superposition
  and stability tests.
- docs/METHODOLOGY.md describing the formulation, assumptions, diagnostics and validation.
- Interactive truss editor: node, member, support and load tools; grid snapping; selection,
  box selection and dragging; properties panel with unit-aware numeric inputs; bulk member
  editing; undo/redo; keyboard shortcuts.
- Analysis in the workspace: Run analysis (R) and optional live mode; stale-result detection.
- Results visualisation: tension/compression colouring, force labels, deformed shape, reactions,
  mechanism modes, error highlighting; results tables and diagnostics.
- Material presets with yield strengths, and a yield factor-of-safety / utilisation view.
- Seven validated example projects, including new Howe roof and cantilever reference cases.
- Project files (.simforge.json, versioned, validated on import), autosave in the browser,
  drag-and-drop open, CSV results export, PNG and SVG image export.
- scripts/crosscheck_truss.py, an independent Python solver for checking exported results.
- Browser tests (Playwright) including WCAG 2.1 A/AA accessibility checks (axe-core) and
  responsive layout checks; README screenshots generated from the tests.
- Keyboard-accessible modelling: add nodes and members by coordinates, find and select items.
- GitHub Actions for CI and GitHub Pages deployment; Dependabot; contributing guide, code of
  conduct, issue and pull request templates.

### Fixed

- Text contrast now meets WCAG AA on every surface.
- Icon-only menu buttons have accessible names on small screens.
- Space activates focused buttons again (it pans only when nothing is focused).
- Fit view keeps the model clear of the floating results panel.
