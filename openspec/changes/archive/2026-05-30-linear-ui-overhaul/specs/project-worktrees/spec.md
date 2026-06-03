## MODIFIED Requirements

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

## ADDED Requirements

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
