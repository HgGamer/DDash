## ADDED Requirements

### Requirement: Folder lifecycle
The app SHALL let users create, rename, delete, and reorder flat (one-level)
project folders, and collapse/expand each folder.

#### Scenario: Create and name a folder
- **WHEN** the user creates a new folder
- **THEN** an empty folder appears in the sidebar ready to be renamed inline

#### Scenario: Collapse a folder
- **WHEN** the user collapses a folder
- **THEN** its projects are hidden and the collapsed state persists

#### Scenario: Delete a folder
- **WHEN** the user deletes a folder
- **THEN** the folder is removed, its projects return to the top level, and no files
  on disk are affected

### Requirement: Assign projects to folders
The app SHALL let users file a project into a folder by dragging it onto a folder
header, and via a right-click "Move to folder" menu that also offers "Top level".

#### Scenario: Drag a project into a folder
- **WHEN** the user drops a project onto a folder header
- **THEN** the project becomes a member of that folder and renders nested under it

#### Scenario: Move to top level
- **WHEN** the user chooses "Top level" for a filed project
- **THEN** the project leaves its folder and renders in the ungrouped section

### Requirement: Persistence and orphan safety
Folders and each project's folder membership SHALL persist across restarts, and a
membership referencing a missing folder SHALL fall back to the top level.

#### Scenario: Reload restores grouping
- **WHEN** the app relaunches
- **THEN** folders, their order, collapsed state, and project membership are restored

#### Scenario: Stale membership
- **WHEN** a project references a folder that no longer exists
- **THEN** the project renders at the top level rather than disappearing
