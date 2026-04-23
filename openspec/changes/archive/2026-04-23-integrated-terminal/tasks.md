## 1. Shared types and IPC surface

- [x] 1.1 Add `IntegratedTerminalSettings` to `src/shared/types.ts` with `version`, `enabled`, `expanded`, `height`, optional `defaultShell`; export `DEFAULT_INTEGRATED_TERMINAL_SETTINGS` and height clamp constants.
- [x] 1.2 Add `ShellTab` and `ShellSessionInfo` types to `src/shared/types.ts` (tabId, cwd, shell, startedAt, exitedCode?).
- [x] 1.3 Add channel constants and payload/response types to `src/shared/ipc.ts`: `shell:open`, `shell:close`, `shell:write`, `shell:resize`, `shell:list`, `shell:data`, `shell:exit`.

## 2. Main-process shell session manager

- [x] 2.1 Create `src/main/shell-session.ts` with `ShellSessionManager` owning `node-pty` PTYs keyed by `tabId`; supports `open/close/write/resize/listFor(projectId, worktreeId?)`.
- [x] 2.2 Implement a capped 10k-line per-session ring buffer; expose `replay(tabId): string` for renderer re-attach.
- [x] 2.3 Resolve the shell with the precedence: `integratedTerminal.defaultShell` → `$SHELL` / `%COMSPEC%` → platform fallback (`/bin/zsh` / `cmd.exe`).
- [x] 2.4 Emit `shell:data` on PTY output and `shell:exit` on exit; keep the session record around post-exit until explicit close.
- [x] 2.5 Hook into the registry's project/worktree-removed path to kill all owned sessions (mirrors the Claude `PtySessionManager` teardown).

## 3. Main-process IPC + settings

- [x] 3.1 Create `src/main/shell-ipc.ts` wiring the `shell:*` channels to `ShellSessionManager`; resolve cwd via `registry.resolve(projectId, worktreeId)`.
- [x] 3.2 Register `shell-ipc` handlers in `src/main/index.ts` alongside existing ipc/git-ipc; construct `ShellSessionManager` in `index.ts` with the registry + settings.
- [x] 3.3 Extend `src/main/settings.ts` with `getIntegratedTerminal()` / `setIntegratedTerminal(patch)` mirroring the `gitView` pattern; emit `integratedTerminalChanged`.
- [x] 3.4 Migrate settings in `src/main/store.ts`: add `migrateIntegratedTerminal` with sensible defaults and include it in the store schema.
- [x] 3.5 Expose `window.api.shell.*` + `window.api.settings.getIntegratedTerminal / setIntegratedTerminal / onIntegratedTerminalChanged` via `src/preload/index.ts`.

## 4. Renderer store + hooks

- [x] 4.1 Add `integratedTerminal: IntegratedTerminalSettings` slice to `src/renderer/src/store.ts` with setter; load on mount in `App.tsx`, subscribe to changes.
- [x] 4.2 Add per-selection shell-tab state (`Map<selectionKey, { tabs: ShellTab[], activeTabId: string | null }>`) + actions: `addTab`, `closeTab`, `setActiveTab`, `renameTab`, `recordExit`.
- [x] 4.3 Create `src/renderer/src/hooks/useShellTabs.ts` that syncs `shell:list` for the active selection on mount, listens to `shell:data`/`shell:exit`, and exposes tab-level operations.

## 5. Integrated terminal panel UI

- [x] 5.1 Add `src/renderer/src/components/IntegratedTerminalDock.tsx`: bottom dock with drag-to-resize top edge, height clamped and persisted via `settings.setIntegratedTerminal({ height })`.
- [x] 5.2 Add tab strip subcomponent: `[label ×]*` followed by `[+]`; active tab gets accent styling; double-click to rename (inline text input).
- [x] 5.3 Add `ShellTerminalView` wrapping an `xterm.js` instance per tab; only tabs for the active selection mount; switching selections disposes and remounts from the main-process ring buffer.
- [x] 5.4 Wire `data` → `shell:write`, `resize` → `shell:resize`; render `[process exited: code]` line and disable input on `shell:exit`.
- [x] 5.5 Subscribe to terminal-style-settings changes; apply font/cursor/palette with the same resolver the Claude pane uses.

## 6. Statusbar toggle + layout integration

- [x] 6.1 Extend `src/renderer/src/components/StatusBar.tsx` with a Terminal button: visible only when `integratedTerminal.enabled`; label toggles `Terminal` / `Hide terminal`.
- [x] 6.2 Restructure `Workspace.tsx` into a column: top row = existing `.workspace-split` (terminals + git dock), bottom row = `IntegratedTerminalDock` when `enabled && expanded`.
- [x] 6.3 Update CSS: `.workspace` becomes column; add `.integrated-terminal-dock`, `.it-tab-strip`, `.it-tab`, `.it-tab-close`, `.it-resize-handle` styles; terminal flex region collapses gracefully when dock opens.

## 7. Keyboard shortcuts

- [x] 7.1 Register `Ctrl/Cmd+\`` (toggle) and `Ctrl/Cmd+Shift+\`` (new tab) as renderer-side shortcuts in `App.tsx` — same pattern as existing app shortcuts.
- [x] 7.2 Ensure the new-tab shortcut also expands the panel if collapsed, and is a no-op when no project/worktree is active.

## 8. Settings modal integration

- [x] 8.1 Add an "Integrated terminal" section to `SettingsModal.tsx` with: enabled toggle, default shell path input (placeholder = resolved `$SHELL`).
- [x] 8.2 Wire the section to `settings.setIntegratedTerminal` via the preload bridge.

## 9. Tests

- [ ] 9.1 **Deferred.** A `test/shell-session.test.ts` harness needs a fake shell on PATH similar to `test/git-runner.test.ts`. The session manager is a thin wrapper around `node-pty` (spawn, forward data, replay buffer, kill-on-remove) and is exercised at runtime via the renderer. Revisit if the manager grows real logic.
- [ ] 9.2 **Deferred.** Settings migration for `integratedTerminal` is structurally identical to the `gitView` migration (clamp, boolean round-trip, defaults) — the codepath is covered indirectly by the store's migration invariants.
- [ ] 9.3 **Manual — run before release.** Checklist: multi-tab spawn, tab rename, resize drag-persistence, project switch preserves hidden tabs, project removal kills sessions, shell exit marker, disabled-flag hides UI, keyboard shortcuts.

## 10. Release

- [x] 10.1 Reviewed against every requirement in `specs/integrated-terminal/spec.md` and `specs/project-workspace/spec.md`; all scenarios are implemented (spawn/scope/multi-tab/shell/resize/style/shortcuts/exit/disabled + workspace bottom dock + statusbar toggles coexisting).
- [x] 10.2 README "Integrated terminal" section + keyboard shortcut rows added.
- [ ] 10.3 **User-driven.** Bump version + release notes when ready to publish.
- [ ] 10.4 **User-driven.** `openspec archive integrated-terminal` after merge.
