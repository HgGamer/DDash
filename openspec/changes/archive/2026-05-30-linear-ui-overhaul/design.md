## Context

Dash today is a multi-tab Electron client for Claude Code. The renderer is a small React + Zustand app (`src/renderer/src`) styled with a single hand-written `styles.css` that mixes component CSS, ad-hoc colors (`#5e5edb`, `#2a2a2e`, `#0c0c0d`, etc.), and inconsistent spacing. New surfaces (worktree UI, stash management, web access settings) have been bolted on without a shared visual language, so the product feels heterogeneous even though the codebase is small.

Linear.app is the user's reference: dense but breathable rows, a near-monochrome palette with a single accent, body text at 13–14px, careful focus rings, 150ms transitions, and consistent left-rail navigation. That target lets us settle on a token system once and apply it everywhere.

The proposal additionally calls for two concrete capability changes: a structured worktree-creation dialog ("workspace creation") and a first-class markdown viewer. Both are renderer-heavy, but the markdown viewer also requires a small main-process IPC pair to read files scoped to a project root (we will not allow arbitrary filesystem reads from the renderer).

Constraints to respect:
- Electron with `contextIsolation: true` and `nodeIntegration: false` — all main-process work happens through the existing IPC layer.
- The xterm.js terminal pane is the visual centre of the app; its own theming is already user-configurable and stays out of this redesign.
- The repository already ships an OpenSpec-managed set of specs (`desktop-shell`, `project-workspace`, `project-worktrees`, etc.). Modifications use delta-spec files; we are not rewriting those specs wholesale.

## Goals / Non-Goals

**Goals:**
- A single CSS token layer (custom properties) that every component consumes. No raw hex codes in component code outside the token file.
- A redesigned project sidebar that handles ≥30 projects without the user losing orientation, with clear hover/active/focus states, monogram avatars, and a roll-up indicator for worktree status.
- A three-step worktree-creation dialog (base branch → name → path) with inline validation and a "recently used branches" affordance.
- An in-app markdown viewer for files inside a project's root, with safe link handling, anchored headings, and code-block highlighting.
- All changes feel native to Electron on macOS, Windows, and Linux (no platform-specific assumptions in the tokens).

**Non-Goals:**
- Command palette / fuzzy navigator (separate change).
- Full keyboard-only navigation across the entire app (a follow-up; this change keeps existing keyboard behaviour and adds focus-visible rings).
- Live-collaborative markdown editing — viewer only.
- Theming UI (light/dark toggle): we ship a single dark theme tuned for the terminal-centric experience. Light mode comes later if there is demand.
- xterm.js theming changes — covered by the existing `terminal-style-settings` capability.

## Decisions

### D1. CSS variables (custom properties) over CSS-in-JS or a runtime theme provider

We adopt a single `src/renderer/src/styles/tokens.css` defining custom properties under `:root` (and a future `[data-theme="light"]` if we add light mode). Components reference `var(--color-fg)` etc. directly; no React context, no styled-components, no Tailwind.

Alternatives considered:
- **Tailwind**: heavy migration for marginal benefit in a tiny renderer, and unfriendly to dynamic xterm theme bleed-through.
- **CSS-in-JS (e.g. emotion)**: adds runtime cost in an Electron app where we already control the CSS pipeline; no clear win.

Rationale: keeps the change purely additive at the CSS layer, easy to audit, no new runtime dependency, and trivial to extend with a light theme later.

### D2. Token surface

The token file exposes (initial values, tunable):

```
--color-bg          #0b0b0c   /* app background */
--color-surface     #131316   /* sidebar, cards */
--color-surface-2   #1a1a1f   /* hover */
--color-border      #25252b
--color-border-strong #36363f
--color-fg          #e6e6ea
--color-fg-muted    #9a9aa3
--color-fg-subtle   #6e6e78
--color-accent      #5e6ad2   /* Linear-ish indigo */
--color-accent-fg   #ffffff
--color-danger      #d8576b
--color-warn        #d9a55b
--color-success     #6ec18b

--font-sans   "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
--font-mono   (existing terminal stack; unchanged)
--text-xs 11px / 16px
--text-sm 12px / 18px
--text-md 13px / 20px   /* default */
--text-lg 15px / 22px
--text-xl 18px / 26px

--space-1 4px  --space-2 8px  --space-3 12px  --space-4 16px  --space-5 24px  --space-6 32px
--radius-sm 4px  --radius-md 6px  --radius-lg 10px
--shadow-pop 0 1px 2px rgba(0,0,0,.4), 0 4px 12px rgba(0,0,0,.32)
--motion-fast 120ms
--motion-base 160ms
--ease-out cubic-bezier(.2,.7,.2,1)

--focus-ring 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)
```

These are deliberate guesses tuned to look right against xterm.js's pure-black terminal background; final values are an implementation detail and may shift inside ±10%.

### D3. Project sidebar layout

Single-column sidebar, default width 260px (existing window state already persists sidebar width; we keep the storage key). Row anatomy:

```
[avatar 20px] [name + meta]                                [counts][⋮]
              [secondary line: branch or path tail]
```

- Hover: `background: var(--color-surface-2)`.
- Active: `background: var(--color-surface-2)` plus a 2px `var(--color-accent)` left border.
- Worktrees nest one level (12px indent, branch icon, branch name as primary text). A project with worktrees gains a chevron that expands/collapses; collapsed state persists per project in the existing store.
- Counts chip on the right shows unread-attention count (existing `needsAttention` machinery) styled as a small pill.
- Drag handle visible only on hover, reorder behaviour unchanged.

Empty state: centred illustration-free block with "No projects yet" and an "Add project" button using the existing `MenuAddProject` channel.

### D4. Workspace creation dialog

Replace `NewWorktreeModal` content with three vertically stacked sections inside a single card:

1. **Base branch** — search-as-you-type combo over `git.listLocalBranches` plus a header showing the 3 most recently used branches (persisted to a small `recentBranches: string[]` array on the project record, capped at 5).
2. **Name** — text input, default derived from the branch name, inline validation (no slashes outside `feature/`-style prefixes; uniqueness against existing worktree branches).
3. **Path** — read-only path preview using existing `computeDefaultPath`; an "Advanced" toggle lets the user override the path (existing behaviour).

Footer: "Create" (primary), "Cancel" (ghost). Success path closes the modal, switches to the new tab, and shows a transient toast (new `Toast` component, 4-second auto-dismiss, max one visible at a time).

### D5. Markdown viewer

- **Library choice**: `marked` (a 35KB parser, no React deps, very fast) + `dompurify` for sanitisation. We avoid `react-markdown` because the tree of `rehype-*` plugins is overkill for our needs and balloons the bundle.
- **Syntax highlighting**: `highlight.js` with `common` language pack only; lazy-loaded via dynamic import the first time a code block renders, so the markdown viewer doesn't pay the cost until used.
- **Sanitisation policy**: allow `<a>` (only `http(s):` and `mailto:` schemes), `<img>` (only `file://` resolved against project root, or `https:` from the network — the latter goes through Electron's default content policy), no `<script>`, no inline event handlers. Hash links (`#heading-id`) scroll within the viewer.
- **File access**: two new IPC channels under a `docs:` prefix.
  - `docs:list({ projectId })` → `{ files: { relPath, mtime, size }[] }` walks the project root with depth ≤ 3 and a hard 200-entry cap, filtering to `.md` / `.markdown`.
  - `docs:read({ projectId, relPath })` → `{ contents }` reads the file after resolving and asserting `path.resolve(projectRoot, relPath)` starts with `projectRoot` (path-traversal guard).
- **Image resolution**: relative image `src` paths are rewritten to `file://<absolute>` before sanitisation.
- **UI placement**: a "Docs" button in the workspace header opens a slide-over panel from the right (similar to the existing git panel) showing the file list on top and the rendered content below. Width is persisted in window state.

### D6. Toast component

Generic singleton-style `Toast` element mounted at the App root. API:

```ts
toast({ message: string; tone?: 'info' | 'success' | 'error'; action?: { label: string; onClick: () => void } })
```

Single visible toast at a time; new toasts replace existing ones. No queueing in this iteration.

### D7. Migration approach

We migrate component-by-component, leaving the old `styles.css` rules in place until each component is converted, so the app stays visually coherent during the work:

1. Add `tokens.css` and import it before `styles.css`.
2. Convert `Sidebar` first (highest visual surface area).
3. Convert `Workspace` header.
4. Convert `SettingsModal`.
5. Add `MarkdownViewer` + `Toast` (greenfield).
6. Replace `NewWorktreeModal` content.
7. Sweep remaining components (`GitDiff*`, `StashViewer`, `UpdateBanner`).
8. Delete dead rules from old `styles.css`.

Each step ships as its own commit so review stays manageable.

## Risks / Trade-offs

- **Risk**: New tokens look fine in isolation but clash visually next to xterm.js's pure-black terminal. → **Mitigation**: keep app background slightly off-black (`#0b0b0c`) so the terminal area gets a subtle frame; we'll spot-check on macOS, Windows, and Linux dev builds before merging the sidebar step.
- **Risk**: Markdown sanitisation accidentally strips legitimate content (e.g. tables) and frustrates users. → **Mitigation**: enable `dompurify`'s default whitelist plus tables/anchors; add a small fixture-based unit test for each tag class we care about.
- **Risk**: `highlight.js` bundle size adds noticeable cold-start cost. → **Mitigation**: lazy-load via dynamic import only on first code block; common pack is ~70KB minified+gzipped which is acceptable for an Electron app.
- **Risk**: Workspace dialog refactor regresses worktree creation (the most-used path in the app). → **Mitigation**: keep the existing `worktree:create` IPC unchanged; only the renderer surface changes; smoke-test create/remove on macOS before merging.
- **Trade-off**: Single dark theme only. Users who liked the previous palette get a different look with no opt-out. We accept this for cohesion — partial migrations are worse than a single jump.
- **Trade-off**: We pick `marked` + `dompurify` (2 small deps) over `react-markdown` (1 dep + ecosystem). The former is leaner; the latter has more idiomatic React integration. Bundle-size and audit-surface win here.

## Migration Plan

1. Land `tokens.css` and the new `Toast` + `MarkdownViewer` components behind a feature-detect — `MarkdownViewer` is reachable only via the new workspace-header button, so unused code costs nothing.
2. Convert components in the order above; each conversion is a discrete PR step.
3. After the sidebar conversion, internally announce the new look so feedback is captured early.
4. No data migration needed: `recentBranches` defaults to `[]` and is populated as the user creates worktrees.
5. Rollback: revert the conversion commits; tokens file can remain (it's additive).

## Open Questions

- Do we adopt the Inter typeface? It is not bundled with the OS on Windows; either ship it as a webfont (~50KB woff2) or fall back to system sans. **Recommendation**: ship Inter Variable; fonts already feel hot-path enough.
- Do we want a "pinned project" affordance now or in a follow-up? Linear pins items. **Recommendation**: defer; the redesign already adds workspace creation and markdown viewer.
- Should the markdown viewer be reachable for files outside the project root (e.g., a global onboarding doc)? **Recommendation**: not in this change; project-scoped only.
