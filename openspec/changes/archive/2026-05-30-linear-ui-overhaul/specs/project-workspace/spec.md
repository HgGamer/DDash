## MODIFIED Requirements

### Requirement: Tabbed workspace layout

The application SHALL display a two-pane main window: a sidebar on the left listing all registered projects as selectable tabs, and a main area on the right that renders the active tab's terminal. A project that has one or more worktrees SHALL render its worktrees as expandable child rows beneath its sidebar entry; each child row SHALL be selectable as its own tab. Each project row SHALL also display a monogram avatar derived from the project's display name and an inline counts area that surfaces, at minimum, the number of worktrees and the number of unread-attention tabs belonging to that project (omitted when zero). The expand/collapse state of each project's worktree group SHALL be persisted per project across application restarts. The sidebar's active row SHALL render an accent-colored leading indicator in addition to its hover/selected background, so the selection is unambiguous on every surface elevation.

#### Scenario: Sidebar lists every registered project

- **WHEN** the main window is visible
- **THEN** the sidebar SHALL display one row per registered project in registry order, each row showing the project's display name and a monogram avatar derived from that name

#### Scenario: Worktrees appear as children of their project

- **WHEN** a project has one or more worktrees
- **THEN** the sidebar SHALL render those worktrees as child rows under the project, in worktree-order, each showing the worktree's branch name, indented one level beneath its parent

#### Scenario: Project row surfaces worktree count

- **WHEN** a project has at least one worktree
- **THEN** that project's sidebar row SHALL display a small count chip showing the number of worktrees

#### Scenario: Project row surfaces unread-attention count

- **WHEN** one or more of a project's tabs (primary tree or any worktree) has its `needsAttention` flag set and is not the active tab
- **THEN** that project's sidebar row SHALL display a count chip indicating how many of its tabs need attention

#### Scenario: Worktree group expand/collapse persists

- **WHEN** the user collapses or expands a project's worktree group and later relaunches the application
- **THEN** that project's worktree group SHALL be in the same collapsed/expanded state on relaunch

#### Scenario: Activating a project tab shows its terminal

- **WHEN** the user clicks a project in the sidebar
- **THEN** that project's primary tree SHALL become the active tab, the sidebar SHALL visually mark it as selected with an accent-colored leading indicator, and the main area SHALL render that project's terminal pane

#### Scenario: Activating a worktree tab shows its terminal

- **WHEN** the user clicks a worktree row in the sidebar
- **THEN** that worktree SHALL become the active tab, the sidebar SHALL visually mark it as selected with an accent-colored leading indicator, and the main area SHALL render that worktree's terminal pane

## ADDED Requirements

### Requirement: Empty-state for no projects

When the registry contains zero projects, the sidebar SHALL render a dedicated empty state with a brief explanatory message and a primary "Add project" button that triggers the same flow as the application menu's "Add Project…" entry. The empty state MUST replace the bare "no rows" state that previously rendered nothing actionable.

#### Scenario: Empty registry shows the prompt

- **WHEN** the application launches with zero registered projects
- **THEN** the sidebar SHALL display an empty-state card containing the message "No projects yet" and a primary "Add project" button

#### Scenario: Empty-state button triggers add flow

- **WHEN** the user clicks the empty-state "Add project" button
- **THEN** the application SHALL invoke the same add-project flow that the application menu's "Add Project…" entry uses

### Requirement: Workspace header exposes Docs

The workspace area's header SHALL provide an affordance to open the markdown viewer (Docs panel) for the active tab's project. The affordance MUST be visible whenever the active tab is a project or a worktree, and MUST be hidden when no tab is active.

#### Scenario: Docs button is visible when a tab is active

- **WHEN** the user activates a project tab or worktree tab
- **THEN** the workspace header SHALL show a Docs button alongside the existing header affordances

#### Scenario: Docs button opens the markdown viewer

- **WHEN** the user clicks the Docs button in the workspace header
- **THEN** the markdown viewer panel SHALL open for the active tab's project, as defined by the markdown-viewer capability
