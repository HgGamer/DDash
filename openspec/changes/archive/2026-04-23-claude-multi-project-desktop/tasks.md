## 1. Project Scaffolding

- [x] 1.1 Initialize repo with Electron + Vite + React + TypeScript template
- [x] 1.2 Configure Electron main / preload / renderer processes with `contextIsolation: true`, `nodeIntegration: false`
- [x] 1.3 Add `electron-builder` config for macOS (dmg), Windows (nsis), Linux (AppImage + deb) targets
- [x] 1.4 Add `electron-rebuild` to postinstall so native modules build against the Electron ABI
- [x] 1.5 Set up ESLint, Prettier, TypeScript strict mode, and a basic `npm run dev` / `npm run build` / `npm run dist` pipeline

## 2. Persistence Layer (project-registry)

- [x] 2.1 Define `Project` and `AppState` TypeScript types (`id`, `name`, `path`, `addedAt`, `lastOpenedAt`, `order`, `lastActiveProjectId`, window geometry)
- [x] 2.2 Implement `userData`-backed JSON store with atomic write (temp-file + rename) and debounced saves
- [x] 2.3 Implement registry operations: `list`, `add(path)` (with dedupe by absolute path), `remove(id)`, `rename(id, name)`, `reorder(ids[])`
- [x] 2.4 Implement last-active-project tracking on tab activation and window state save on resize/move/close
- [x] 2.5 Unit tests for registry add/remove/rename/reorder and atomic-write crash safety

## 3. IPC Layer

- [x] 3.1 Define typed IPC channel contracts shared between main and renderer (one file, both sides import)
- [x] 3.2 Implement main-process handlers for `project:list|add|remove|rename|reorder`
- [x] 3.3 Implement main-process handlers for `pty:open|write|resize|close` and emitters for `pty:data|pty:exit`
- [x] 3.4 Expose a minimal, typed API from preload via `contextBridge` (no direct ipcRenderer access in renderer)

## 4. Embedded Terminal (embedded-terminal)

- [x] 4.1 Add `node-pty` and `xterm.js` (+ `xterm-addon-fit`, `xterm-addon-web-links`)
- [x] 4.2 Implement `PtySession` class in main process: spawn with `cwd = project.path`, command = `claude`, env = user login-shell env
- [x] 4.3 Implement login-shell `PATH` resolution (`$SHELL -ilc 'command -v claude'` on macOS/Linux, `where claude` on Windows) with cache
- [x] 4.4 Implement pre-spawn `stat(path)` check; emit structured "path-missing" error instead of spawning
- [x] 4.5 Implement pre-spawn `claude`-not-found detection; emit structured "claude-not-found" error with install-link payload
- [x] 4.6 Wire `xterm.js` component in renderer: subscribe to `pty:data`, forward keystrokes via `pty:write`, call `pty:resize` on fit
- [x] 4.7 Handle `pty:exit`: show exited banner in the terminal pane with an explicit "Start new session" action (no auto-respawn)
- [x] 4.8 Render "path-missing" and "claude-not-found" error states in the terminal pane with their respective actions

## 5. Workspace UI (project-workspace)

- [x] 5.1 Build app layout: fixed left sidebar, flexible main pane
- [x] 5.2 Build sidebar component rendering registry-ordered project rows with active-tab highlight
- [x] 5.3 Implement tab activation: lazy-spawn PTY on first activation in a session; reattach existing session on subsequent activations
- [x] 5.4 Keep inactive tab sessions running in the background (buffer xterm output off-screen)
- [x] 5.5 Render per-project session state indicator (not-started / running / exited) in the sidebar
- [x] 5.6 Implement "Close session" action that terminates the PTY but keeps the project in the registry
- [x] 5.7 Implement "Add Project" button triggering the native directory picker and calling `project:add`
- [x] 5.8 Implement rename (inline edit) and remove (with confirm dialog) from sidebar row context menu
- [x] 5.9 Implement drag-and-drop reordering in the sidebar, persisting order
- [x] 5.10 On launch, preselect `lastActiveProjectId` if the project still exists; show empty-state otherwise

## 6. Desktop Shell (desktop-shell)

- [x] 6.1 Create main window with persisted size/position; sensible defaults on first launch
- [x] 6.2 Implement platform lifecycle: macOS close-to-dock / reopen on activate; Windows/Linux close-to-quit
- [x] 6.3 On quit, terminate every running `PtySession` and await teardown before exit
- [x] 6.4 Build application menu with "Add Project", "Remove Active Project", "Next/Previous Tab", "Quit", each with a platform-appropriate accelerator
- [x] 6.5 Implement Cmd/Ctrl+1..9 shortcuts to activate tabs 1..9 by sidebar order

## 7. Cross-Platform Validation

- [ ] 7.1 Smoke-test a packaged build on macOS: add project, quit, relaunch, open tab, verify `claude` runs
- [ ] 7.2 Smoke-test a packaged build on Windows (ConPTY): verify resize, colors, Ctrl+C behavior in `claude`
- [ ] 7.3 Smoke-test a packaged build on Linux (AppImage): verify PATH resolution picks up `claude` from user's shell
- [ ] 7.4 Verify registry persistence survives force-quit (kill -9) without corruption

## 8. Docs and Release

- [x] 8.1 Write README with install instructions, `claude` prerequisite, and troubleshooting for "claude not found"
- [ ] 8.2 Cut v0.1.0 release with unsigned builds for all three platforms
