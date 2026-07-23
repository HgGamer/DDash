## ADDED Requirements

### Requirement: Optional folder membership on projects
A project record SHALL support an optional folder id indicating which folder it
belongs to; when absent or unknown the project MUST be treated as ungrouped.
Assigning membership SHALL ignore unknown folder ids so a stale drop cannot strand
a project.

#### Scenario: Assign to a known folder
- **WHEN** a project is assigned to an existing folder id
- **THEN** the project's membership is set and persisted

#### Scenario: Assign to an unknown folder
- **WHEN** a project is assigned to a folder id that does not exist
- **THEN** the assignment is ignored and the project keeps its previous membership

#### Scenario: Load without folder data
- **WHEN** an existing state file with no folder data is loaded
- **THEN** all projects are treated as ungrouped and load normally
