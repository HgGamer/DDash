## Why

Dash's Git panel covers stage, commit, push, branch switching, and history browsing, but offers no way to set work aside without committing it. Users currently have to drop to a terminal to `git stash`, then come back to Dash blind to what was saved. Adding first-class stash management — list, push, pop, apply, drop, with diff preview — closes that gap and keeps the "everything in one window" promise.

## What Changes

- Add a Stashes section to the Git View that lists existing stashes for the active repository, each entry showing its index, message, branch context, and relative timestamp.
- Add a "Stash changes" action that captures the working tree (with optional message and an option to include untracked files) into a new stash entry.
- Add per-entry actions on each stash: **Apply** (apply without removing), **Pop** (apply then drop), and **Drop** (delete without applying). Drop SHALL require explicit confirmation.
- Add a diff preview for the selected stash entry, rendered with the same unified-diff renderer used for working-tree and commit diffs, listing changed files and per-file diff on click.
- Surface failures (dirty tree blocking apply/pop, merge conflicts, empty stash) in the existing in-panel error banner pattern.
- Refresh the stash list on the same triggers as other Git View data (active-tab change, panel focus, `.git` change debounce, manual refresh).

## Capabilities

### New Capabilities

- `git-stash`: Stash management within the Git View — listing, creating, applying, popping, dropping, and previewing stash entries for the active tab's repository.

### Modified Capabilities

- `git-view`: Selection model extended so that a stash entry, like a commit or working-tree file, can be the active selection driving the detail/diff area. Automatic refresh and write-serialization requirements extend to stash operations.

## Impact

- **Code**: New IPC handlers and main-process git wrappers for `git stash list/push/pop/apply/drop/show`. New renderer components for the stash list, stash detail, and stash-create dialog. Changes to the Git View selection state machine to accommodate a third selection kind (stash entry) alongside working-tree file and commit.
- **APIs**: New preload IPC surface for stash operations.
- **Dependencies**: None expected — uses the existing `git` binary resolution.
- **Systems**: The per-repo write-serialization queue gains stash write operations as members.
