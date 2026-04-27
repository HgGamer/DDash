## Why

Worktree management is currently split across surfaces: the sidebar exposes "+ New worktree" and the Git View only pins the active tab's branch, leaving create/list/delete actions hidden behind the sidebar's per-project menu. Users working primarily inside the Git View have no way to see sibling worktrees or remove them without leaving the panel, which contradicts the panel's role as the repository's control surface.

## What Changes

- Add a Worktrees section to the Git View that lists every worktree of the active tab's repository (the project's primary tree plus all registered sibling worktrees), showing each worktree's branch, path, current-HEAD short hash, and whether it is the active tab.
- Surface a "+ New worktree" action in the Git View that opens the existing `NewWorktreeModal` pre-scoped to the active tab's project.
- Surface a per-row Remove action in the Git View list that runs the existing `git worktree remove` flow, including the dirty-worktree second confirmation and explicit `--force` opt-in.
- Allow activating a worktree from the Git View list — clicking a non-active row switches the active tab to that worktree (creating its tab if it is not already open).
- Keep the sidebar's existing "+ New worktree" affordance unchanged; this change adds a second entry point inside the Git View, it does not remove the sidebar one.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `git-view`: adds requirements for a Worktrees section that lists, creates, removes, and activates worktrees for the active repository.
- `project-worktrees`: adds a requirement that worktree create/remove actions are reachable from the Git View, in addition to the existing sidebar entry points (no change to underlying create/remove semantics).

## Impact

- Renderer: `src/renderer/src/components/GitView.tsx` gains a Worktrees section; reuses `NewWorktreeModal.tsx`. May add a small `WorktreeList.tsx` subcomponent.
- Renderer state: uses existing `useStore` worktree records and `setActiveTab`-equivalent action; no new persisted state.
- IPC: reuses existing `window.api.worktrees.{create,remove,list,listLocalBranches,computeDefaultPath}`. No new main-process handlers expected; if per-worktree HEAD short-hash is not already exposed, a small read-only addition to `git-ipc.ts` may be needed.
- No changes to `project-worktrees` data model, persistence, or default-path logic.
- No breaking changes.
