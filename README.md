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

## Keyboard shortcuts

| Action             | macOS              | Win/Linux          |
| ------------------ | ------------------ | ------------------ |
| Add Project        | Cmd+O              | Ctrl+O             |
| Remove Active      | Cmd+Backspace      | Ctrl+Delete        |
| Next Tab           | Cmd+Alt+Right      | Ctrl+Tab           |
| Previous Tab       | Cmd+Alt+Left       | Ctrl+Shift+Tab     |
| Activate Tab 1..9  | Cmd+1..9           | Ctrl+1..9          |

## Status

v0.1.0 — alpha. Unsigned builds. Local projects only (no SSH/remote).
