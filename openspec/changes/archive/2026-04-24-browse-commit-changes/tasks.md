## 1. Shared types and IPC channels

- [x] 1.1 Add `GitShowCommit` channel constant and extend the `GitDiff` args type (in `src/shared/`) with an optional `commit: string` field
- [x] 1.2 Add `GitShowCommitArgs` and `GitShowCommitResult` types: args `{ projectId, worktreeId, commit }`; result `{ ok: true, commit: { hash, authorName, authorEmail, authorDate, message }, files: Array<{ path: string, oldPath?: string, kind: 'added'|'modified'|'deleted'|'renamed' }> } | { ok: false, error: string }`

## 2. Main process (git backend)

- [x] 2.1 Implement `IPC.GitShowCommit` handler in `src/main/git-ipc.ts`: run `git show --name-status --format=%H%n%an%n%ae%n%aI%n%B <hash>` (or equivalent two-call split) and parse into the `GitShowCommitResult` shape
- [x] 2.2 Detect root commit (no parent) and use `git show --root` / `git diff-tree --root` so all files are reported as added
- [x] 2.3 Extend `IPC.GitDiff` handler: when `args.commit` is set, run `git show --no-color --format= <commit> -- <path>`; keep root-commit handling (`--root`); keep existing binary detection
- [x] 2.4 Add the new channel to the teardown/cleanup list alongside the other `IPC.Git*` channels

## 3. Preload

- [x] 3.1 Expose `window.api.git.showCommit(args)` on the preload bridge
- [x] 3.2 Confirm the existing `window.api.git.diff` signature accepts the new optional `commit` field (type update only; call site is already generic)

## 4. Renderer — commit detail view

- [x] 4.1 Add `selectedCommit: string | null` state to `GitView`; wire a click handler on commit-graph rows that toggles selection
- [x] 4.2 Ensure selecting a commit clears `selectedFile` (working-tree selection) and vice versa
- [x] 4.3 Build a `CommitDetail` subcomponent that fetches via `showCommit` and renders metadata (full hash, author, date, full message) and the changed-file list with change-kind labels; show both paths for renames
- [x] 4.4 Track requests by commit hash and drop stale responses (mirroring the pattern in the existing working-tree `DiffPane` effect)
- [x] 4.5 Surface stderr as an in-panel error banner when `showCommit` fails; render nothing stale

## 5. Renderer — commit-scoped diff

- [x] 5.1 Extend the existing `DiffPane` (or add a `CommitDiffPane` that wraps it) to accept an optional `commit` prop and pass it to `git.diff`
- [x] 5.2 Reuse `parseUnifiedDiff` + the existing diff row renderer; no new diff parser
- [x] 5.3 Keep the existing binary-file indicator and loading/error states
- [x] 5.4 Track the in-flight request by `(commit, path)` and drop responses that don't match the current pair

## 6. Selection lifecycle

- [x] 6.1 On commit-graph refresh, if `selectedCommit` is no longer present in the new log, clear the selection silently (no error banner)
- [x] 6.2 On tab switch, reset `selectedCommit` alongside other per-tab state

## 7. Styling

- [x] 7.1 Style the commit-row hover + selected states in the graph
- [x] 7.2 Style the commit detail view (metadata block + file list) to match the existing diff pane look
- [x] 7.3 Ensure the detail view is scrollable independently of the file-list and diff regions when the commit has many files

## 8. Manual QA

- [x] 8.1 Click a commit with a handful of changes: metadata + file list render, click a file → diff renders
- [x] 8.2 Click the root commit: all files shown as added, diffs render against the empty tree
- [x] 8.3 Click a commit with a rename: both paths shown, diff loads against the new path
- [x] 8.4 Click a commit with a binary change: binary indicator (not raw bytes)
- [x] 8.5 Rapidly click between commits and between files within a commit: only the latest selection's diff is shown, no flicker of stale content
- [x] 8.6 Force-push to rewrite history while a commit is selected: selection clears silently after refresh
- [x] 8.7 Switch tabs with a commit selected: selection resets in the new tab
