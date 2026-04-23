# Dash

Cross-platform desktop app for running [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) across multiple projects in tabs.

Each tab hosts a real PTY-backed terminal running `claude` in the project's directory. Add a project once and Dash remembers it; on next launch, opening the tab spawns a fresh `claude` session in that directory.

## Prerequisites

- **Node.js 20+** (for development)
- **Claude Code CLI** installed and available on your `PATH`
  - Install instructions: <https://docs.claude.com/en/docs/claude-code/quickstart>
  - Verify with `claude --version` in your normal terminal.

## Development

```bash
npm install
npm run dev
```

The dev command launches Electron with hot-reload for main / preload / renderer.

## Build & distribute

```bash
npm run dist          # current platform
npm run dist:mac      # macOS dmg (arm64 + x64)
npm run dist:win      # Windows NSIS installer
npm run dist:linux    # Linux AppImage + deb
```

Output lands in `release/<version>/`. Builds are unsigned in v0.1.

## Tests

```bash
npm test
```

## Troubleshooting

### "Claude not found"

Dash resolves `claude` against your **login shell**'s `PATH` (not Electron's sanitized environment). If you see a "Claude not found" banner:

1. Open your normal terminal and run `command -v claude` (macOS/Linux) or `where claude` (Windows). If that fails, Claude Code is not installed — follow the [quickstart](https://docs.claude.com/en/docs/claude-code/quickstart).
2. If `claude` resolves in your terminal but not in Dash, ensure the `PATH` export is in your login-shell rc (`.zprofile`, `.bash_profile`, `.profile`) and not only in `.bashrc`/`.zshrc`'s non-login branch. Quit and relaunch Dash after fixing.

### "Project path not found"

The project directory was moved, renamed, or deleted after you added it. Click **Remove project** and re-add it, or restore the directory.

## Project layout

```
src/
  main/         Electron main process (IPC, PTY, persistence, window, menu)
  preload/      Context-bridge API exposed as window.api
  renderer/     React + xterm.js UI
  shared/       Types and IPC channel constants shared by main + renderer
test/           Vitest unit tests
openspec/       Specification and change history
```

## Git view

Each tab has a collapsible **Git view** panel on the right that reflects the active project's (or worktree's) repository:

- Status: staged / unstaged / untracked files with click-to-stage and per-file diff preview.
- Commit: subject + optional description.
- Branches: switch, create new from HEAD (disabled on worktree tabs — each worktree is pinned to its branch).
- Push to the tracked upstream; errors surface inline, including the "no upstream" case.
- Commit history (up to ~500 commits) with HEAD and branch-tip markers.

Toggle with the **Git** button in the terminal's top-right. Turn the whole feature off under **Settings → Git** if you want to reclaim the window width. The view relies on the system `git` binary being on `PATH`.

## Integrated terminal

A bottom-docked **terminal panel** sits underneath the Claude pane for running dev servers, tests, scripts, and anything else you'd normally open an external terminal for:

- **Per project/worktree** — switching projects swaps the tab set; backgrounded shells keep running.
- **Multiple tabs** per selection (`+` to add, `×` to close, double-click a tab to rename).
- **Resizable**; height and expanded/collapsed state persist across restarts.
- **Process survives panel collapse** — hiding the dock does not kill shells.
- Uses your login shell (`$SHELL` on macOS/Linux, `%COMSPEC%` on Windows). Override under **Settings → Integrated terminal**.
- Shares the terminal style (font/cursor/palette) with the Claude pane.

Toggle with the **Terminal** button in the bottom statusbar or with `Ctrl/Cmd+\``. `Ctrl/Cmd+Shift+\`` opens a new tab in the active project/worktree.

## Keyboard shortcuts

| Action             | macOS              | Win/Linux          |
| ------------------ | ------------------ | ------------------ |
| Add Project        | Cmd+O              | Ctrl+O             |
| Remove Active      | Cmd+Backspace      | Ctrl+Delete        |
| Next Tab           | Cmd+Alt+Right      | Ctrl+Tab           |
| Previous Tab       | Cmd+Alt+Left       | Ctrl+Shift+Tab     |
| Activate Tab 1..9  | Cmd+1..9           | Ctrl+1..9          |
| Toggle terminal    | Cmd+`              | Ctrl+`             |
| New terminal tab   | Cmd+Shift+`        | Ctrl+Shift+`       |

## Status

v0.1.0 — alpha. Unsigned builds. Local projects only (no SSH/remote).
