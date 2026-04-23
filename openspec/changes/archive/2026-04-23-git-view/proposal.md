## Why

Dash users currently drop into a terminal to inspect git history, stage changes, switch branches, or push. That context-switching is disruptive when triaging what a Claude session just produced, and it makes the desktop shell feel like a mere terminal wrapper rather than a project cockpit. A first-class git view turns Dash into a visual control surface for the repository the user is already focused on.

## What Changes

- Add a persistent **Git View** panel in the main window that always reflects the currently selected project/worktree tab.
- Visualize the repository's commit graph for the active tab (branches, HEAD, upstream relationship).
- Show the working tree status: unstaged, staged, and untracked files, with file-level diff preview.
- Support basic git actions directly from the UI: **stage/unstage files**, **commit** (message + optional description), **push** (to tracked upstream), **switch branch**, and **create branch** from the current HEAD.
- Refresh the panel automatically when the active tab changes and on a filesystem/interval trigger while visible.
- Expose git operations through a new IPC surface in the main process, backed by `git` CLI invocations scoped to the tab's working directory (project root OR worktree path).

Out of scope (deliberately, to keep the first cut small): merge/rebase conflict resolution UI, interactive rebase, stash management, remote management, tag operations, and credential prompting beyond what the user's existing git config handles.

## Capabilities

### New Capabilities
- `git-view`: Project-scoped git visualization and basic write operations (status, log graph, commit, push, branch switch/create) rendered alongside the active project or worktree tab.

### Modified Capabilities
- `project-workspace`: The main area's layout SHALL accommodate the persistent git view alongside the terminal pane for the active tab; tab activation SHALL also drive git-view context.

## Impact

- **Renderer**: New React view + state store for git data; layout change in the workspace main area to host it.
- **Main process**: New IPC channels for git queries (status, log, branches) and git actions (stage, unstage, commit, push, checkout, branch create); a git runner module that shells out to `git` with the tab's `cwd`.
- **Preload**: Expose the new git IPC surface on the `DashApi`.
- **Shared types**: New types for commit nodes, file status entries, branch records, and action results.
- **Project workspace**: Active-tab change must now also notify the git view; worktree tabs must resolve their own `cwd` for git operations.
- **Dependencies**: Relies on a working `git` binary on the user's `PATH`; no new npm dependencies required for the MVP (parsing `git` porcelain output). A graph-layout helper may be added later if needed.
- **Settings**: A future follow-up may add toggles (auto-refresh interval, default push behavior); not required for this change.
