## Why

Users frequently need a regular shell alongside Claude — to run the dev server, run tests, inspect files, kick off builds — without leaving dash or context-switching to an external terminal. The existing terminal pane is dedicated to the Claude CLI process and isn't available for ad-hoc shell work. A docked, tabbed shell panel scoped to the active project/worktree removes that friction and keeps the working-directory context aligned with what the user is already looking at.

## What Changes

- Add a bottom-docked terminal panel underneath the main workspace terminal, toggled from a new **Terminal** button on the statusbar (next to the existing Git toggle).
- Panel is **per project/worktree**: each `ActiveSelection` has its own set of shell tabs; switching projects/worktrees swaps the tab set so sessions stay pinned to the directory they were opened in.
- Support **multiple tabs** within the panel — add (`+`), close (`×`), rename, and switch between them. New tabs spawn the user's login shell (`$SHELL`, falling back to `/bin/zsh` / `%COMSPEC%`) with cwd set to the project or worktree path.
- Panel is **resizable** (drag the top edge) and **collapsible**; expanded/collapsed state and panel height persist across restarts in `settings.json` under a new `integratedTerminal` section (global UI preference, not per-project).
- Shell sessions persist for the lifetime of the app process — toggling the panel closed hides the UI but keeps processes alive, so a running `npm run dev` keeps going.
- Sessions are **cleaned up** when their owning project/worktree is removed (same lifecycle hook that already tears down Claude sessions).
- Shell tabs inherit the existing **terminal style settings** (font family, size, cursor, palette) so they match the Claude pane visually with zero extra config.
- Ctrl/Cmd+\` toggles the panel; Ctrl/Cmd+Shift+\` opens a new tab in the active project/worktree.

## Capabilities

### New Capabilities
- `integrated-terminal`: Bottom-docked, tabbed shell panel scoped per project/worktree, with lifecycle tied to project removal, visual styling shared with the Claude pane, and persisted panel UI state.

### Modified Capabilities
- `project-workspace`: Workspace layout gains a bottom dock region; the statusbar hosts a new Terminal toggle alongside the existing Git toggle.

## Impact

- **Main process**: new IPC surface (`shell:open`, `shell:close`, `shell:write`, `shell:resize`, `shell:list`, `shell:data` event) backed by a `ShellSessionManager` that owns `node-pty` PTYs keyed by `(projectId, worktreeId?, tabId)`. Hooks into the existing project/worktree removal path to kill sessions.
- **Renderer**: new `IntegratedTerminalDock` component wrapping xterm.js instances (one per tab), plus tab bar, resize handle, and statusbar toggle. Renderer store gains per-selection shell-tab state.
- **Shared types**: `ShellTab`, `ShellSessionId`, `IntegratedTerminalSettings`, new IPC channel constants.
- **Settings**: `integratedTerminal: { enabled, expanded, height, defaultShell? }` added to the persisted config with migration defaults.
- **No new dependencies** — reuses `node-pty` (already used for Claude sessions) and `xterm` (already bundled for the main pane).
- **Shortcuts**: two new global shortcuts; no conflicts expected.
