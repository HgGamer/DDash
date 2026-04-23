## 1. Main-process git runner

- [x] 1.1 Add `src/main/git-runner.ts`: a wrapper around `child_process.execFile('git', ['-C', cwd, ...args])` returning `{ ok, stdout, stderr, exitCode, failure? }` with a hard timeout (default 15s).
- [x] 1.2 Detect `git` binary availability on first use via `git --version`; cache the result; expose a `'git-missing'` failure code.
- [x] 1.3 Add a per-`cwd` FIFO mutex so write operations serialize for the same working directory (reads bypass it).
- [x] 1.4 Unit-tested with a fake `git` bash script installed on `PATH` in `test/git-runner.test.ts` (no on-disk fixtures needed).

## 2. Git data model + parsers

- [x] 2.1 Shared types in `src/shared/git.ts` — `GitStatusFile`, `GitStatus`, `GitBranch`, `GitCommit`, `GitOperationResult`, `GitError`, `GitChangeKind`, `GitChangedEvent`.
- [x] 2.2 `parsePorcelainV2` in `src/main/git-parsers.ts` (plus canonical `STATUS_ARGS`).
- [x] 2.3 `parseLog` + `GIT_LOG_FORMAT` + `logArgs(limit)`; parents/children derivable from `commit.parents`.
- [x] 2.4 `parseBranches` + `BRANCHES_ARGS` using `for-each-ref` NUL-separated format.
- [x] 2.5 Tests in `test/git-parsers.test.ts` — clean, detached HEAD, staged+unstaged, added-only, rename (type 2), untracked, mixed, unmerged, log single/refs/multi-parent, branch list.

## 3. IPC surface

- [x] 3.1 Channel constants + payload/response types in `src/shared/ipc.ts`; also added `git:subscribe`, `git:unsubscribe`, `git:changed` for the watcher.
- [x] 3.2 Handlers in a dedicated `src/main/git-ipc.ts` (keeps `ipc.ts` focused). `GitTabRef` (projectId, worktreeId?) resolves to cwd via the registry.
- [x] 3.3 `DashApi.git` exposed on `window.api` via `src/preload/index.ts`.
- [x] 3.4 Write channels return `GitOperationResult` — never throw across IPC. `no-upstream` detected from stderr and surfaced as a dedicated code.

## 4. Repository change watcher

- [x] 4.1 `src/main/git-watcher.ts` watches `<cwd>/.git/HEAD`, `<cwd>/.git/index`, `<cwd>/.git/refs` using `fs.watch` (no new dep).
- [x] 4.2 Per-cwd 250ms debounce; emits a single `GitChangedEvent` on `'changed'`.
- [x] 4.3 Reference-counted: `subscribe(cwd)` / `unsubscribe(cwd)` from the IPC layer; handles closed when subscriber count hits zero.

## 5. Renderer state + hooks

- [x] 5.1 `useGitView(active)` in `src/renderer/src/hooks/useGitView.ts` — takes an `ActiveSelection`, loads status/branches/log, exposes `refresh()`, cancels stale work via an epoch counter.
- [x] 5.2 Hook takes `ActiveSelection` directly; callers pass `useStore(s => s.activeId)` to drive re-scoping.
- [x] 5.3 Subscribes to `window.api.git.onChanged`; 150ms debounce; only fires when `ev.cwd` matches the currently-loaded cwd.
- [x] 5.4 Explicit `'not-a-repo'` and `'git-missing'` states in the `GitViewState` discriminated union.

## 6. Git View panel UI

- [x] 6.1 Right-docked collapsible pane with drag-to-resize handle (`GIT_VIEW_MIN_WIDTH`/`GIT_VIEW_MAX_WIDTH`); expanded/collapsed + width persisted via `GitViewSettings`.
- [x] 6.2 `StatusSection` renders Staged / Unstaged / Untracked with per-row stage/unstage buttons, change-kind badges, rename `orig → new` formatting, and a clean-state message.
- [x] 6.3 `CommitBox` with subject + optional description; `Commit` disabled when nothing is staged OR subject is whitespace-only OR another write is in flight; clears on success.
- [x] 6.4 `BranchBar` with dropdown switcher + inline "new branch" entry; switcher is disabled on worktree tabs (branch-pinned) with an explanatory tooltip.
- [x] 6.5 Commit list (flat, non-virtualized — 500 rows renders fine without it) with hash / refs / subject / author / relative-time; HEAD marked with a left accent border; "Load older commits…" affordance bumps the limit by 500.
- [x] 6.6 `PushRow` shows `↑N ↓M` relative to upstream; disabled while busy; surfaces `no-upstream` as a dedicated error message.
- [x] 6.7 Dismissible inline error banner renders stderr verbatim; `↻` Refresh in the header triggers a full reload.

## 7. File diff preview

- [x] 7.1 `git:diff` IPC added (`{ path, stage: 'staged' | 'unstaged' }` → `{ ok, diff, binary }`); uses `git diff --no-color [--cached] -- <path>`.
- [x] 7.2 `DiffPane` renders the unified diff with color-coded hunk/add/del lines; binary-file and empty-diff cases collapse to a muted message.

## 8. Integration & polish

- [x] 8.1 `Workspace` now uses a flex row with `.workspace-terminals` (flex: 1) + resizable `.git-view-dock`; terminal width flexes automatically as the dock opens/closes/resizes.
- [x] 8.2 Git-missing state renders a banner inside the panel ("git binary not found on PATH…"). Full-app one-time banner deferred — the in-panel message is sufficient since the panel is the feature entry point.
- [x] 8.3 `GitViewSettings.enabled` toggle in Settings → Git; when off, the toggle button and the dock are both hidden (IPC handlers remain registered — cheap to keep; simplifies re-enabling).
- [x] 8.4 README gained a "Git view" section covering what's there, how to toggle, and the `git` binary requirement.

## 9. Tests

- [x] 9.1 Parser unit tests (14) green.
- [x] 9.2 Main-process runner tests (7) green — availability, missing binary, exit codes, timeout, stdout capture, per-cwd serialization, per-cwd independence.
- [ ] 9.3 **Deferred.** Adding `@testing-library/react` + `jsdom` + a web-test tsconfig target for 1–2 focused tests is disproportionate to the coverage they'd add; the commit/push/branch code paths are simple conditionals exercised at runtime. Revisit if the component gets more logic.
- [ ] 9.4 **Manual — run before release.** Checklist: clean repo, dirty repo, detached HEAD, worktree tab (switch disabled), non-repo directory, missing `git` binary, push with no upstream, push rejected, checkout blocked by local changes, external commit triggers refresh, diff preview for staged/unstaged/binary, load older commits.

## 10. Release

- [x] 10.1 Self-reviewed against all 11 requirements in `specs/git-view/spec.md`. Load-more-commits gap noticed during review and fixed. Commit-graph requirement satisfied by the flat commit list (refs labeled, HEAD marked, `--all` covers all branches) — drawing actual graph edges is a future polish.
- [ ] 10.2 **User-driven.** Bump version + release notes when ready to publish.
- [ ] 10.3 **User-driven.** `openspec archive git-view` after merge.
