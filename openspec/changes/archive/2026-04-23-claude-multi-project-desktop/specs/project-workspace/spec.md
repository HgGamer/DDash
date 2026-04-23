## ADDED Requirements

### Requirement: Tabbed workspace layout

The application SHALL display a two-pane main window: a sidebar on the left listing all registered projects as selectable tabs, and a main area on the right that renders the active project's terminal.

#### Scenario: Sidebar lists every registered project

- **WHEN** the main window is visible
- **THEN** the sidebar SHALL display one row per registered project in registry order, each row showing the project's display name

#### Scenario: Activating a tab shows its terminal

- **WHEN** the user clicks a project in the sidebar
- **THEN** that project SHALL become the active tab, the sidebar SHALL visually mark it as selected, and the main area SHALL render that project's terminal pane

### Requirement: Lazy session spawn on tab activation

The application SHALL NOT spawn a terminal session for a project until the user activates its tab for the first time within the current application session. Once spawned, the session SHALL persist for the remainder of the application session even when another tab is active.

#### Scenario: First activation spawns a session

- **WHEN** the user activates a project tab that has no running session in the current application session
- **THEN** the application SHALL spawn a terminal session for that project and automatically launch the `claude` CLI

#### Scenario: Subsequent activations reattach

- **WHEN** the user switches away from a project tab and later activates it again
- **THEN** the same running terminal session SHALL be reattached to the main area, preserving its scrollback and process state

#### Scenario: Inactive tabs keep running

- **WHEN** a project has a running terminal session and the user activates a different tab
- **THEN** the first project's session SHALL continue running in the background and receive any output emitted by its process

### Requirement: Restore last-active tab on launch

On launch, the application SHALL restore the most recently active project as the selected tab, without spawning its session until the user interacts with it. If no last-active project is recorded, no tab SHALL be preselected.

#### Scenario: Relaunch restores selection

- **WHEN** the user had project X active when they quit, and then relaunches the application
- **THEN** project X SHALL be visually selected in the sidebar on the next launch

#### Scenario: Last-active project no longer exists

- **WHEN** the recorded last-active project has since been removed from the registry
- **THEN** no tab SHALL be preselected on launch and the main area SHALL show an empty state

### Requirement: Session lifecycle indication

The sidebar SHALL indicate, for each project, whether its session in the current application session is not yet started, running, or has exited.

#### Scenario: Exited session is visible in sidebar

- **WHEN** a project's terminal process exits while its tab is not active
- **THEN** the sidebar entry for that project SHALL show an "exited" indication

### Requirement: Close a tab's session without removing the project

The application SHALL allow the user to close (terminate) a project's running terminal session without removing the project from the registry.

#### Scenario: User closes the session

- **WHEN** the user invokes "Close session" on a project tab with a running session
- **THEN** the terminal process SHALL be terminated, the project SHALL remain in the registry and sidebar, and a subsequent activation SHALL spawn a fresh session
