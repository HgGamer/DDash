## ADDED Requirements

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

The application SHALL allow the user to create a worktree for a project by specifying a branch (either new or existing). On confirmation the application MUST invoke `git worktree add` to materialize the worktree on disk before persisting any registry record. Any failure from `git` MUST be surfaced verbatim and MUST NOT result in a registered worktree.

#### Scenario: Create worktree for a new branch

- **WHEN** the user opens "+ New worktree", chooses "new branch", enters a branch name `feature/x`, and confirms
- **THEN** the application SHALL run `git worktree add -b feature/x <path>` rooted in the project, and on exit code 0 SHALL append a worktree record with that branch and path to the project

#### Scenario: Create worktree for an existing branch

- **WHEN** the user opens "+ New worktree", chooses "existing branch", selects an existing branch, and confirms
- **THEN** the application SHALL run `git worktree add <path> <branch>` and, on success, register the worktree

#### Scenario: git worktree add fails

- **WHEN** `git worktree add` exits non-zero (e.g. branch already checked out, path exists, dirty index)
- **THEN** the application SHALL display the git stderr to the user, the registry SHALL be unchanged, and no PTY session SHALL be spawned

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
