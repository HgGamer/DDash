# Changelog

All notable changes to Dash are documented here.

## Unreleased

### Added
- **Linear-inspired visual refresh.** A new design-token layer (`styles/tokens.css`)
  drives colors, typography, spacing, radii, motion, and focus rings across the
  whole renderer. The project sidebar gains monogram avatars, worktree/attention
  count chips, an accent leading indicator on the active row, persisted
  expand/collapse per project, and an empty-state with an "Add project" CTA.
- **In-app Docs panel (markdown viewer).** Open it from the new **Docs** button in
  the workspace header to browse and read a project's markdown files
  (`*.md` / `*.markdown`, up to three directories deep). Content is parsed with
  `marked`, sanitised with `dompurify`, code blocks are syntax-highlighted on
  demand (lazy-loaded `highlight.js`), headings get anchors for in-document
  navigation, external links open in the OS browser, and relative images resolve
  safely within the project root. File access is scoped to the project root with
  a path-traversal guard and a 2 MB read limit. The panel width is persisted.
- **Toast notifications.** A single-at-a-time transient toast (`toast({ … })`),
  used by the new workspace-creation flow.
- **Restructured "New workspace" dialog.** Three sections (Base branch → Name →
  Path), a recently-used-branches shortcut (persisted per project, capped at 5),
  inline name validation, verbatim inline git errors on failure, and a success
  toast that links back to the dialog.

### Changed
- Settings modal and all remaining renderer surfaces (git/diff/commit/stash
  views, todos, integrated terminal, update banner, status bar) migrated onto the
  shared design tokens.
- The view toggles (Docs / Terminal / Todos / Git) now live in the workspace
  header rather than the status bar.

### Fixed
- **Board “Main + stack” layout now fills the workspace at any window count.**
  It was locked to two columns, so a fourth window went into a 1 + 3 split.
  Columns are now sized from the window count (2 → halves, 3 → main column plus a
  stack of two, 4 → 2×2, 5 → main plus two stacks of two …) and every column is
  filled top to bottom, leaving no empty space. In the tile layout a part-filled
  last row now stretches across the leftover columns instead of leaving a gap.
- `JsonStore.flush()` now drains any debounce-timer-triggered write before
  resolving, removing a race where a write could still be in flight after flush.

### Notes
- **Breaking for custom CSS theme overrides:** renderer chrome variable names
  changed (now `--color-*` tokens). The xterm terminal theming layer is
  unchanged. A single dark theme ships; a light theme may follow later.
