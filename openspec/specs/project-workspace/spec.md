# Project Workspace

## Requirements

### Requirement: Tabbed workspace layout

The application SHALL display a two-pane main window: a sidebar on the left listing all registered projects as selectable tabs, and a main area on the right that renders the active tab's terminal. A project that has one or more worktrees SHALL render its worktrees as expandable child rows beneath its sidebar entry; each child row SHALL be selectable as its own tab.

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

### Requirement: Lazy session spawn on tab activation

The application SHALL NOT spawn a terminal session for a project's primary tree or for any of its worktrees until the user activates that specific tab for the first time within the current application session. Once spawned, the session SHALL persist for the remainder of the application session even when another tab is active.

#### Scenario: First activation spawns a session

- **WHEN** the user activates a tab (project primary tree OR worktree) that has no running session in the current application session
- **THEN** the application SHALL spawn a terminal session rooted in that tab's directory and automatically launch the `claude` CLI

#### Scenario: Subsequent activations reattach

- **WHEN** the user switches away from a tab and later activates it again
- **THEN** the same running terminal session SHALL be reattached to the main area, preserving its scrollback and process state

#### Scenario: Inactive tabs keep running

- **WHEN** any tab (project primary tree OR worktree) has a running terminal session and the user activates a different tab
- **THEN** the first tab's session SHALL continue running in the background and receive any output emitted by its process

### Requirement: Restore last-active tab on launch

On launch, the application SHALL restore the most recently active tab — which MAY be a project's primary tree OR one of its worktrees — as the selected tab, without spawning its session until the user interacts with it. If no last-active tab is recorded, no tab SHALL be preselected.

#### Scenario: Relaunch restores a project tab

- **WHEN** the user had a project's primary tree active when they quit, and then relaunches the application
- **THEN** that project's primary tree SHALL be visually selected in the sidebar on the next launch

#### Scenario: Relaunch restores a worktree tab

- **WHEN** the user had a worktree active when they quit, and then relaunches the application
- **THEN** that worktree SHALL be visually selected in the sidebar on the next launch

#### Scenario: Last-active tab no longer exists

- **WHEN** the recorded last-active tab refers to a project or worktree that has since been removed from the registry
- **THEN** no tab SHALL be preselected on launch and the main area SHALL show an empty state

### Requirement: Session lifecycle indication

The sidebar SHALL indicate, for each project AND each worktree independently, whether its session in the current application session is not yet started, running, or has exited.

#### Scenario: Exited session is visible in sidebar

- **WHEN** a tab's terminal process exits while that tab is not active
- **THEN** the sidebar entry for that tab SHALL show an "exited" indication, independently of the status of any sibling worktrees or the parent project

### Requirement: Close a tab's session without removing the project

The application SHALL allow the user to close (terminate) a project's running terminal session without removing the project from the registry.

#### Scenario: User closes the session

- **WHEN** the user invokes "Close session" on a project tab with a running session
- **THEN** the terminal process SHALL be terminated, the project SHALL remain in the registry and sidebar, and a subsequent activation SHALL spawn a fresh session

### Requirement: Bottom dock region in workspace

The workspace area SHALL support a bottom dock region that can host a resizable panel (the integrated terminal). When the bottom dock is expanded, the main workspace content SHALL flex to the remaining vertical space above it.

#### Scenario: Bottom dock coexists with right-side git dock

- **WHEN** both the git view and the integrated terminal are expanded
- **THEN** the workspace SHALL render the git dock on the right at full height, the terminal dock docked to the bottom of the left (terminal) column, and the Claude terminal pane SHALL occupy the remaining top-left rectangle

### Requirement: Statusbar hosts feature toggles

The bottom statusbar SHALL host feature toggle buttons for panels that dock to the workspace. The integrated terminal toggle SHALL appear alongside the existing git view toggle.

#### Scenario: Statusbar shows both toggles

- **WHEN** both the git view and the integrated terminal features are enabled in settings
- **THEN** the statusbar SHALL display the Git toggle and the Terminal toggle
