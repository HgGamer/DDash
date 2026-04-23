# Project Registry

## Requirements

### Requirement: Persisted project list

The application SHALL maintain a persisted list of user-added projects, where each project record contains a stable unique identifier, a display name, an absolute filesystem path, a creation timestamp, a last-opened timestamp, and a display order. The list MUST survive application restarts.

#### Scenario: Projects persist across restarts

- **WHEN** a user has added one or more projects and fully quits and relaunches the application
- **THEN** the previously added projects SHALL appear in the same order with the same names and paths

#### Scenario: Registry is durable against crashes

- **WHEN** the application is force-terminated while the registry is being written
- **THEN** on next launch the registry SHALL either reflect the state before the write or the state after the write, and MUST NOT be left in a corrupted or partially-written state

### Requirement: Add a project

The application SHALL allow the user to add a project by selecting a local directory via a native folder picker. The new project MUST be appended to the registry with a default display name derived from the directory's basename and persisted immediately.

#### Scenario: User adds a new project

- **WHEN** the user invokes "Add Project" and selects a directory that is not already registered
- **THEN** a new project entry SHALL be appended to the registry with the directory's basename as its default name and its absolute path recorded, and SHALL become visible in the sidebar

#### Scenario: User selects an already-registered directory

- **WHEN** the user invokes "Add Project" and selects a directory whose absolute path matches an existing project
- **THEN** no duplicate SHALL be created, and the existing project SHALL be activated instead

#### Scenario: User cancels the picker

- **WHEN** the user opens the folder picker and cancels
- **THEN** the registry SHALL remain unchanged

### Requirement: Remove a project

The application SHALL allow the user to remove a project from the registry. Removal MUST be confirmed by the user and MUST NOT delete any files on disk.

#### Scenario: User removes a project

- **WHEN** the user confirms removal of a project
- **THEN** the project SHALL be deleted from the registry, its tab SHALL be closed, any running terminal session for it SHALL be terminated, and the project directory on disk SHALL remain untouched

### Requirement: Rename a project

The application SHALL allow the user to change a project's display name without changing its path or identifier.

#### Scenario: User renames a project

- **WHEN** the user edits a project's display name and commits the change
- **THEN** the project's `name` field SHALL be updated in the registry and reflected in the sidebar, while its `id` and `path` SHALL remain unchanged

### Requirement: Reorder projects

The application SHALL allow the user to reorder projects in the sidebar, and the new order MUST persist across restarts.

#### Scenario: User reorders the sidebar

- **WHEN** the user drags a project to a new position in the sidebar
- **THEN** the project's order in the registry SHALL be updated and the new order SHALL be preserved after restart

### Requirement: Invalid project paths are surfaced, not silently dropped

If a registered project's path no longer exists on disk, the application SHALL keep the project in the registry and surface the missing-path state to the user rather than deleting the entry.

#### Scenario: Project directory has been moved or deleted

- **WHEN** the application attempts to use a project whose `path` no longer exists on disk
- **THEN** the project SHALL remain in the registry and the UI SHALL show a missing-path indication with options to locate the new path or remove the project
