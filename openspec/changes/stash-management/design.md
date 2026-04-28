## Context

The Git View today supports two selection kinds in its detail/diff area: a working-tree file (showing its unstaged or staged diff) and a commit from the graph (showing the commit's changed files and per-file diffs). All git operations go through main-process wrappers around the `git` binary, exposed to the renderer over IPC, with a per-working-directory write queue serializing mutating commands.

Stash is the obvious gap: users have to leave Dash, run `git stash` in a terminal, and come back blind. Beyond `git stash list`, the feature also needs `push` (with optional message and `--include-untracked`), `pop`, `apply`, `drop`, and `show -p <ref>` for diff preview — each with the same error-surface and serialization behavior as the existing operations.

The existing `git-view` spec already encodes the selection-mutual-exclusion pattern (selecting a commit clears working-tree-file selection and vice versa). Stash entries are a third selection kind that needs to slot into the same model.

## Goals / Non-Goals

**Goals:**

- A first-class Stashes section in the Git View, mirroring the existing patterns for working-tree status and commit graph (selection, detail view, per-file diff, refresh, error banner).
- Apply / Pop / Drop with sensible feedback, including a destructive-action confirmation for Drop.
- A diff preview that reuses the existing unified-diff renderer.
- Stash list refresh on the same triggers as other git data, including external `.git` mutations.

**Non-Goals:**

- Conflict resolution UI for an apply/pop that conflicts. Surfacing the error and refreshing status is enough for v1; the user resolves conflicts via the existing working-tree flow.
- Branching from a stash (`git stash branch`). Out of scope.
- Partial stash — selecting hunks/files to stash. Stash captures the whole working tree (optionally with untracked) for v1.
- Stash editing (re-message, re-order). Stashes are immutable in this design.
- Showing parent commit context for a stash (the index/HEAD parent diff) — only the working-tree-vs-stash-base diff that `git stash show -p` produces.

## Decisions

### Stash entries form a new selection kind, peer to commit and working-tree file

The selection state in the renderer is extended from `{ kind: 'workingFile' | 'commit', ... }` to also include `{ kind: 'stash', ref: 'stash@{N}' }`. Selecting any one kind clears the others. This keeps the detail/diff area a single-tenant view and reuses the existing rapid-selection-supersession logic for diff loads.

**Alternative considered:** A separate side-panel modal for stash diffs. Rejected — it would split the diff renderer's state between two surfaces and create UI inconsistencies with how commits and working files behave.

### Stash refs are addressed by stack index, not by stash SHA

`git stash` operations accept `stash@{N}` refs, and the UI shows the stack. We pass `stash@{N}` through to git rather than resolving each entry to its commit SHA. This is simpler and matches what the user sees, but it means the renderer must refresh the stash list eagerly after any stash mutation (since `stash@{N}` indices shift on push/pop/drop), and selections are tracked by ref + a snapshot of the stash's commit SHA so we can detect "selected stash no longer exists."

**Trade-off:** A renderer holding a stale `stash@{2}` ref between refreshes could in principle apply/drop the wrong entry if an external mutation reshuffled the stack. Mitigation: every write action re-resolves the entry's commit SHA and aborts with an error banner if the SHA at `stash@{N}` no longer matches the SHA the renderer was looking at.

**Alternative considered:** Track only by commit SHA, resolve to `stash@{N}` at call time by walking `git stash list`. Equivalent safety, more code; deferred unless the simple approach proves fragile.

### Diff preview uses `git stash show -p <ref>`

`git stash show -p stash@{N}` produces a unified diff in the format the existing renderer already consumes. We do not synthesize the diff from `git diff` against parent commits.

**Alternative considered:** `git diff stash@{N}^ stash@{N}` to compare against the stash base. Rejected — this misses the untracked-files component that `--include-untracked` stashes carry as a third parent. `stash show -p` handles all three parts (index + working tree + untracked) consistently.

### Drop requires confirmation; Apply and Pop do not

Drop is the only stash action that destroys data with no recovery path inside Dash (the stash commit is unreachable after drop and will be garbage-collected). Apply and Pop are recoverable: a bad apply can be undone by `git reset`, and a bad pop is recoverable from the reflog if needed.

**Alternative considered:** Confirmation on Pop too. Rejected — adds friction for the common case (the whole point of `pop` is to apply-and-cleanup). The risk of accidental Pop is low because the action is per-row and the row remains visible until success.

### Stash writes join the existing per-repo serialization queue

The git-view spec already serializes writes per working directory. Stash push/pop/apply/drop are mutating, so they're queued through the same mechanism. No new queue.

### Stash creation is a dialog, not an inline form

Creating a stash needs three inputs: optional message, include-untracked toggle, and Confirm/Cancel. A modal dialog matches the existing Commit dialog pattern and keeps the Stashes list density tight.

## Risks / Trade-offs

- **Stale `stash@{N}` between refreshes** → Mitigated by re-resolving the SHA at write time and aborting on mismatch. Worst case the user gets an explicit error rather than the wrong action being applied.
- **Conflicted apply/pop has no in-app resolution UI** → Surfaced as an error banner with a refreshed status showing the conflicted files; user resolves with the existing stage/unstage/working-tree flow. Acceptable for v1.
- **`git stash` does not capture `.gitignore`-d files even with `--include-untracked`** → Out of scope; we document the option as "include untracked" matching git's wording.
- **Watcher noise** → `.git/refs/stash` and `.git/logs/refs/stash` change on every stash op. The existing debounce on `.git` changes handles this; if the debounce is too coarse, may need a tighter coalesce, but defer until observed.

## Migration Plan

No data migration. Feature is additive — Stashes section appears in the Git View; existing flows are unchanged. Rollback is a code revert; no on-disk state is introduced.

## Open Questions

- Where does the Stashes section sit in the Git View layout? Below the commit graph, above it, or as a tab? Defer to UI iteration; the spec is layout-agnostic.
- Should the Stash dialog default the "include untracked" toggle on or off? Lean off (matches `git stash push` default), revisit if users ask.
