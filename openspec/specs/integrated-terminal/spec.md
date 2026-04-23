# Integrated Terminal

## Requirements


### Requirement: Bottom-docked integrated terminal panel

The application SHALL provide a bottom-docked terminal panel that hosts one or more general-purpose shell sessions, independent from the Claude terminal pane. The panel SHALL be toggleable from a Terminal button on the statusbar.

#### Scenario: Statusbar toggle shows and hides the panel

- **WHEN** the user clicks the Terminal button on the statusbar
- **THEN** the integrated terminal panel SHALL toggle between expanded and collapsed states, and the collapsed/expanded state SHALL persist across app restarts

#### Scenario: Collapsing preserves running processes

- **WHEN** the user collapses the panel while any shell tab is running a process (e.g. a dev server)
- **THEN** the underlying PTY session SHALL continue running and SHALL NOT be killed, and re-expanding the panel SHALL reveal the tab with its accumulated output

### Requirement: Per-project/worktree shell tab scoping

The panel SHALL scope its shell tabs to the active `(projectId, worktreeId?)` selection. Switching the active project or worktree SHALL swap the visible tab set to that selection's own tabs; tabs belonging to other selections SHALL remain running in the background but hidden.

#### Scenario: Switching projects swaps the tab set

- **WHEN** project A has two shell tabs open, project B has one shell tab open, and the user switches from A to B
- **THEN** the panel SHALL show only project B's single tab, and project A's two tabs SHALL be hidden but still running

#### Scenario: New tab inherits active selection's cwd

- **WHEN** the user adds a new tab while a worktree is active
- **THEN** the new PTY SHALL spawn with its current working directory set to that worktree's path, not the parent project's path

#### Scenario: Project removal tears down its shell sessions

- **WHEN** a project (or a worktree of it) is removed from the registry
- **THEN** all shell sessions belonging to that project (or worktree) SHALL be terminated and their tabs removed

### Requirement: Multiple tabs per selection

The panel SHALL support multiple concurrent shell tabs within a single project/worktree selection, with affordances to add a new tab, close an existing tab, and switch between tabs.

#### Scenario: Adding a tab spawns a new PTY

- **WHEN** the user clicks the add-tab (`+`) button
- **THEN** a new PTY SHALL spawn in the active selection's directory, a new tab SHALL become visible and active, and that tab SHALL be attached to an xterm instance

#### Scenario: Closing a tab kills its PTY

- **WHEN** the user clicks the close (`×`) affordance on a tab
- **THEN** the PTY for that tab SHALL be terminated and the tab SHALL be removed from the panel

#### Scenario: Opening the panel with no tabs auto-spawns one

- **WHEN** the user expands the panel while the active selection has zero shell tabs
- **THEN** the panel SHALL auto-spawn a single shell tab in the active selection's directory

### Requirement: Shell selection and working directory

Each shell tab SHALL spawn the user's login shell, resolved from `$SHELL` on macOS/Linux and `%COMSPEC%` on Windows, with a fallback to `/bin/zsh` or `cmd.exe` respectively. The initial working directory SHALL be the project's root path for a project tab, or the worktree's path for a worktree tab. The user MAY override the default shell via the `defaultShell` setting.

#### Scenario: Default shell resolution

- **WHEN** a new shell tab spawns and no `defaultShell` override is set
- **THEN** the PTY SHALL use the value of `$SHELL` (or `%COMSPEC%` on Windows), and SHALL fall back to the platform default if that variable is unset or empty

#### Scenario: Shell override is honored

- **WHEN** the user sets `integratedTerminal.defaultShell` to a custom path and opens a new tab
- **THEN** the PTY SHALL spawn that custom shell instead of `$SHELL`

### Requirement: Resizable panel with persisted height

The panel SHALL be resizable by dragging its top edge. The current height SHALL persist across app restarts, clamped to a minimum of 120 pixels and a maximum of 80% of the workspace height.

#### Scenario: Drag-resize updates the layout live

- **WHEN** the user drags the top edge of the panel
- **THEN** the panel height SHALL update in real time and the main workspace above SHALL shrink/grow accordingly

#### Scenario: Height persists across restart

- **WHEN** the user resizes the panel and quits the app, then relaunches
- **THEN** the panel SHALL restore to the last-set height on next expand

### Requirement: Shared visual style with Claude pane

Shell tabs SHALL render with the same terminal style settings (font family, size, cursor, color palette) as the main Claude pane. Changes to the global terminal style SHALL apply to all shell tabs without requiring a restart.

#### Scenario: Font size change propagates

- **WHEN** the user changes the terminal font size in Settings while the panel is open
- **THEN** every mounted shell tab SHALL re-render with the new font size

### Requirement: Keyboard shortcuts

The application SHALL register two keyboard shortcuts: one to toggle the panel open/closed, and one to open a new tab in the active project/worktree.

#### Scenario: Toggle shortcut

- **WHEN** the user presses `Ctrl/Cmd+\``
- **THEN** the panel SHALL toggle between expanded and collapsed

#### Scenario: New-tab shortcut

- **WHEN** the user presses `Ctrl/Cmd+Shift+\``
- **THEN** a new shell tab SHALL open in the active project/worktree, and the panel SHALL expand if it was collapsed

### Requirement: Shell exit visibility

When a shell process exits, its tab SHALL remain in the panel until the user closes it. The tab SHALL display an inline marker indicating the exit code, and writing to that tab SHALL no longer be possible.

#### Scenario: Exited tab shows exit code

- **WHEN** a shell tab's underlying process exits with code N
- **THEN** the tab SHALL render an inline `[process exited: N]` marker, input SHALL be disabled, and the tab SHALL remain until the user closes it

### Requirement: Panel can be disabled

The `integratedTerminal.enabled` setting SHALL gate the feature entirely. When disabled, the statusbar Terminal button SHALL be hidden and the panel SHALL NOT render, regardless of the `expanded` state.

#### Scenario: Disabled feature hides all UI

- **WHEN** the user sets `integratedTerminal.enabled` to `false`
- **THEN** the Terminal button SHALL disappear from the statusbar and the panel SHALL unmount, but existing shell sessions SHALL continue running in the background until the app quits
