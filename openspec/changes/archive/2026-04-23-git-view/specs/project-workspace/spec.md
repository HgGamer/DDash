## MODIFIED Requirements

### Requirement: Tabbed workspace layout

The application SHALL display a two-pane main window: a sidebar on the left listing all registered projects as selectable tabs, and a main area on the right that renders the active tab's terminal. A project that has one or more worktrees SHALL render its worktrees as expandable child rows beneath its sidebar entry; each child row SHALL be selectable as its own tab. The main area SHALL additionally host a collapsible Git View panel alongside the active tab's terminal; collapsing or expanding the Git View SHALL persist across application sessions as a global (not per-tab) preference.

#### Scenario: Sidebar lists every registered project

- **WHEN** the main window is visible
- **THEN** the sidebar SHALL display one row per registered project in registry order, each row showing the project's display name

#### Scenario: Worktrees appear as children of their project

- **WHEN** a project has one or more worktrees
- **THEN** the sidebar SHALL render those worktrees as child rows under the project, in worktree-order, each showing the worktree's branch name

#### Scenario: Activating a project tab shows its terminal

- **WHEN** the user clicks a project in the sidebar
- **THEN** that project's primary tree SHALL become the active tab, the sidebar SHALL visually mark it as selected, and the main area SHALL render that project's terminal pane

#### Scenario: Activating a worktree tab shows its terminal

- **WHEN** the user clicks a worktree row in the sidebar
- **THEN** that worktree SHALL become the active tab, the sidebar SHALL visually mark it as selected, and the main area SHALL render that worktree's terminal pane

#### Scenario: Git View is available alongside the terminal

- **WHEN** the main window has an active tab
- **THEN** the main area SHALL expose a collapsible Git View panel that the user can expand or collapse, and whose expanded/collapsed state SHALL be restored on the next launch

#### Scenario: Tab activation drives Git View context

- **WHEN** the active tab changes
- **THEN** the Git View SHALL be notified of the new tab's working directory so it can re-scope its data to that repository
