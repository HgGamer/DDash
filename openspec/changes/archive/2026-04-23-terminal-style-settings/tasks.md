## 1. Shared types and preset definitions

- [x] 1.1 Define `TerminalStylePreset` enum (`'default' | 'dash-dark'`) and `TerminalStyleSettings` type (`{ version: 1; preset: TerminalStylePreset }`) in `src/shared/types.ts`
- [x] 1.2 Define a shared `TERMINAL_STYLE_PRESETS` record mapping each preset to its xterm.js options (`theme?`, `fontFamily?`, `fontSize?`) — the `default` preset's value is an empty object (no overrides); `dash-dark` mirrors the current hard-coded values

## 2. Main-process persistence

- [x] 2.1 Create `src/main/settings.ts`: load/save JSON settings from userData (e.g. `settings.json`), modeled on `src/main/window-state.ts`; fall back to `{ preset: 'dash-dark', version: 1 }` on missing/corrupt/unknown-preset input and log a warning
- [x] 2.2 Expose `getTerminalStyle()` and `setTerminalStyle(preset)` that read/write the file and emit an IPC event on change
- [x] 2.3 Wire settings load at app startup in `src/main/index.ts`

## 3. IPC surface

- [x] 3.1 Add IPC channel names/shapes in `src/shared/ipc.ts` for `settings:getTerminalStyle`, `settings:setTerminalStyle`, and a push event `settings:terminalStyleChanged`
- [x] 3.2 Register handlers in `src/main/ipc.ts` delegating to `src/main/settings.ts`
- [x] 3.3 Expose `window.api.settings.getTerminalStyle`, `setTerminalStyle`, and `onTerminalStyleChanged(cb)` via `src/preload/index.ts`

## 4. Renderer store

- [x] 4.1 Add a `terminalStyle` slice to `src/renderer/src/store.ts` holding the current preset (initialized to `'dash-dark'` until hydrated)
- [x] 4.2 On app bootstrap (in `App.tsx` or `main.tsx`), fetch the persisted preset via IPC and hydrate the store; subscribe to `onTerminalStyleChanged` to keep it in sync

## 5. TerminalPane wiring

- [x] 5.1 Remove the hard-coded `theme`, `fontFamily`, `fontSize` from the `new Terminal({...})` call in `src/renderer/src/components/TerminalPane.tsx`; instead read the active preset from the store and pass the preset's options at construction time (empty-object spread for `default`)
- [x] 5.2 Add an effect that subscribes to preset changes and, for the existing `Terminal` instance, mutates `term.options.theme`, `term.options.fontFamily`, `term.options.fontSize` (setting each back to `undefined` when the new preset has no override) and then calls `fit.fit()`
- [x] 5.3 Verify that PTY session, scrollback, and any running `claude` process survive a preset change unchanged (code-level: the effect only mutates `term.options.*` and calls `fit.fit()` — no remount, `term.dispose()`, `term.clear()`, or `pty.close`; PTY lives in the main process and is untouched by xterm option changes)

## 6. Settings UI

- [x] 6.1 Add a `TerminalStyleSettings` modal component under `src/renderer/src/components/` with a preset picker (radio list) labeled `Default terminal style (xterm)` and `Dash dark`, showing the currently active preset
- [x] 6.2 Wire the picker to call `window.api.settings.setTerminalStyle` on change so persistence + live-apply happen via the existing flow
- [x] 6.3 Add "Terminal Style…" entry under the View menu in `src/main/menu.ts`, dispatching an IPC event that the renderer handles by opening the modal

## 7. Tests and verification

- [x] 7.1 Add unit tests for `src/main/settings.ts` covering: fresh install defaults to `dash-dark`, round-trip save/load, corrupt-JSON fallback, unknown-preset fallback (see `test/settings.test.ts`)
- [ ] 7.2 Manual verification checklist (user to run via `npm run dev`):
  - [ ] `View → Terminal Style…` opens the modal
  - [ ] Switching to `Default terminal style` removes the black background and custom font on all open panes
  - [ ] Switching back to `Dash dark` restores the black background and SF Mono / Menlo font
  - [ ] A running `claude` session is not interrupted by a preset change (no restart banner, scrollback preserved)
  - [ ] Setting persists across app restarts
- [x] 7.3 Run `npm run typecheck` and `npm run lint` clean
