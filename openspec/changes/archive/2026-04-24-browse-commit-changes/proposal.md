## Why

The Git View's commit graph currently lets users see commits (hash, subject, author, time, branch tips) but clicking a commit does nothing. When a user wants to understand what landed in a past commit — to review their own work, investigate a regression, or catch up on a collaborator's changes — they have to leave Dash and run `git show <hash>` in a terminal. Making commits inspectable in-place closes an obvious interaction loop and matches what every mainstream Git UI (GitHub, GitKraken, Fork, VS Code) does.

## What Changes

- Clicking a commit in the Git View's commit graph selects it and opens a **commit detail view** showing the commit's metadata (full hash, author, date, full message) and the list of files changed in that commit (path + change kind: added / modified / deleted / renamed).
- Clicking a file in the commit detail view shows the file's diff at that commit (the patch introduced by `git show <hash> -- <path>`), rendered with the existing unified-diff viewer used for working-tree diffs.
- Selecting a different commit (or the same commit a second time) toggles the detail view; the working-tree status / staging UI remains reachable.
- A new `GitShowCommit` IPC channel returns the changed-files list for a commit; `GitDiff` is extended (or a sibling channel added) to return the diff for a specific path at a specific commit.

## Capabilities

### New Capabilities

_None — this extends an existing capability rather than introducing a new one._

### Modified Capabilities

- `git-view`: adds requirements for selecting a commit from the graph, displaying that commit's metadata and changed-file list, and viewing per-file diffs at that commit.

## Impact

- **Renderer**: `src/renderer/src/components/GitView.tsx` — commit row click handler, new `CommitDetail` / `CommitDiffPane` components, selection state, reuse of `parseUnifiedDiff` + diff renderer.
- **Main**: `src/main/git-ipc.ts` — new handler for "show commit" (changed files) and extension of the diff handler to accept a commit ref + path.
- **Shared**: `src/shared/` — new IPC channel constant(s), request/result types for commit-show and commit-scoped diff.
- **Preload**: `src/preload/` — expose the new IPC method on `window.api`.
- No new runtime dependencies. Still relies on the system `git` binary already required by Git View.
