# Desktop Shell

## Requirements

### Requirement: Cross-platform desktop application

The application SHALL be distributable as a native desktop application for macOS, Windows, and Linux from a single codebase. Each platform build SHALL launch into the same main window and workspace UI.

#### Scenario: Launch on supported platforms

- **WHEN** the user installs and launches the application on macOS, Windows, or Linux
- **THEN** the application SHALL open a main window displaying the workspace UI without platform-specific build changes visible to the user

### Requirement: Persisted window state

The application SHALL persist the main window's size and position across restarts.

#### Scenario: Window geometry is restored

- **WHEN** the user resizes or repositions the window, quits the application, and later relaunches it
- **THEN** the main window SHALL reopen at the same size and position

#### Scenario: First launch uses sensible defaults

- **WHEN** the application is launched for the first time with no saved window state
- **THEN** the main window SHALL open at a reasonable default size centered on the primary display

### Requirement: Application lifecycle

The application SHALL follow each platform's standard lifecycle conventions: closing the last window on macOS hides the app without quitting it, while closing the window on Windows and Linux quits the application.

#### Scenario: macOS close-to-dock

- **WHEN** the user closes the main window on macOS
- **THEN** the application SHALL remain in the Dock and reopen its main window when activated

#### Scenario: Windows/Linux close-to-quit

- **WHEN** the user closes the main window on Windows or Linux
- **THEN** the application SHALL terminate all running terminal sessions and quit

### Requirement: Clean shutdown of running sessions

When the application quits, it SHALL terminate all running terminal sessions cleanly before exiting.

#### Scenario: Quit terminates sessions

- **WHEN** the user quits the application while one or more project sessions are running
- **THEN** the application SHALL send termination signals to every PTY child process and exit only after they have been torn down

### Requirement: Application menu and keyboard shortcuts

The application SHALL provide a standard application menu with entries for adding a project, removing the active project, cycling between tabs, and quitting, each bound to a platform-appropriate keyboard shortcut.

#### Scenario: Keyboard shortcut adds a project

- **WHEN** the user invokes the "Add Project" menu item or its keyboard shortcut
- **THEN** the native directory picker SHALL open
