# Development checklist

Status of each phase. A box is only ticked once the work is implemented and verified.

## Phase 1 — Foundation

- [x] Vite + React + TypeScript strict mode
- [x] Tailwind CSS v4 design tokens (dark-first)
- [x] Vitest configured, first unit tests
- [x] `/simforge/` base path and hash routing for GitHub Pages
- [x] Homepage: hero, simulator library, methodology, examples, open source
- [x] Workspace layout: toolbar, canvas, properties panel, results panel, status bar
- [x] Canvas viewport: grid, axes, zoom, pan, fit, grid toggle
- [x] README, LICENSE, CHANGELOG, .gitignore

## Phase 2 — Engineering solver

- [x] Typed truss model (nodes, members, supports with settlement, loads), SI units
- [x] Element stiffness matrix
- [x] Global assembly
- [x] Free/constrained DOF partitioning, prescribed displacements
- [x] LDLᵀ (Cholesky) solver with mechanism detection and mechanism modes; no explicit inverse
      (a pivoted LU fallback was rejected: a failed Cholesky pivot *is* the instability diagnosis)
- [x] Member axial forces, stresses, strains, elongations, support reactions
- [x] Diagnostics: invalid input, mechanisms, determinacy, equilibrium residual, conditioning, large displacements, buckling caveat
- [x] Validation against 9 hand-derived reference cases (11 since Phase 5), plus energy, invariance and superposition tests
- [x] One-off independent Python cross-check (stdlib, Gaussian elimination): 5 asymmetric cases agree to ≤ 6 × 10⁻¹⁵.
      A reusable script can be added once JSON export exists (Phase 5).
- [x] Methodology documentation (docs/METHODOLOGY.md)

## Phase 3 — Interactive editor

- [x] Editor state as a pure, tested reducer (the document is the solver's TrussModel, in SI)
- [x] Add/move/delete nodes, snapping to the adaptive grid (Alt bypasses), arrow-key nudging
- [x] Create members between nodes, chained drawing, duplicate prevention
- [x] Supports (pin, roller y, roller x) with settlements, and point loads
- [x] Selection: click, Shift-click, box select, select all; drag to move the selection
- [x] Property editing in engineering units (m, kN, GPa, mm²), including bulk edit of members
- [x] Undo/redo (one step per edit or drag), clear model
- [x] Reusable EngineeringCanvas for future modules
- [x] Browser-level check: 19-step scripted interaction test in headless Chrome (development only, not yet in CI)

## Phase 4 — Results visualisation

- [x] Run analysis (R) wired to the solver; results tied to the analysed model and marked stale after edits
- [x] Optional live mode (re-solve after every edit)
- [x] Diverging tension/compression colouring with width ∝ |N|, zero-force members dashed, force labels
- [x] Deformed shape with automatic 1-2-5 magnification and adjustable multiplier
- [x] Reaction arrows with values
- [x] Mechanism mode display for unstable models; red highlighting of items referenced by errors
- [x] Results tables (displacements, member forces, reactions with Σ check), sortable, click to select
- [x] Diagnostics list with links to the affected items
- [x] Material presets with sources (A36, S355, 304, 6061-T6, Ti-6Al-4V) and custom values
- [x] Yield factor of safety and utilisation view (buckling explicitly not included)
- [x] Browser-level check: the 3-4-5 reference case built through the UI reproduces the hand solution
      (forces, reactions, displacements, FoS), plus stale/undo/live/mechanism behaviour (16 checks)

## Phase 5 — Examples and export

- [x] Seven examples (Examples menu and homepage links), each tied to an analytical reference case and tested
- [x] Two new hand-derived reference cases: Howe roof truss and cantilever truss
- [x] Versioned JSON project format with strict, all-or-nothing import validation (docs/FILE_FORMAT.md)
- [x] Open by file picker, ⌘/Ctrl+O, or drag and drop; save with ⌘/Ctrl+S
- [x] Autosave to browser storage, restored on reload; degrades gracefully when storage is unavailable
- [x] CSV export of member forces, displacements and reactions (units in headers, full precision)
- [x] PNG (2×) and standalone SVG image export with a caption; selection and previews excluded
- [x] scripts/crosscheck_truss.py: reusable independent stdlib Python solver that checks exported results
- [x] Browser-level check: 19 checks including real downloads and the Python cross-check (agreement 1.9 × 10⁻¹²)

## Phase 6 — Quality and release

- [x] Browser tests in the repository: Playwright (`npm run test:e2e`), 18 tests, using the installed Chrome
- [x] Accessibility: axe-core WCAG 2.1 A/AA checks on the homepage, empty workspace and results view (no violations)
  - text colour tokens raised to ≥ 4.5:1 contrast on every surface
  - accessible names for icon-only menu buttons
  - Space no longer hijacked from focused buttons; keyboard-selectable table rows
  - add nodes/members by coordinates; a test builds and analyses a model without the canvas
  - skip link, focus moves with in-page navigation, reduced-motion support
- [x] Responsive: automated overflow checks at 360, 390, 768 and 1024 px; Fit view keeps clear of the results panel
- [x] CONTRIBUTING.md, CODE_OF_CONDUCT.md (Contributor Covenant 2.1), issue and PR templates, docs/FILE_FORMAT.md
- [x] GitHub Actions: ci.yml (PRs, branches) and deploy.yml (main → GitHub Pages); Dependabot
  - YAML parsed locally, and the workflow steps replayed in a clean copy with `npm ci` and `CI=1`.
    The workflows themselves have not run on GitHub yet.
- [x] README with screenshots (generated by `npm run screenshots`)
- [ ] Before publishing: GitHub username (src/app/config.ts), Code of Conduct contact, LICENSE copyright holder
- [ ] Publish repository and site (with approval)
