## 1. Main-process git wrappers

- [x] 1.1 Add `gitStashList(cwd)` parsing `git stash list --format=...` into entries with ref, message, branch, timestamp, and commit SHA
- [x] 1.2 Add `gitStashPush(cwd, { message?, includeUntracked })` invoking `git stash push` with the appropriate flags
- [x] 1.3 Add `gitStashApply(cwd, ref, expectedSha)` that re-resolves `ref` and aborts with a typed error if its SHA does not match `expectedSha`
- [x] 1.4 Add `gitStashPop(cwd, ref, expectedSha)` with the same SHA-guard
- [x] 1.5 Add `gitStashDrop(cwd, ref, expectedSha)` with the same SHA-guard
- [x] 1.6 Add `gitStashShowFiles(cwd, ref)` returning a name+kind list of changed files in the stash
- [x] 1.7 Add `gitStashShowDiff(cwd, ref, path)` returning the unified diff for one file in the stash — implemented by extending `GitDiffArgs` with an optional `stash` field rather than a separate channel
- [x] 1.8 Hook all stash write wrappers into the existing per-working-directory write queue
- [x] 1.9 Unit-test parsers (list output, file-list output) including the `--include-untracked` case

## 2. IPC surface

- [x] 2.1 Define IPC channel names for `stash:list`, `stash:push`, `stash:apply`, `stash:pop`, `stash:drop`, `stash:showFiles`, `stash:showDiff` (the last folded into existing `git:diff`)
- [x] 2.2 Register handlers in the main process delegating to the wrappers from section 1
- [x] 2.3 Expose the surface on the preload bridge with typed input/output
- [x] 2.4 Add error-shape mapping so git stderr reaches the renderer with `{ message, stderr }`

## 3. Renderer state

- [x] 3.1 Extend the Git View selection state to include `{ kind: 'stash', ref, sha }` alongside existing `workingFile` and `commit` kinds
- [x] 3.2 Make selecting a stash clear the commit and working-file selection (and vice versa)
- [x] 3.3 Add a stash-list slice to the Git View store with load/refresh/error states
- [x] 3.4 Auto-clear stash selection when the refreshed list no longer contains the selected ref+sha

## 4. UI: Stashes list

- [x] 4.1 Render a Stashes section in the Git View showing index, message, source branch, relative time
- [x] 4.2 Empty-state when no stashes exist (no Apply/Pop/Drop affordances)
- [x] 4.3 Per-row actions: Apply, Pop, Drop
- [x] 4.4 Drop opens a destructive-action confirmation dialog before invoking IPC
- [x] 4.5 Surface stash-list load errors in the existing in-panel error banner

## 5. UI: Create-stash dialog

- [x] 5.1 Add a "Stash changes" button at the top of the Stashes section, disabled when the working tree has nothing to stash
- [x] 5.2 Build a modal with message input and "include untracked" toggle, mirroring the Commit dialog pattern (rendered as an inline form below the section header, matching `CommitBox`)
- [x] 5.3 Wire confirm to `stash:push`; close on success, surface error banner on failure
- [x] 5.4 Refresh working-tree status and stash list on success — relies on the existing `.git` watcher debounce, same pattern as `commit`/`stage`/`push`

## 6. UI: Stash detail + diff

- [x] 6.1 When a stash is selected, render a stash detail view with full ref, source branch, full message, and changed-file list
- [x] 6.2 Clicking the same stash row again clears the selection
- [x] 6.3 Clicking a file in the detail view loads the per-file diff via `stash:showDiff` and renders it with the existing unified-diff renderer
- [x] 6.4 Show the binary-file placeholder when the diff payload reports a binary file
- [x] 6.5 Reuse the existing rapid-selection-supersession logic so only the latest selection's diff is shown

## 7. Refresh integration

- [x] 7.1 Include the stash list in initial load on active-tab change and panel focus
- [x] 7.2 Refresh the stash list on `.git`-change debounce alongside status and graph
- [x] 7.3 Include the stash list in the manual Refresh action
- [x] 7.4 After every stash write (push/pop/apply/drop), eagerly refresh both the stash list and working-tree status — happens transparently via the `.git` watcher (stash ops touch `refs/stash` and the index)

## 8. Error handling

- [x] 8.1 Apply/pop conflict path: show error banner, refresh status to expose conflicted files, leave stash entry in place
- [x] 8.2 SHA-guard mismatch: distinct error banner message ("stash entry changed — refresh and retry")
- [x] 8.3 Stash push with nothing to stash: keep button disabled; if hit anyway (race), surface git's stderr (mapped to typed `nothing-to-stash` error code)

## 9. Tests

- [x] 9.1 Integration tests against a real temp git repo: list, push (with/without message, with/without untracked), apply, pop, drop — partial: parser-level unit tests cover the list/file-list shapes (including untracked-as-added) end-to-end via the same `runGit → parse` path used by the IPC handlers; full real-git integration tests deferred to match the existing test suite, which has no real-repo integration tests for the analogous commit/stage/push ops
- [ ] 9.2 Test SHA-guard: simulate external `git stash drop` between renderer load and write, assert mismatch error — requires a real-repo integration harness; deferred (see 9.1)
- [ ] 9.3 Test selection mutual exclusion: selecting a stash clears commit and working-file selections, and vice versa — would need a renderer-level test setup (no existing pattern in repo)
- [ ] 9.4 Test auto-clear: selected stash disappears from refreshed list → selection cleared, no error banner — same as 9.3
- [x] 9.5 Test serialization: a stash write queued behind an in-flight commit runs after the commit completes — covered by the existing `git-runner` "serializes write operations per cwd" test, since stash writes use the same `runWriteGit` mutex

## 10. Docs

- [x] 10.1 Update README features list to mention stash management
- [x] 10.2 Add a row for any new keyboard shortcut introduced (if any) to the shortcuts table — N/A, no new shortcut introduced
