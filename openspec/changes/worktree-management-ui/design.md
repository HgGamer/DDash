## Context

Worktree creation and removal already work end-to-end through the sidebar:
- `NewWorktreeModal.tsx` drives create via `window.api.worktrees.create` and `listLocalBranches` / `computeDefaultPath`.
- The sidebar's per-project worktree menu drives remove via `window.api.worktrees.remove` (with the dirty-tree second-confirmation dance).
- The `project-worktrees` spec defines the data model, default path computation, dirty-tree force gating, and stale-worktree reconciliation.

The Git View (`GitView.tsx`) is scoped to the active tab's working directory and already knows whether that tab is a worktree (`isWorktreeTab`). It has no surface today for the *set* of worktrees of the underlying repository.

This change adds a Worktrees section to the Git View. It is a UI-only addition: it reuses existing IPC handlers, the existing modal, and the existing remove flow.

## Goals / Non-Goals

**Goals:**
- Make create / list / remove / activate reachable from the Git View, without leaving the panel.
- Reuse the existing `NewWorktreeModal` and `worktrees.remove` flow verbatim — same validation, same dirty-tree force prompt, same error surfacing.
- Show the user where they currently are in the worktree list (active tab marker) and let them jump to a sibling worktree with one click.

**Non-Goals:**
- No change to the worktree data model, default-path logic, or stale-worktree reconciliation.
- No change to the sidebar surface — the sidebar's "+ New worktree" and per-row remove stay as-is.
- Not building a "manage worktrees globally" view; the Git View is always scoped to one repository (the active tab's).
- Not implementing renames / moves / locks / prunes — only the three actions called out in the proposal (create, list, delete) plus activate.

## Decisions

### List source: render from the renderer store, not a new IPC

The renderer's Zustand store already has the project record (including its `worktrees: Worktree[]` array) for the active tab. The Git View can derive the list directly from `useStore` keyed off `active.projectId`, plus a synthetic "primary tree" row representing the project itself. This avoids a redundant `git worktree list` round trip and keeps the list consistent with the sidebar.

*Alternative considered:* call `git worktree list` on every Git View mount. Rejected — registry is the source of truth in this app (per `project-worktrees`), and stale entries are already surfaced as "missing" through reconciliation on launch.

### Per-row HEAD short hash: piggyback on existing git data

For the active tab's row we already have HEAD from `useGitView`. For other rows, showing HEAD requires either (a) running `git -C <path> rev-parse --short HEAD` per worktree, or (b) parsing `git worktree list --porcelain` once. Option (b) is one process per panel mount and returns HEAD for every worktree at once.

*Decision:* add a small read-only IPC `worktrees.listWithHeads(projectId): { id, head }[]` that shells `git worktree list --porcelain` from the project root and joins by path. The Git View calls it once on mount and on refresh; absence of a HEAD (e.g., missing worktree) renders as `—`. Keep the existing `worktrees.list` (registry-only) untouched.

*Alternative considered:* enrich every persisted worktree record with HEAD on launch and update on refresh. Rejected — couples persisted state to a transient value and forces writes on every refresh.

### Activating a worktree from the list

Reuse the same store action the sidebar uses to switch to a worktree tab (creates the tab if missing, then sets it active). The Git View row's click handler dispatches that action; the rest of the app — Git View itself, terminal pane, etc. — follows from the active-tab change as it already does.

### Remove flow

Reuse the sidebar's existing remove handler verbatim, including:
- The first confirm prompt.
- The clean-vs-dirty branch (`git worktree remove` without `--force` first; if git refuses with the dirty-tree error, prompt for explicit force).
- Termination of the worktree's PTY before `git worktree remove` runs.

If the worktree being removed is the active tab, the renderer must select a fallback active tab (project's primary tree) *before* the registry entry is dropped, so the Git View doesn't briefly point at a removed tab. This is the same fallback the sidebar already does on remove; if not, lift the logic into the shared store action.

### Where the UI lives

A new collapsible section at the bottom of the Git View panel, below the commit graph: title "Worktrees", `+ New` button at the right. Each row: branch name, path (truncated, full on hover), short HEAD, and a `…` menu with "Activate" (if not active) and "Remove". The active tab's row is visually marked.

A small new component `WorktreeList.tsx` keeps `GitView.tsx` from getting longer; it takes `(projectId, activeWorktreeId | null)` and the action callbacks.

### Hiding the section when not applicable

- Active tab is not a git repository → entire Git View is already empty-state; section is hidden along with the rest.
- Active tab's project has no worktree records and the project root is not a git repo with the worktree feature → still show the section with just the primary tree row and the `+ New` button (matches the existing "Git project shows the affordance" requirement).

## Risks / Trade-offs

- *Stale `head` after external git activity* → `worktrees.listWithHeads` re-runs on Git View refresh (same triggers as the rest of the panel: tab change, focus, `.git` watcher), so staleness is bounded by the existing refresh cadence.
- *Removing the active-tab worktree* → mitigated by switching to the primary tree first; if the primary tree is itself the active tab and the user picks a sibling worktree to remove, no fallback dance is needed.
- *Two entry points for create* (sidebar + Git View) → minor surface duplication, but both routes call the same modal with the same arguments, so there's no divergence risk.
- *`git worktree list --porcelain` on every panel refresh* → one short-lived process per refresh per repo; negligible. If this becomes a problem it can be debounced with the existing Git View refresh debounce.

## Migration Plan

Pure additive UI change. No data migration; existing worktree records render unchanged. Rollback is reverting the renderer files plus the new IPC handler.

## Open Questions

- Should "Activate" always create a tab if one doesn't exist, or should the Git View only list worktrees that already have tabs? Decision lean: create-on-activate, matching sidebar behavior — confirm during implementation.
- Should the primary tree row be removable from this section? Lean: no — it's the project itself and removal belongs in project management, not worktree management.
