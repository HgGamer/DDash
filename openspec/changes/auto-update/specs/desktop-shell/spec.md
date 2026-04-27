## MODIFIED Requirements

### Requirement: Application menu and keyboard shortcuts

The application SHALL provide a standard application menu with entries for adding a project, removing the active project, cycling between tabs, checking for application updates, and quitting, each bound to a platform-appropriate keyboard shortcut where applicable.

#### Scenario: Keyboard shortcut adds a project

- **WHEN** the user invokes the "Add Project" menu item or its keyboard shortcut
- **THEN** the native directory picker SHALL open

#### Scenario: Check for updates entry

- **WHEN** the user invokes the "Check for updates…" menu item on a packaged build
- **THEN** the application SHALL trigger a manual update check and surface the result in the settings UI per the auto-update capability

#### Scenario: Check for updates hidden in development

- **WHEN** the application is running an unpackaged development build
- **THEN** the "Check for updates…" menu item SHALL either be hidden or be disabled with a tooltip indicating that updates are unavailable in development

### Requirement: Clean shutdown of running sessions

When the application quits, it SHALL terminate all running terminal sessions cleanly before exiting. If an application update has been downloaded, the application SHALL apply the update after the clean shutdown completes and relaunch into the new version.

#### Scenario: Quit terminates sessions

- **WHEN** the user quits the application while one or more project sessions are running
- **THEN** the application SHALL send termination signals to every PTY child process and exit only after they have been torn down

#### Scenario: Quit installs a downloaded update

- **WHEN** the user quits the application while an update is in state `downloaded`
- **THEN** the application SHALL terminate all running terminal sessions cleanly and THEN install the downloaded update and relaunch into the new version
