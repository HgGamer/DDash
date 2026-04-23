## ADDED Requirements

### Requirement: PTY-backed terminal

The application SHALL provide an embedded terminal component backed by a real pseudo-terminal (PTY), capable of running interactive TUI programs including the `claude` CLI. Plain stdout/stderr piping SHALL NOT be used.

#### Scenario: Interactive TUI renders correctly

- **WHEN** an interactive program that uses cursor positioning, colors, and raw-mode input (such as `claude`) runs in the terminal
- **THEN** the terminal SHALL render the program's full-screen UI, accept keystrokes as raw input, and display ANSI colors and cursor movements correctly

### Requirement: Launch `claude` in the project directory

When a terminal session is spawned for a project, the application SHALL set the PTY's working directory to the project's path and SHALL automatically launch the `claude` CLI as the foreground process of that session.

#### Scenario: Session starts in project directory

- **WHEN** a terminal session is spawned for a project whose path is `/path/to/project`
- **THEN** the PTY's initial working directory SHALL be `/path/to/project` and the `claude` CLI SHALL be invoked as its initial command

#### Scenario: Environment is inherited from the user's shell

- **WHEN** the application spawns a terminal session
- **THEN** the PTY process SHALL receive the user's login-shell environment (including `PATH`) so that `claude` and other user-installed tools resolve the same way they do in the user's normal terminal

### Requirement: Resize propagation

The terminal SHALL propagate size changes to the underlying PTY so that `claude` and other programs re-layout correctly when the window or pane is resized.

#### Scenario: Window resize resizes the PTY

- **WHEN** the user resizes the application window or the terminal pane changes size
- **THEN** the PTY SHALL receive an updated columns/rows size matching the new visible dimensions

### Requirement: Input and output streaming

User keystrokes and pasted text in the terminal pane SHALL be written to the PTY, and all PTY output SHALL be streamed to the terminal pane in order.

#### Scenario: Keystroke round-trip

- **WHEN** the user types a character with the terminal pane focused
- **THEN** the character SHALL be delivered to the PTY's input, and any resulting output from the child process SHALL appear in the terminal pane

### Requirement: Missing `claude` binary is surfaced clearly

If the `claude` CLI cannot be located in the user's shell `PATH` when a session is spawned, the application SHALL NOT crash or silently open an empty terminal. Instead, the terminal pane SHALL display a human-readable message explaining that `claude` was not found and how to install it.

#### Scenario: `claude` is not installed

- **WHEN** the application attempts to spawn a terminal session for a project and `claude` is not resolvable on the user's `PATH`
- **THEN** the terminal pane SHALL display a clear error message identifying the problem and linking to installation instructions, and the project and its tab SHALL remain intact

### Requirement: Process-exit handling

When the terminal's root process exits, the terminal pane SHALL remain visible with the process's final output and SHALL offer the user an explicit action to start a new session. The application SHALL NOT automatically respawn the process.

#### Scenario: Claude exits normally

- **WHEN** the `claude` process in a session exits
- **THEN** the terminal SHALL show an "exited" banner with an action to start a new session, and SHALL NOT spawn a new `claude` process until the user initiates it

### Requirement: Project path missing at spawn time

If a project's path does not exist on disk at the moment a terminal session is spawned, the application SHALL NOT spawn the PTY and SHALL instead display an in-pane error with actions to locate the path or remove the project.

#### Scenario: Path was moved or deleted between launches

- **WHEN** the user activates a project whose `path` no longer exists on disk
- **THEN** no PTY SHALL be spawned and the pane SHALL show a "path not found" message offering "Locate…" and "Remove project" actions
