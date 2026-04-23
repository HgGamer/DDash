## MODIFIED Requirements

### Requirement: PTY-backed terminal

The application SHALL provide an embedded terminal component backed by a real pseudo-terminal (PTY), capable of running interactive TUI programs including the `claude` CLI. Plain stdout/stderr piping SHALL NOT be used. The terminal's visual style (theme, font family, font size) SHALL be determined by the currently active terminal-style preset (see the `terminal-style-settings` capability) rather than by hard-coded values, and SHALL update live when that preset changes.

#### Scenario: Interactive TUI renders correctly

- **WHEN** an interactive program that uses cursor positioning, colors, and raw-mode input (such as `claude`) runs in the terminal
- **THEN** the terminal SHALL render the program's full-screen UI, accept keystrokes as raw input, and display ANSI colors and cursor movements correctly

#### Scenario: Style follows the active preset

- **WHEN** the active terminal-style preset changes
- **THEN** each open terminal pane SHALL update its theme, font family, and font size to match the new preset without restarting its PTY session
