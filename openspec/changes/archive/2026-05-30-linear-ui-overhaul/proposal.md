## Why

Dash's current UI is functional but visually dated: the project sidebar, worktree management, and settings modal all use ad-hoc styling that doesn't scale as more views (git, todos, web access, integrated terminal) accumulate. Users want the calm, dense, keyboard-driven feel of Linear.app — clear typography hierarchy, restrained color, snappy interactions, and consistent navigation. In addition, two concrete capability gaps surfaced from real use:

- **Creating a "workspace" (worktree) is clumsy**: the new-worktree modal is hidden, the branch-picker is bare, and there's no clear visual link between a project and its worktrees once created.
- **There is no way to read project documentation inside the app**: users have to leave Dash to look at READMEs, design notes, plans, or AGENTS.md. A first-class markdown viewer keeps the loop closed.

This change rebuilds the visual layer around a Linear-style design system and fills those two gaps. It is the scaffold subsequent UI work (settings reorg, command palette, etc.) will build on, so we want one disciplined pass rather than incremental drift.

## What Changes

- **Visual design system**: introduce a Linear-inspired token set (typography scale, neutral grays, single accent, 4 / 8 / 12 / 16 spacing, subtle borders over heavy fills, 6–8px corner radii, 150ms ease transitions). All existing renderer components migrate onto these tokens. **BREAKING** for users who customised the theme via CSS overrides — variable names change.
- **Project list (sidebar) redesign**: tighter row density, clearer active/hover/focus states, monogram avatars, inline counts (worktrees / unread attention), drag handle on hover, grouping when the list grows past ~8 projects, empty state with prominent "Add project" CTA.
- **Workspace (worktree) creation flow**: new dialog with three-step layout (pick base branch → name the workspace → confirm path), recently-used branches surfaced, inline validation, persistent toast on success linking to the new tab. Tab grouping in the sidebar visually nests a project's workspaces and shows a roll-up status.
- **Markdown viewer**: new in-app pane that renders a project file's markdown (README.md, AGENTS.md, anything under the project root) with Linear-style typography, syntax-highlighted code blocks, anchored headings, and click-through internal links. Opens from a sidebar action and from a new "Docs" tab strip in the workspace header.
- **Settings modal refresh**: convert the existing modal to the new design system with a left-rail nav and right-side content card; no requirement changes, just visuals.
- **Micro-interactions**: 150ms transitions on hover/focus, focus-visible rings, subtle elevation on active rows, keyboard navigation polish (sidebar arrow keys, `g p` / `g w` jump shortcuts deferred to a follow-up).

Non-goals: command palette, full keyboard-driven nav, multi-account, and remote-only mode are out of scope and tracked separately.

## Capabilities

### New Capabilities
- `markdown-viewer`: render markdown files from a project's filesystem inside Dash, with safe link handling and code-block syntax highlighting; openable from the workspace header and the project's context menu.
- `visual-design-system`: a shared CSS token layer (colors, typography, spacing, radius, motion) consumed by every renderer view, so individual components no longer hard-code values.

### Modified Capabilities
- `project-workspace`: sidebar list rendering, workspace (worktree) nesting, and active-tab visuals change; the underlying tab/session requirements stay the same.
- `project-worktrees`: the worktree creation flow gains a structured multi-step UX requirement (base branch → name → path) and a recently-used-branches affordance.

## Impact

- **Code**: `src/renderer/src/styles.css` (token layer + reset), every component under `src/renderer/src/components/` (sidebar, workspace header, settings modal, new-worktree modal, git panels), new components `MarkdownViewer.tsx` + supporting hook(s).
- **Dependencies**: add a markdown parser + sanitiser (proposing `marked` + `dompurify`, or `react-markdown` with `rehype-sanitize` — pick in design) and a small syntax-highlight lib (proposing `highlight.js` with a curated language set; tradeoffs in design).
- **State**: no schema-level changes to `app-state.json`; the markdown viewer may add a transient "last opened doc per project" field (decided in design).
- **APIs / IPC**: one new IPC pair for reading a markdown file safely scoped to a project's root (`docs:read`); listing markdown files under a project (`docs:list`). No changes to existing channels.
- **Tests**: visual regressions are out of scope, but `MarkdownViewer` gets unit tests for sanitisation + link handling. Existing tests for registry/worktrees are unaffected.
- **User-visible**: existing custom-theme exports will keep working at the xterm layer; the renderer chrome will look different. A short migration note in the release announcement.
