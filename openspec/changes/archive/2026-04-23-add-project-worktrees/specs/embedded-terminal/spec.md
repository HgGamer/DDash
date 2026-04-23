## MODIFIED Requirements

### Requirement: Launch `claude` in the project directory

When a terminal session is spawned for a tab, the application SHALL set the PTY's working directory to that tab's filesystem path — the project's `path` for a project's primary tree, or the worktree's `path` for a worktree tab — and SHALL automatically launch the `claude` CLI as the foreground process of that session.

#### Scenario: Project session starts in project directory

- **WHEN** a terminal session is spawned for a project whose path is `/path/to/project` (no worktree selected)
- **THEN** the PTY's initial working directory SHALL be `/path/to/project` and the `claude` CLI SHALL be invoked as its initial command

#### Scenario: Worktree session starts in worktree directory

- **WHEN** a terminal session is spawned for a worktree whose path is `/path/to/project.worktrees/feature-x`
- **THEN** the PTY's initial working directory SHALL be `/path/to/project.worktrees/feature-x` and the `claude` CLI SHALL be invoked as its initial command

#### Scenario: Environment is inherited from the user's shell

- **WHEN** the application spawns a terminal session
- **THEN** the PTY process SHALL receive the user's login-shell environment (including `PATH`) so that `claude` and other user-installed tools resolve the same way they do in the user's normal terminal

### Requirement: Project path missing at spawn time

If a tab's filesystem path does not exist on disk at the moment a terminal session is spawned — whether that is the project's `path` for a primary-tree tab or the worktree's `path` for a worktree tab — the application SHALL NOT spawn the PTY and SHALL instead display an in-pane error with actions appropriate to the tab type.

#### Scenario: Project path was moved or deleted between launches

- **WHEN** the user activates a project's primary tree whose `path` no longer exists on disk
- **THEN** no PTY SHALL be spawned and the pane SHALL show a "path not found" message offering "Locate…" and "Remove project" actions

#### Scenario: Worktree path is missing at spawn time

- **WHEN** the user activates a worktree whose `path` no longer exists on disk
- **THEN** no PTY SHALL be spawned and the pane SHALL show a "worktree path not found" message offering "Locate…" and "Remove worktree" actions
