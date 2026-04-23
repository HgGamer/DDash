## ADDED Requirements

### Requirement: Terminal style presets

The application SHALL offer the user a choice of named terminal-style presets, which MUST include at minimum a "Default terminal style" preset (xterm.js defaults, with no Dash-imposed theme, font family, or font-size overrides) and a "Dash dark" preset (the style Dash shipped before this change: black background, the existing mono font stack, 13px font size).

#### Scenario: Default preset applies xterm defaults

- **WHEN** the user selects the "Default terminal style" preset
- **THEN** every open terminal pane SHALL render using xterm.js's built-in defaults for theme, font family, and font size, with no Dash-imposed overrides

#### Scenario: Dash dark preset restores the original look

- **WHEN** the user selects the "Dash dark" preset
- **THEN** every open terminal pane SHALL render with a black background, the original Dash mono font stack, and 13px font size

### Requirement: Terminal style settings surface

The application SHALL provide a user-reachable settings surface for terminal style, accessible from the application menu (for example, `View → Terminal Style…`), that lets the user view the current preset and switch to any other available preset.

#### Scenario: User opens terminal style settings from the menu

- **WHEN** the user selects the terminal style menu item
- **THEN** a settings surface SHALL open showing the currently active preset and a control to switch between the available presets

### Requirement: Persistence of terminal style across restarts

The selected terminal-style preset SHALL be persisted to disk by the main process and SHALL be reapplied automatically on the next application launch.

#### Scenario: Preset survives a restart

- **WHEN** the user selects a non-default preset, closes the application, and relaunches it
- **THEN** every terminal pane SHALL render with that preset on the next launch without the user needing to reselect it

#### Scenario: Corrupt or missing settings file falls back safely

- **WHEN** the persisted settings file is missing, unreadable, or contains an unknown preset value
- **THEN** the application SHALL fall back to the "Dash dark" preset, SHALL NOT crash, and SHALL continue to operate normally

### Requirement: Live application to open terminal panes

Changes to the active terminal-style preset SHALL be applied immediately to all currently open terminal panes without tearing down their PTY sessions, dropping scrollback, or interrupting any running process (including `claude`).

#### Scenario: Live style change preserves the session

- **WHEN** the user changes the terminal-style preset while a `claude` session is running in a terminal pane
- **THEN** the pane's visual style SHALL update immediately, the PTY session SHALL remain alive, and existing scrollback SHALL remain intact

### Requirement: New terminal panes use the active preset

When a new terminal pane is created (for example, when the user opens a project for the first time in a session), it SHALL be constructed using the currently active terminal-style preset.

#### Scenario: Newly opened project uses the active preset

- **WHEN** the active preset is "Default terminal style" and the user opens a project that did not yet have a terminal pane in this session
- **THEN** the new pane SHALL be constructed with xterm.js defaults, matching the active preset
