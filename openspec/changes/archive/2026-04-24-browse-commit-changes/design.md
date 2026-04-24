## Context

The Git View already ships a commit graph (`git log` → parsed rows) and a working-tree diff viewer. Both pieces are in `src/renderer/src/components/GitView.tsx`; the backend is a thin wrapper around `git` in `src/main/git-ipc.ts` using per-channel IPC handlers and a shared types module (`src/shared/`). The commit-graph rows are rendered but do not currently respond to clicks.

The working-tree diff pane (`DiffPane` area of `GitView.tsx`) already knows how to render a unified diff string via `parseUnifiedDiff`. Reusing that renderer keeps visual consistency and avoids a second diff parser.

## Goals / Non-Goals

**Goals:**
- Click a commit row → see its metadata and changed-file list.
- Click a changed file → see the per-file diff for that commit.
- Reuse the existing unified-diff renderer.
- Keep the working-tree status/staging UI reachable; commit browsing is an overlay/toggle, not a modal that locks the panel.

**Non-Goals:**
- No commit editing (revert, cherry-pick, reset, amend) — read-only browsing only.
- No side-by-side diff view; stick with the existing unified view.
- No blame, no file-at-revision viewer (just the patch introduced by that commit).
- No diff between arbitrary commits (A..B range) — single-commit diffs only.
- No search / filter in the commit detail.

## Decisions

### D1: Two IPC calls — list of files first, diff on demand

Add one IPC channel to return the list of paths changed in a commit (via `git show --name-status --no-renames=false <hash>` or `git diff-tree --no-commit-id --name-status -r <hash>`), and extend diff to accept `{ commit, path }` so file diffs load only when the user clicks a file.

**Alternative considered:** a single channel returning the full patch for all files at once. Rejected — large commits (100+ files, e.g. lockfile refreshes, generated code) would push megabytes of text through IPC on every click, and the user typically only looks at 1-3 files.

### D2: Extend `GitDiff` rather than add `GitDiffCommit`

Keep diff behind one IPC channel by adding optional `commit` to `GitDiffArgs`. When `commit` is set, the main process runs `git show --no-color --format= <commit> -- <path>` (or equivalently `git diff <commit>^ <commit> -- <path>` with special-case handling for the root commit). When `commit` is absent, behavior is unchanged (working-tree diff).

**Alternative considered:** a separate `GitDiffAtCommit` channel. Rejected — the renderer-side `DiffPane` would either branch on which channel to call or need two parallel components. One channel, one component stays simpler.

### D3: Selection state lives in `GitView`, not globally

Add `selectedCommit: string | null` to the GitView component's local state alongside `selectedFile`. The two are mutually exclusive-ish: selecting a commit shows the commit detail in the diff area; selecting a working-tree file shows the working-tree diff. Only one is visible at a time; clicking in one clears the other.

**Alternative considered:** persist selected commit across tab switches. Rejected — switching tabs already discards the graph and reloads per-repo state; persisting a commit selection across repos is meaningless and across tab reloads is marginal value.

### D4: Commit detail renders *above* the diff viewer, inside the same pane

The commit detail view (metadata + file list) and the per-file diff share the existing DiffPane region. Metadata + file list on top; when a file is picked, the diff replaces / fills the lower portion. Escape closes commit detail and returns to the previous view.

### D5: Handle the root commit

The root commit has no parent. For root commits, use `git show --root <hash> -- <path>` (or `git diff-tree --root` for the file list). The main process detects this case via `git rev-parse <hash>^` failure, not by a separate UI codepath.

### D6: Renamed files

`git show --name-status` reports renames as `R<score>\t<old>\t<new>`. The file list SHALL display both paths (matching the existing working-tree renderer behavior). The diff call uses the *new* path.

## Risks / Trade-offs

- **Very large commits** (lockfiles, vendored trees) produce slow `git show` output → Mitigation: list-files call is cheap (`diff-tree --name-status` doesn't emit patch text); per-file diff call only runs on click. A large single-file diff (e.g. a 2MB lockfile) still streams through IPC as-is; the existing working-tree diff path has the same characteristic and no size guard, so matching that behavior for v1 is acceptable.
- **Binary files** in commit diffs → Reuse the existing binary-detection check (`/^Binary files .* differ$/m`). Same UI as working-tree binary case.
- **Stale selection after force-push / history rewrite** → If the selected commit hash no longer exists after a refresh, clear the selection and fall back to "no commit selected." Don't show a stale detail view.
- **Concurrency**: the user can click fast between commits. Track the request by hash and drop responses that don't match the current selection (same pattern already used in the working-tree `DiffPane` effect).

## Migration Plan

No migration. Additive only — existing Git View users see new interactivity on the commit graph; nothing changes for users who never click a commit.
