## Context

The project is greenfield: a cross-platform desktop app (macOS, Windows, Linux) that lets a user run Claude Code (the `claude` CLI) across multiple local projects simultaneously, each in its own tab. Users add a project once, and the app remembers it, so reopening a tab after a restart spawns a fresh terminal in that project's directory and launches `claude` automatically.

Key constraints:
- Must embed a real PTY-backed terminal (Claude Code is an interactive TUI) — a plain stdout log pane is insufficient.
- Must run on macOS, Windows, and Linux with a single codebase.
- Must persist a project registry and window/tab state across restarts.
- Depends on the user having `claude` installed and on PATH.

## Goals / Non-Goals

**Goals:**
- Single desktop app hosting N concurrent Claude Code sessions, one per registered project.
- Sidebar of projects on the left, active project's embedded terminal in the main area.
- "Add project" picks a directory; entry persists and survives restarts.
- Opening a project tab spawns a PTY in that directory and runs `claude`.
- Remove, rename, and reorder projects; restore last-active tab on launch.

**Non-Goals:**
- No remote/SSH projects in v1 (local directories only).
- No built-in editor, file tree, or git UI — the terminal is the interface.
- No cloud sync of the project registry — local-only persistence.
- No bundling of the `claude` CLI — users install it themselves.
- No multi-window support in v1 (single main window).

## Decisions

### Desktop shell: Electron

Electron over Tauri. Rationale: the best-maintained cross-platform PTY + terminal stack (`node-pty` + `xterm.js`) runs in Node, which Electron hosts natively. Tauri would require bridging node-pty-equivalent Rust crates (`portable-pty`) to a webview, which is doable but adds friction for a v1 where terminal fidelity is the whole product. Trade-off: larger install size and higher memory footprint accepted in exchange for implementation velocity and terminal reliability.

Alternatives considered: Tauri (rejected for reasons above), Qt/C++ (rejected — too much UI surface area to build from scratch), web-only (rejected — cannot spawn local processes).

### Terminal stack: xterm.js + node-pty

`xterm.js` in the renderer, `node-pty` in the main (or a utility) process, bridged via Electron IPC. Rationale: this is the de-facto stack used by VS Code's integrated terminal, proven across all three platforms including Windows (ConPTY).

Each tab owns one PTY. The PTY's initial command is `claude` launched with `cwd` set to the project path and the user's default shell environment inherited. If the PTY exits (user types `/exit` or kills claude), the tab shows an "exited — press Enter to restart" affordance rather than auto-respawning, so runaway crash loops are impossible.

### UI framework: React + Vite + TypeScript

Standard modern stack in the renderer. State lives in a lightweight store (Zustand) — the state is small (project list, active tab id, per-tab PTY status).

### Persistence: JSON file in userData dir

Registry and window state stored as `projects.json` and `window.json` in Electron's `app.getPath('userData')`. Rationale: the data is tiny (tens of projects at most), schema is simple, and a JSON file is trivially inspectable and portable. Writes are debounced and atomic (write-temp-then-rename) to avoid corruption.

Schema sketch:
```json
{
  "version": 1,
  "projects": [
    { "id": "uuid", "name": "dash", "path": "/Users/…/dash", "addedAt": "…", "lastOpenedAt": "…", "order": 0 }
  ],
  "lastActiveProjectId": "uuid"
}
```

Alternatives considered: SQLite (overkill for this shape), `electron-store` (fine, but a thin wrapper we don't need).

### Process model

- Main process: app lifecycle, window, persistence, PTY spawning/ownership, IPC router.
- Renderer: React UI, xterm.js instances. No direct `node-pty` access from the renderer (contextIsolation: true, nodeIntegration: false).
- IPC channels: `project:list`, `project:add`, `project:remove`, `project:rename`, `project:reorder`, `pty:open`, `pty:write`, `pty:resize`, `pty:close`, `pty:data` (main→renderer), `pty:exit` (main→renderer).

### Locating the `claude` binary

Resolve `claude` against the user's login shell `PATH` (not Electron's sanitized `PATH`) by spawning `$SHELL -ilc 'command -v claude'` on first launch and caching the result. On Windows, fall back to `where claude`. If not found, the tab opens a plain shell and displays a banner explaining how to install Claude Code.

### Tab reopen semantics

"Remembering" a project means the project's metadata is persisted; it does **not** mean the PTY/session state is preserved across restarts. When the app starts, tabs are rendered for the persisted project list, but no PTYs are spawned until the user activates a tab. Activating a tab for the first time in a session spawns a fresh PTY + `claude`. This matches user expectation (terminals don't survive reboots) and keeps the design simple.

## Risks / Trade-offs

- [Electron bundle size ~100MB] → Acceptable for a developer tool; document in README.
- [node-pty requires native rebuild per Electron version / arch] → Use `electron-rebuild` in the build pipeline; ship platform-specific artifacts via `electron-builder`.
- [Windows ConPTY quirks (resize, ANSI)] → Rely on xterm.js + node-pty's ConPTY backend, which VS Code exercises heavily; add a smoke-test matrix.
- [`claude` not on PATH] → Detect at PTY spawn time, surface a friendly error in the terminal pane rather than crashing the tab.
- [Project path becomes invalid (moved/deleted)] → On PTY spawn, `stat` the path first; if missing, show an in-tab error with "Locate…" and "Remove project" actions.
- [Many concurrent PTYs = memory/CPU] → No hard cap in v1, but lazy-spawn (only when tab activated) keeps idle cost near zero.
- [Unsigned builds trigger OS warnings] → v1 ships unsigned; signing/notarization deferred.

## Migration Plan

Greenfield — no migration. First release is v0.1.0.

## Open Questions

- Should the sidebar show live indicators (running / idle / exited) per tab? Lean yes, but cosmetic — defer decision to implementation.
- Do we want a global keyboard shortcut to cycle tabs (Cmd/Ctrl+1..9)? Likely yes in v1 but not a blocker.
- Theme: follow OS dark/light, or ship with a fixed dark theme? Defer; start with OS-follow.
