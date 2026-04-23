## MODIFIED Requirements

### Requirement: Persisted project list

The application SHALL maintain a persisted list of user-added projects, where each project record contains a stable unique identifier, a display name, an absolute filesystem path, a creation timestamp, a last-opened timestamp, a display order, an optional per-project worktrees-root path, and a (possibly empty) list of worktree records. The list MUST survive application restarts. A project record loaded from a registry that predates worktree support SHALL be treated as having an empty worktree list.

#### Scenario: Projects persist across restarts

- **WHEN** a user has added one or more projects and fully quits and relaunches the application
- **THEN** the previously added projects SHALL appear in the same order with the same names, paths, and worktree lists

#### Scenario: Registry is durable against crashes

- **WHEN** the application is force-terminated while the registry is being written
- **THEN** on next launch the registry SHALL either reflect the state before the write or the state after the write, and MUST NOT be left in a corrupted or partially-written state

#### Scenario: Legacy registry without worktrees is loaded

- **WHEN** the registry on disk was written by a version that predates worktree support and contains no `worktrees` field on a project
- **THEN** the project SHALL load successfully and SHALL be treated as having an empty worktree list

### Requirement: Remove a project

The application SHALL allow the user to remove a project from the registry. Removal MUST be confirmed by the user and MUST NOT delete the project's own files on disk. If the project has worktrees, the application SHALL terminate every worktree's terminal session, then attempt to `git worktree remove` each worktree directory; the project record SHALL only be removed from the registry once all worktrees have been successfully removed. If any worktree removal fails, the project SHALL remain in the registry with the failed worktrees still present, and the per-worktree errors SHALL be surfaced to the user.

#### Scenario: User removes a project with no worktrees

- **WHEN** the user confirms removal of a project that has no worktrees
- **THEN** the project SHALL be deleted from the registry, its tab SHALL be closed, any running terminal session for it SHALL be terminated, and the project directory on disk SHALL remain untouched

#### Scenario: User removes a project with worktrees

- **WHEN** the user confirms removal of a project that has one or more worktrees and all `git worktree remove` invocations succeed
- **THEN** every worktree's PTY SHALL be terminated, every worktree directory SHALL be removed via `git worktree remove`, and the project record (with its worktrees) SHALL be removed from the registry; the project's own directory SHALL remain untouched

#### Scenario: Worktree removal fails during project removal

- **WHEN** removing a project's worktrees and at least one `git worktree remove` exits non-zero
- **THEN** the project SHALL remain in the registry with the failed worktrees still present, the successfully-removed worktrees SHALL be gone from the registry, and the per-worktree errors SHALL be surfaced to the user
