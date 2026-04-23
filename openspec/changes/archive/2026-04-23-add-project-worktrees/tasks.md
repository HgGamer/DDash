## 1. Data model & registry

- [x] 1.1 Add `Worktree` interface (`id`, `branch`, `path`, `addedAt`, `lastOpenedAt`, `order`) to `src/shared/types.ts`
- [x] 1.2 Extend `Project` in `src/shared/types.ts` with `worktrees: Worktree[]` and optional `worktreesRoot?: string`
- [x] 1.3 Update `src/main/registry.ts` loader to default missing `worktrees` to `[]` and missing `worktreesRoot` to undefined; verify atomic-write path still applies
- [x] 1.4 Verify the loader does NOT strip unknown future fields on round-trip (resolves design Q1); if it does, bump registry version and add forward-compat refusal

## 2. Git worktree backend (main process)

- [x] 2.1 Add `src/main/git.ts` with helpers: `isGitRepo(path)`, `listWorktrees(repoPath)`, `addWorktree(repoPath, branch, path, { newBranch })`, `removeWorktree(repoPath, path, { force })` — each shells out to `git` and returns `{ ok, stdout, stderr, exitCode }`
- [x] 2.2 Add `sanitizeBranchForFs(branch)` and `computeDefaultWorktreePath(project, branch)` (with `-2`, `-3`, … collision suffixes) in `src/main/git.ts`
- [x] 2.3 Cache `isGitRepo` per project on registry load; refresh on project add

## 3. PTY session keying

- [x] 3.1 Introduce `compositeKey(projectId, worktreeId | null)` helper in `src/shared/ipc.ts` (or alongside it) — bare `projectId` for primary tree, `${projectId}:${worktreeId}` for worktrees
- [x] 3.2 Update `src/main/pty-session.ts` map keying and all internal lookups to use the composite key
- [x] 3.3 Extend pty IPC payloads (`pty.open`, `pty.write`, `pty.resize`, `pty.onData`, `pty.onExit`, `pty.onError`) and `notify.attention` with optional `worktreeId`; preserve back-compat where `worktreeId` absent ⇒ primary tree
- [x] 3.4 Update `pty.open` to resolve the cwd from the worktree's `path` when `worktreeId` is provided, otherwise from the project's `path`
- [x] 3.5 Mirror the new fields in `src/preload/index.ts`

## 4. Worktree IPC surface

- [x] 4.1 Add main-process IPC handlers in `src/main/ipc.ts`: `worktrees.list(projectId)`, `worktrees.create({ projectId, branch, mode: 'new' | 'existing', path? })`, `worktrees.remove({ projectId, worktreeId, force? })`, `worktrees.reconcile(projectId)` (compares registry vs `git worktree list`)
- [x] 4.2 `worktrees.create`: run `git worktree add` first, only persist on exit 0; return `{ ok, worktree }` or `{ ok: false, error }` with verbatim git stderr
- [x] 4.3 `worktrees.remove`: terminate PTY by composite key → run `git worktree remove [--force]` → on success delete registry entry; return `{ ok }` or surface git stderr
- [x] 4.4 Expose all new IPC on `window.api.worktrees` in `src/preload/index.ts`
- [x] 4.5 On app launch, after registry load, run `worktrees.reconcile` for every project that has worktrees and mark missing ones

## 5. Renderer state

- [x] 5.1 Change `src/renderer/src/store.ts` `tabs` keying from `projectId` to composite key; update `upsertTab`, `clearTab`, attention setters, etc.
- [x] 5.2 Change `activeId` to `{ projectId: string; worktreeId: string | null } | null`; update `setActive` and last-active persistence
- [x] 5.3 Migrate restore-on-launch logic to read/write the composite identifier
- [x] 5.4 Add a `worktreesByProject` selector and a `clearProjectAndWorktrees(projectId)` helper for cascade removal

## 6. Sidebar UI

- [x] 6.1 Update `src/renderer/src/components/Sidebar.tsx` to render worktrees as expandable child rows under each project (collapsed by default, persists open/closed state per project)
- [x] 6.2 Add a "+ New worktree" affordance on each git-repo project row (hidden when `isGitRepo` is false)
- [x] 6.3 Add a per-worktree context menu / row affordance for "Remove worktree"
- [x] 6.4 Show per-worktree status (not-started / running / exited) and the attention indicator using the composite-keyed tab state
- [x] 6.5 Show a "missing" indicator for worktrees flagged by `worktrees.reconcile`

## 7. New-worktree modal

- [x] 7.1 Add a `NewWorktreeModal` component with two modes: "new branch" (text input) and "existing branch" (select listing local branches via a new `worktrees.listLocalBranches(projectId)` IPC, with free-text fallback)
- [x] 7.2 Show the computed default path and allow override; recompute collision suffix when branch name changes
- [x] 7.3 On confirm, call `worktrees.create`, surface git stderr on failure (modal stays open), close + activate the new worktree on success

## 8. Workspace + terminal pane

- [x] 8.1 Update `src/renderer/src/components/Workspace.tsx` to mount a `TerminalPane` per `(projectId, worktreeId | null)` tuple, keyed by composite key
- [x] 8.2 Update `TerminalPane` props to accept an optional `worktree?: Worktree`; pass `worktreeId` into all `window.api.pty.*` calls
- [x] 8.3 Update `TerminalPane`'s "path missing" overlay to offer "Remove worktree" (instead of "Remove project") when the tab is a worktree
- [x] 8.4 Update Claude attention notification to carry the worktree's branch in the title when applicable

## 9. Remove-project cascade

- [x] 9.1 Update project removal in `src/main/ipc.ts` to: terminate every worktree's PTY → loop `git worktree remove` per worktree, collecting per-worktree results → remove the project from the registry only if all worktree removals succeed; otherwise return per-worktree errors and keep the project
- [x] 9.2 Update the renderer's remove-project flow to surface per-worktree failures and refresh the sidebar accordingly

## 10. Verification

- [x] 10.1 Type-check: `npx tsc --noEmit` is clean
- [ ] 10.2 Manual: add a non-git project; confirm "+ New worktree" is hidden
- [x] 10.3 Manual: add a git project; create a worktree on a new branch; confirm directory exists, sidebar shows it, activating spawns Claude in the right cwd
- [x] 10.4 Manual: create a second worktree on an existing branch; confirm both worktrees run independent Claude sessions in parallel
- [ ] 10.5 Manual: make uncommitted changes in a worktree; attempt remove without force (refused, error surfaced); attempt remove with force confirmation (succeeds)
- [ ] 10.6 Manual: delete a worktree directory outside the app, relaunch; confirm sidebar shows it as missing with Locate/Remove
- [ ] 10.7 Manual: remove a project with two worktrees; confirm both worktrees are removed via git and the project disappears
- [ ] 10.8 Manual: quit while a worktree tab is active; relaunch; confirm that worktree is restored as the selected (un-spawned) tab
- [ ] 10.9 Load a registry file written by the previous version (no `worktrees` field); confirm it loads with empty worktrees and saves back without data loss
