## 1. IPC: per-worktree HEAD short hash

- [x] 1.1 Add `worktrees.listWithHeads(projectId)` handler in `src/main/git-ipc.ts` that shells `git worktree list --porcelain` from the project root, parses each `worktree`/`HEAD` block, and returns `{ id, head }[]` joined to the registry by absolute path
- [x] 1.2 Expose the handler via `src/preload/index.ts` and add its type to `src/shared/ipc.ts`
- [x] 1.3 Handle the "path missing on disk" case by returning `head: null` for that entry (do not throw)

## 2. Renderer: WorktreeList component

- [x] 2.1 Create `src/renderer/src/components/WorktreeList.tsx` that takes `(projectId, activeWorktreeId | null)` plus `onActivate`, `onRemove`, `onCreate` callbacks
- [x] 2.2 Read the project's worktree records from the existing renderer store and prepend a synthetic primary-tree row
- [x] 2.3 Call `window.api.worktrees.listWithHeads(projectId)` on mount and on a `refreshKey` prop bump; merge HEAD short hashes into rows by id; render `—` when `head` is null
- [x] 2.4 Render each row with branch, truncated path (full on hover via `title`), HEAD short hash, and a `…` menu with Activate (hidden if active) and Remove (hidden for the primary tree)
- [x] 2.5 Visually mark the active row

## 3. Renderer: Git View integration

- [x] 3.1 Mount `WorktreeList` at the bottom of `GitView.tsx` below the commit graph, with a section header "Worktrees" and a `+ New` button at the right
- [x] 3.2 Pass the same `refreshKey`/refresh signal that the rest of the Git View already uses for tab change, focus, manual Refresh, and `.git` watcher events
- [x] 3.3 Hide the Worktrees section entirely when the active tab is not in a git repository (matches the rest of the Git View's empty state)
- [x] 3.4 Wire `+ New` to open `NewWorktreeModal` with `projectId` / `projectPath` / `worktreesRoot` from the active project; on `onCreated`, bump the Git View's refresh signal so the new row appears

## 4. Activate action

- [x] 4.1 Reuse the existing store action used by the sidebar to switch to a worktree tab (creating it if missing); wire it into `WorktreeList`'s `onActivate`
- [x] 4.2 Verify that activating the already-active row is a no-op (don't recreate the tab, don't reset its scroll/state)

## 5. Remove action

- [x] 5.1 Reuse the sidebar's existing remove handler verbatim (first-confirm, dirty-tree refusal, explicit `--force` second-confirm, PTY termination, stderr surfacing). Lifted into `src/renderer/src/lib/removeWorktree.ts` and used by both `Sidebar.tsx` and `WorktreeList.tsx`.
- [x] 5.2 Before invoking remove on the active-tab worktree, switch the active tab to the project's primary tree
- [x] 5.3 Surface git stderr through `window.alert`, matching `Sidebar.tsx`'s existing pattern. (The Git View's `setError` banner is local to `GitView.tsx`; the sidebar already uses `window.alert` for the same flow, so the two surfaces stay consistent.)
- [x] 5.4 Ensure the primary-tree row never exposes a Remove action

## 6. Tests

- [x] 6.1 Unit-test the `git worktree list --porcelain` join logic added in step 1.1 (`test/git-worktrees-with-heads.test.ts` covers single-worktree repo, multi-worktree, registry-known path missing from git output, and primary tree missing from git output)
- [ ] 6.2 ~~Renderer test for `WorktreeList`~~ — skipped: no renderer test harness in this repo (only main-process tests under `test/`).
- [ ] 6.3 ~~Renderer integration test for `+ New` flow~~ — skipped, same reason.

## 7. Documentation

- [ ] 7.1 ~~Update in-app help / README~~ — README has no per-feature Git View section to update; the existing "Worktree-aware" bullet covers the user-visible promise. No change made.
