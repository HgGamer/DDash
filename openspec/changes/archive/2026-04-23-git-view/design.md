## Context

Dash is an Electron desktop shell that embeds `claude` CLI sessions per project/worktree tab. The workspace already tracks an "active tab" that resolves to a working directory (a project root OR a worktree path from `project-worktrees`). Users currently have to drop into the embedded terminal to run any git command, which is awkward when reviewing what Claude just produced.

This change introduces a Git View that always reflects the active tab's working directory and exposes a small set of read and write operations. All existing tabs are already rooted in a real filesystem path, so the primary integration cost is (a) a new main-process git runner, (b) an IPC surface, and (c) a renderer panel wired to the active-tab state.

## Goals / Non-Goals

**Goals:**
- Show live working-tree status and a commit graph for the active tab's repository.
- Let the user stage/unstage files, commit, push, switch branches, and create branches without leaving the UI.
- Keep the implementation dependency-free at the npm level — shell out to the system `git` binary and parse porcelain output.
- Degrade gracefully when the active tab's `cwd` is not inside a git repository.

**Non-Goals:**
- No merge/rebase, conflict resolution UI, interactive rebase, stash, tag, submodule, or remote-management features.
- No credential UI beyond whatever the user's git/keychain config already provides.
- No diff editor — file diffs render read-only; editing happens in the user's editor.
- No multi-repo operations or cross-tab batch actions.

## Decisions

### D1. Shell out to `git` rather than use a JS library
- **Choice**: Invoke the user's system `git` binary via `child_process` with the tab's `cwd`.
- **Why**: isomorphic-git and nodegit each carry large install footprints and subtle compatibility gaps (submodules, credential helpers, hooks). Dash already assumes a developer machine with `git` on `PATH`. Porcelain v2 output is stable and documented.
- **Alternatives considered**: `isomorphic-git` (rejected: credential helper integration is the user's own, and parity with CLI matters for a "basic git stuff" feature), `simple-git` (rejected: thin wrapper; we'd prefer a small internal module we control).

### D2. Read operations use porcelain v2 + `git log --format`
- `git status --porcelain=v2 --branch --untracked-files=all -z` for status.
- `git log --format=%H%x00%P%x00%an%x00%at%x00%s%x00%D -z --all -n <limit>` for the commit graph (client-side lays out parents → children).
- `git branch --list --format=...` and `git for-each-ref refs/remotes` for branch data.
- Limit the initial graph to a bounded `n` (e.g. 500 commits) with a "load more" affordance later.

### D3. Write operations are explicit IPC calls, one action per call
- Channels: `git:stage`, `git:unstage`, `git:commit`, `git:push`, `git:checkout`, `git:createBranch`.
- Each returns `{ ok: true } | { ok: false, error: { code, message, stderr } }`. No silent retries.
- Push uses the tab's tracked upstream; if none is configured, surface the error with a hint rather than auto-creating one in this change (keeps scope tight).

### D4. Active-tab integration
- The renderer's existing active-tab store already emits a `cwd`. The Git View subscribes to that store and (re)loads status + log + branches when `cwd` changes.
- For worktree tabs, `cwd` is the worktree path — git already treats that as its own working tree so no special handling beyond "use the cwd we're given".

### D5. Refresh strategy
- On-demand refresh button + automatic refresh when the Git View regains focus AND on tab activation.
- A lightweight debounced `chokidar` watcher on `<cwd>/.git/HEAD`, `<cwd>/.git/index`, and `<cwd>/.git/refs` triggers a refresh while the panel is mounted. Debounce window: ~250ms.
- No polling loop; if chokidar turns out to be unreliable on network filesystems we'll add a manual refresh fallback (already present).

### D6. Panel layout
- Git View is a right-hand (or bottom, TBD in implementation) resizable pane of the main workspace area, collapsible. Terminal remains the primary surface. Default state: collapsed, persisted per-user (not per-tab) in settings.
- Within the panel: top area is status (staged/unstaged/untracked file lists with stage/unstage buttons + commit box), bottom area is the commit log graph with a branch selector header.

### D7. Error surfacing
- Git errors bubble up as a banner inside the panel with the stderr snippet. No modal dialogs for routine failures (non-fast-forward push, dirty checkout, etc.) — the banner is enough.

## Risks / Trade-offs

- **[Risk] Porcelain parsing bugs across git versions** → Pin to porcelain v2 (stable since git 2.11); add unit tests with recorded fixtures for representative statuses.
- **[Risk] Large repos produce huge log output and UI jank** → Cap `git log` at ~500 commits initially; render the graph virtualized.
- **[Risk] `git` binary missing or on unusual PATH** → Detect on first load; show a one-time banner with instructions. Settings could later add a configurable path.
- **[Risk] Concurrent write actions racing** → Serialize write IPC calls per-cwd in the main process (simple per-path mutex).
- **[Risk] Push prompts for credentials** → Rely on user's git credential helper; if stdin is required, the spawn will hang. Use a hard timeout and surface a clear error directing the user to configure a credential helper.
- **[Trade-off] No conflict resolution UI** → Users encountering conflicts will be told to resolve in their editor or the terminal. Accepted for scope; a follow-up can add minimal conflict listing.
- **[Trade-off] One active-tab → one repo** → Keeps the model simple but means the panel shows nothing useful when the active tab is not in a repo (empty state).

## Migration Plan

No data migration. Shipping the feature is additive:
1. Introduce the main-process git runner and IPC behind a feature flag (`ui.gitView.enabled`, default `true` in dev, `true` at release once tested).
2. Add the panel; it is collapsed by default, so existing users don't see a layout change until they open it.
3. No rollback needed beyond toggling the flag; no persisted state depends on the feature being present.

## Open Questions

- Should the panel dock to the right edge (vertical) or the bottom (horizontal)? Implementer's call during the first UI pass; design will validate in review.
- For worktree tabs, should branch-switch be disallowed (since worktrees are pinned to a branch) or show a confirm prompt? Leaning: disallow for worktree tabs and surface the reason in the branch selector tooltip.
- How far back should the log go before "load more" — 200, 500, 1000? Tentative 500; revisit after dogfooding.
