## Why

Users who run Claude Code across multiple local projects currently juggle separate terminal windows, tabs, and `cd` invocations, and lose context every time they restart their terminal. A dedicated cross-platform desktop app that keeps per-project Claude sessions organized as persistent tabs removes that friction and lets users resume work instantly.

## What Changes

- Introduce a new cross-platform desktop application (macOS, Windows, Linux) that hosts multiple concurrent Claude Code sessions, one per project.
- Provide a left-hand sidebar listing all registered projects as selectable tabs, with the active project's embedded terminal shown in the main area.
- Allow users to add a project by choosing a local directory; persist the project list (name, path, last-opened timestamp) across app restarts.
- When a project tab is opened, spawn a terminal in that project's working directory and launch the `claude` CLI automatically.
- Let users remove or rename projects, and reorder tabs.
- Persist app state (registered projects, last-active tab, window size) between launches.

## Capabilities

### New Capabilities

- `project-registry`: Persisted list of user-added projects (name, absolute path, metadata) with add/remove/rename/reorder operations and cross-launch durability.
- `project-workspace`: Tabbed workspace UI that renders the project list on the left and the active project's terminal pane in the main area, including tab activation, session lifecycle, and restoration of last-active tab on launch.
- `embedded-terminal`: Embedded PTY-backed terminal component that runs in a specified working directory, auto-launches the `claude` CLI, and streams I/O to the UI.
- `desktop-shell`: Cross-platform desktop shell (window, menus, app lifecycle, persisted window state) that hosts the workspace UI.

### Modified Capabilities

<!-- None; greenfield project. -->

## Impact

- New repository scaffolding: desktop shell framework (e.g., Electron or Tauri), renderer UI stack, and a terminal emulator component (e.g., xterm.js + node-pty or equivalent).
- New persistence layer for the project registry and app state (local JSON/SQLite under the OS user-data directory).
- Runtime dependency: the `claude` CLI must be installed and discoverable on the user's PATH; the app surfaces a clear error otherwise.
- Packaging/distribution pipeline for macOS, Windows, and Linux builds.
- No existing APIs or specs are affected (greenfield).
