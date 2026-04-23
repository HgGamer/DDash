## Why

Working on multiple features of the same project in parallel currently means juggling `git stash`, branch switches, or manually-created worktrees outside the app — and only ever one Claude session per project. Users want to spin up a second (or third) Claude pane against the same project, isolated to its own branch and working tree, so two features can progress side-by-side without contaminating each other's diffs or context.

## What Changes

- A project may now own one or more **worktrees**, each with its own branch, filesystem path, and live Claude terminal session.
- The sidebar gains a hierarchical view: each project row can expand to show its worktrees as child entries; activating a worktree opens its terminal in the main area.
- Add a **"New worktree"** action on a project (sidebar context menu / `+` affordance) that prompts for a branch name (new or existing) and creates a `git worktree` on disk under a configurable per-project worktrees root (default: sibling directory `<project>.worktrees/<branch>`).
- Add a **"Remove worktree"** action that terminates the session, runs `git worktree remove`, and cleans up the registry entry. Confirmation required if the worktree has uncommitted changes.
- Worktrees persist across restarts the same way projects do; their last-opened tab is restored.
- Tab status, attention flag (Claude waiting for input), and terminal style settings apply per-worktree, identical to today's per-project behavior.
- The "main" project entry continues to behave exactly as today (it is effectively the project's primary working tree).
- Adding a project that is itself inside a git worktree is still allowed; worktree creation is only offered when the project's path is a git repository.

## Capabilities

### New Capabilities
- `project-worktrees`: managing per-project git worktrees — creation, removal, persistence, and the relationship between a project and its worktree children.

### Modified Capabilities
- `project-registry`: registry data model extended to store worktrees as children of a project; remove-project semantics extended to cascade to worktrees.
- `project-workspace`: sidebar layout, tab activation, and session-lifecycle indication extended to render and operate on worktree children.
- `embedded-terminal`: terminal sessions are keyed per-worktree (not just per-project), and spawn in the worktree's path rather than the project's root path.

## Impact

- **Code**: `src/shared/types.ts` (Project / Worktree types), `src/main/registry.ts` (persistence), `src/main/pty-session.ts` (session keying), `src/main/ipc.ts` + `src/preload/index.ts` (new worktree IPC surface), `src/renderer/src/store.ts` (tab keying), `src/renderer/src/components/Sidebar.tsx` (hierarchical view), `src/renderer/src/components/Workspace.tsx` and `TerminalPane.tsx` (worktree-aware activation).
- **External dependency**: requires the `git` CLI on `PATH` for `git worktree add/remove/list`. No new npm dependency required.
- **Filesystem**: creates real directories under the chosen worktrees root; removal deletes those directories (with the standard `git worktree remove` safety checks).
- **Migration**: existing registry files have no worktrees array — loader treats missing `worktrees` as `[]`, so no destructive migration is needed.
- **Out of scope**: GitHub PR integration, branch creation policies beyond `git worktree add -b`, multi-repo projects, sharing terminal scrollback across worktrees.
