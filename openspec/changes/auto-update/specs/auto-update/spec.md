## ADDED Requirements

### Requirement: Automatic update checks against the GitHub release feed

The application SHALL check for newer published releases against the GitHub Releases feed when running a packaged build, on startup and on a recurring 6-hour interval, unless the user has disabled automatic updates. Update checks SHALL be skipped silently in development (unpackaged) builds and on platforms not supported by the in-app updater (currently the Linux `.deb` package).

#### Scenario: Startup check on a packaged build

- **WHEN** a packaged build of the application launches and `autoUpdate.enabled` is `true`
- **THEN** the application SHALL query the configured GitHub release feed for the user's channel within 60 seconds of startup, update `autoUpdate.lastCheckedAt` on completion, and emit an `available` state if a newer version exists

#### Scenario: Recurring check while running

- **WHEN** the application has been running continuously for 6 hours since the last check and `autoUpdate.enabled` is `true`
- **THEN** the application SHALL perform another release-feed check and update its internal state accordingly

#### Scenario: Auto-check disabled

- **WHEN** the user has set `autoUpdate.enabled` to `false`
- **THEN** the application SHALL NOT perform startup or recurring update checks, and SHALL NOT download updates in the background

#### Scenario: Development build

- **WHEN** the application is launched from `electron-vite dev` or any unpackaged build
- **THEN** the updater SHALL report state `idle` with a "disabled in development" reason, and SHALL NOT contact the release feed

#### Scenario: Unsupported package format

- **WHEN** the application is running from a Linux `.deb` install or any other format unsupported by `electron-updater`
- **THEN** the updater SHALL report state `idle` with an "unsupported package format" reason, and the user-facing UI SHALL display a notice that updates are managed by the system package manager

### Requirement: Background download of available updates

When a newer release is detected and the user has not opted out, the application SHALL download the update artifact in the background without blocking the UI or interrupting running terminal sessions.

#### Scenario: Update available triggers download

- **WHEN** an update check reports a version newer than the running version
- **THEN** the application SHALL transition to state `downloading`, fetch the platform-appropriate artifact, and emit progress events (bytes transferred and percentage) to the renderer

#### Scenario: Download completes successfully

- **WHEN** the update artifact has been fully downloaded and its signature/checksum verified
- **THEN** the application SHALL transition to state `downloaded` and notify the renderer with the new version number

#### Scenario: Download fails

- **WHEN** the update download fails due to a network error, signature mismatch, or interrupted transfer
- **THEN** the application SHALL transition to state `error` with a human-readable message, SHALL NOT install the partial artifact, and SHALL retry on the next scheduled check

### Requirement: User-initiated install on quit or explicit restart

When an update has been downloaded, the application SHALL apply it either at the user's next quit or immediately when the user explicitly requests "Restart and update". The application SHALL NOT auto-restart without user action.

#### Scenario: Install on quit

- **WHEN** an update is in state `downloaded` and the user quits the application via the standard quit flow
- **THEN** the application SHALL terminate running terminal sessions cleanly per the existing shutdown path, and THEN invoke the updater to install the downloaded artifact and relaunch into the new version

#### Scenario: Restart and update now

- **WHEN** an update is in state `downloaded` and the user activates the "Restart and update" control
- **THEN** the application SHALL prompt for confirmation if any terminal session is running, terminate those sessions cleanly, install the artifact, and relaunch into the new version

#### Scenario: No silent restart

- **WHEN** an update has been downloaded but the user has neither quit nor invoked "Restart and update"
- **THEN** the application SHALL keep running on the current version indefinitely and SHALL NOT restart on its own

### Requirement: Manual "Check for updates" action

The application SHALL expose a manual "Check for updates…" action in the application menu and the settings UI that bypasses the recurring schedule and reports the result to the user.

#### Scenario: Manual check finds an update

- **WHEN** the user invokes "Check for updates…" and a newer release exists
- **THEN** the application SHALL transition through `checking` to `available` and begin downloading, and the UI SHALL surface the new version number

#### Scenario: Manual check finds nothing

- **WHEN** the user invokes "Check for updates…" and the running version is current
- **THEN** the application SHALL briefly show a "You are up to date" confirmation in the settings UI and return to state `idle`

#### Scenario: Manual check while a download is in progress

- **WHEN** the user invokes "Check for updates…" while an update is already downloading or downloaded
- **THEN** the application SHALL ignore the request and surface the current update state instead of starting a new check

### Requirement: Update channel selection

The application SHALL allow the user to choose between a `stable` channel (default) and a `beta` channel. The selected channel SHALL determine which release feed entries are eligible for auto-update.

#### Scenario: Default channel is stable

- **WHEN** the application launches for the first time with no persisted channel preference
- **THEN** `autoUpdate.channel` SHALL default to `stable` and only non-prerelease versions SHALL be considered for update

#### Scenario: Switching to beta

- **WHEN** the user changes the channel setting to `beta`
- **THEN** the next update check SHALL include pre-release versions tagged with the `beta` channel and SHALL offer the highest such version newer than the running version

#### Scenario: Switching back to stable on a beta build

- **WHEN** the user is running a beta build and switches the channel back to `stable`
- **THEN** subsequent checks SHALL only consider stable releases, and the user SHALL be notified that they remain on the current beta until a stable release with a higher version number is published

### Requirement: Update state and version visible in settings

The application SHALL expose the current application version, the timestamp of the last successful update check, the current update state, and any pending update version through a renderer-accessible IPC surface, and SHALL render this information in the settings or about UI.

#### Scenario: Settings shows current version and last check

- **WHEN** the user opens the settings/about panel
- **THEN** the panel SHALL display the running version string, `autoUpdate.lastCheckedAt` formatted in the user's locale (or "Never" if null), and the current updater state

#### Scenario: Pending update is visible

- **WHEN** an update is in state `available`, `downloading`, or `downloaded`
- **THEN** the settings panel SHALL display the target version and, for `downloading`, a progress percentage

### Requirement: Persisted auto-update preferences

The application SHALL persist auto-update preferences across restarts in the main-process settings store, and SHALL expose IPC handlers to read and write them from the renderer.

#### Scenario: Preferences survive restart

- **WHEN** the user toggles `autoUpdate.enabled` or changes `autoUpdate.channel` and then quits and relaunches the application
- **THEN** the new values SHALL be in effect on the next launch

#### Scenario: Last-checked timestamp persists

- **WHEN** the application performs a successful update check
- **THEN** `autoUpdate.lastCheckedAt` SHALL be persisted with the check's completion time and SHALL survive restart
