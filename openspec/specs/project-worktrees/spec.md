# Project Worktrees

## Purpose

Define how the application models, creates, persists, and manages git worktrees as children of registered projects, so users can run an independent `claude` session per branch alongside the primary project tree.
## Requirements
### Requirement: Worktree data model

The application SHALL model a worktree as a child of a project. Each worktree record MUST contain a stable unique identifier, a branch name, an absolute filesystem path to the worktree's checkout directory, a creation timestamp, a last-opened timestamp, and a display order within its parent project.

#### Scenario: Worktree fields are persisted

- **WHEN** a worktree is created for a project
- **THEN** its `id`, `branch`, `path`, `addedAt`, `lastOpenedAt`, and `order` SHALL be written to the persisted registry alongside its parent project

#### Scenario: Worktree id is stable

- **WHEN** the application restarts
- **THEN** each worktree's `id` SHALL remain unchanged, so that tab state, attention flags, and last-active-tab restoration continue to refer to the same worktree

### Requirement: Worktree creation only on git repositories

The application SHALL only offer worktree creation for projects whose `path` is the working tree of a git repository. The "+ New worktree" affordance MUST be hidden or disabled for projects that are not git repositories.

#### Scenario: Non-git project hides the affordance

- **WHEN** a project's path does not contain a usable git working tree (e.g. `git rev-parse --git-dir` fails)
- **THEN** the sidebar SHALL NOT offer a "+ New worktree" action for that project

#### Scenario: Git project shows the affordance

- **WHEN** a project's path is a valid git working tree
- **THEN** the sidebar SHALL offer a "+ New worktree" action

### Requirement: Create a new worktree

The application SHALL allow the user to create a worktree for a project by stepping through a three-section dialog: (1) choosing a base branch (new or existing), (2) confirming or editing the workspace name, and (3) confirming or editing the destination path. The dialog MUST surface a "Recently used branches" list at the top of the base-branch section, showing up to three branches the user has most recently created worktrees from on that project. On confirmation the application MUST invoke `git worktree add` to materialize the worktree on disk before persisting any registry record. Any failure from `git` MUST be surfaced verbatim in the dialog and MUST NOT result in a registered worktree. On success the dialog SHALL close, the new tab SHALL become active, and a transient toast SHALL confirm creation.

#### Scenario: Create worktree for a new branch

- **WHEN** the user opens the worktree-creation dialog, chooses "new branch", enters branch name `feature/x`, accepts the default name and path, and confirms
- **THEN** the application SHALL run `git worktree add -b feature/x <path>` rooted in the project, and on exit code 0 SHALL append a worktree record with that branch and path to the project

#### Scenario: Create worktree for an existing branch

- **WHEN** the user opens the worktree-creation dialog, picks an existing branch from the search-as-you-type combo, and confirms
- **THEN** the application SHALL run `git worktree add <path> <branch>` and, on success, register the worktree

#### Scenario: Recently used branches are surfaced

- **WHEN** the user opens the worktree-creation dialog for a project from which they have previously created at least one worktree
- **THEN** the dialog SHALL display up to three of the most recently used branches at the top of the base-branch section as one-click selections

#### Scenario: Inline validation prevents conflicting workspace names

- **WHEN** the user types a workspace name whose resulting branch matches an existing worktree on the same project
- **THEN** the dialog SHALL show an inline validation error on the name field and SHALL disable the confirm button until the conflict is resolved

#### Scenario: Successful creation shows a toast

- **WHEN** worktree creation succeeds
- **THEN** the dialog SHALL close, the newly created tab SHALL become active, and a toast SHALL appear with the message "Workspace created" and an action linking back to the workspace creation dialog

#### Scenario: git worktree add fails

- **WHEN** `git worktree add` exits non-zero (e.g. branch already checked out, path exists, dirty index)
- **THEN** the dialog SHALL display the git stderr inline, the dialog SHALL remain open, the registry SHALL be unchanged, and no PTY session SHALL be spawned

### Requirement: Default worktree path

The application SHALL compute a default on-disk path for a new worktree as `<project.path>.worktrees/<sanitized-branch>`, where `sanitized-branch` is the branch name with filesystem-unsafe characters replaced. If the resulting path already exists, the application MUST suffix it (e.g. `-2`, `-3`) until a free path is found. The user MAY override the path before confirming.

#### Scenario: Default path is sibling-of-project

- **WHEN** a user creates a worktree for branch `feature/x` on project at `/repos/foo`
- **THEN** the default path SHALL be `/repos/foo.worktrees/feature-x`

#### Scenario: Path collision is suffixed

- **WHEN** the computed default path already exists on disk
- **THEN** the application SHALL propose `<path>-2`, `<path>-3`, … until an unused path is found

#### Scenario: Per-project worktrees root override

- **WHEN** a project specifies a `worktreesRoot` override
- **THEN** new worktrees for that project SHALL default to `<worktreesRoot>/<sanitized-branch>` instead of the sibling-of-project location

### Requirement: Remove a worktree

The application SHALL allow the user to remove a worktree. Removal MUST terminate the worktree's running terminal session, then invoke `git worktree remove` to delete the worktree directory, then remove the registry entry. Removal of a worktree with uncommitted changes MUST require an explicit second confirmation before any `--force` is used.

#### Scenario: Remove a clean worktree

- **WHEN** the user confirms removal of a worktree with no uncommitted changes
- **THEN** the application SHALL terminate its PTY session, run `git worktree remove <path>`, and on success remove the worktree from the registry

#### Scenario: Remove a dirty worktree without forcing

- **WHEN** the user confirms removal of a worktree with uncommitted changes and does NOT confirm forcing
- **THEN** `git worktree remove` SHALL be invoked without `--force`, git's refusal SHALL be surfaced to the user, the worktree directory SHALL remain on disk, and the registry SHALL be unchanged

#### Scenario: Remove a dirty worktree with explicit force

- **WHEN** the user confirms removal of a dirty worktree AND explicitly confirms forcing
- **THEN** the application SHALL run `git worktree remove --force <path>` and proceed with registry cleanup on success

### Requirement: Worktree session is independent

The application SHALL treat each worktree as an independent terminal session, rooted in the worktree's path, with its own PTY, its own `claude` process, its own scrollback, its own attention flag, and its own lifecycle status. A project's primary tree and its worktrees MUST NOT share PTY state.

#### Scenario: Two worktrees run in parallel

- **WHEN** a project has two worktrees A and B and the user has activated both at least once
- **THEN** both SHALL have independent running PTYs in their respective directories, each running its own `claude`, with independent scrollback and independent attention/exit indicators

### Requirement: Stale worktree detection on launch

On launch, for each project that has worktree records, the application SHALL reconcile its persisted worktrees against `git worktree list`. A worktree whose path is missing on disk OR not present in git's worktree list SHALL be marked as missing in the sidebar and offered "Locate" / "Remove" actions. The application MUST NOT silently delete missing worktree entries.

#### Scenario: Worktree directory was deleted outside the app

- **WHEN** the application launches and a registered worktree's path no longer exists on disk
- **THEN** the worktree entry SHALL remain in the sidebar visually marked as missing, and the user SHALL be offered options to locate it or remove it

#### Scenario: Worktree exists on disk but is unknown to the app

- **WHEN** the project has worktrees on disk that were created outside the app
- **THEN** the application SHALL NOT auto-import them

### Requirement: Persisted recently-used branches per project

The application SHALL persist, per project, the list of branches the user has most recently created worktrees from. The list SHALL be capped at five entries and stored in registry order from most recent to least recent. New entries are pushed to the front; existing entries are deduplicated to the front rather than duplicated.

#### Scenario: Recently used list updates on creation

- **WHEN** the user creates a new worktree for branch `feature/x` on a project
- **THEN** `feature/x` SHALL be inserted at the front of that project's recently-used-branches list, displacing any earlier occurrence of the same branch name

#### Scenario: Recently used list is capped at five

- **WHEN** the recently-used-branches list for a project already contains five entries and the user creates a worktree for a sixth branch
- **THEN** the oldest entry SHALL be evicted so the list never exceeds five entries

#### Scenario: List survives application restarts

- **WHEN** the user creates worktrees, fully quits, and relaunches the application
- **THEN** each project's recently-used-branches list SHALL be restored from disk in the same order it was when the application was quit

