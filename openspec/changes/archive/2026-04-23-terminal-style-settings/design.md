## Context

`TerminalPane` hard-codes its xterm.js construction options — `theme: { background: '#000000' }`, a fixed font-family string, and `fontSize: 13`. There is no user-facing settings surface in Dash today; preferences that do survive restarts (window geometry, project registry) live under `src/main/` using filesystem-backed JSON (`window-state.ts`, `registry.ts`). IPC is already organized via `src/shared/ipc.ts` → `src/preload/index.ts` → `src/main/ipc.ts`.

The "default terminal style" the user asked for is the style xterm.js applies when constructed with no `theme`/`fontSize`/`fontFamily` overrides — a neutral, system-like look that is visually close to a plain terminal emulator. This is the easiest and most portable definition of "default": we simply do not pass overrides.

## Goals / Non-Goals

**Goals:**
- A persistent, user-selectable terminal style, with a "Default terminal style" preset that clears Dash's custom overrides.
- Changes apply live to every open `TerminalPane`, without tearing down the PTY session.
- Settings state lives in one place (main process, on disk) and is mirrored into the renderer store for reactive UI.
- Existing users see no visual change on upgrade (migration defaults to the current "Dash dark" look).

**Non-Goals:**
- Full ANSI 16-color palette editor, custom theme JSON import, or per-project styles.
- Reading the user's actual Terminal.app / iTerm2 / Windows Terminal profile from disk.
- Syncing style across devices.
- Changes to PTY, shell resolution, or `claude` spawning.

## Decisions

### 1. "Default terminal style" means "no style overrides"

We construct `new Terminal({...})` without `theme`, `fontFamily`, or `fontSize` when the user picks the default preset. Rationale: xterm.js already defines sensible defaults; reproducing the native OS terminal exactly is out of scope and brittle. Alternative considered: probe the OS for the user's terminal profile — rejected as high-effort and low-reward for a "reset to plain" use case.

### 2. Preset-based model, not free-form editor (for v1)

Settings are a small enum of named presets (`default`, `dash-dark`) plus, optionally, font-size override. Rationale: the requested feature is "load the default terminal style" — a preset switcher covers it; a full editor is a much bigger change and can be layered in later as additional presets or a "custom" option.

### 3. Persistence in the main process, mirrored in renderer

Main process owns the canonical settings file (new `src/main/settings.ts`, JSON under the app's userData dir, same pattern as `window-state.ts`). Renderer reads it at startup via IPC and subscribes to change events. Rationale: matches existing Dash persistence pattern; avoids renderer-only `localStorage` which doesn't survive profile resets and isn't reachable from the main process (menu).

### 4. Live-apply via xterm.js mutable options

xterm.js supports mutating `term.options.theme`, `term.options.fontFamily`, `term.options.fontSize` on an existing instance followed by `fit.fit()`. `TerminalPane` will subscribe to the renderer store and call these setters on change. Rationale: avoids dropping the PTY session or scrollback. Alternative considered: remount the terminal — rejected because it would interrupt any running `claude` session.

### 5. Settings surface: modal dialog reached from the app menu

A new `View → Terminal Style…` menu item opens a simple modal (`TerminalStyleSettings` component) with a preset picker and a live preview-on-apply. Rationale: aligns with existing `src/main/menu.ts` pattern and keeps the workspace chrome uncluttered. A gear icon in the sidebar is a reasonable v2 addition but is not required by the feature request.

## Risks / Trade-offs

- [Users expect their OS terminal's exact colors/fonts] → Mitigation: label the preset "Default terminal style (xterm)" in the UI so expectations are calibrated; document in the modal that it resets Dash overrides rather than importing from Terminal.app.
- [Live-mutation of xterm options misses an edge case and requires refit] → Mitigation: always call `FitAddon.fit()` after mutation; fall back to a remount only if a future preset changes something xterm doesn't support mutating.
- [Settings file corruption on disk] → Mitigation: on JSON parse failure, fall back to the `dash-dark` default and log a warning; do not crash the app (same policy as `window-state.ts`).
- [Schema churn when we add more presets/fields later] → Mitigation: store `{ version: 1, preset: 'default' | 'dash-dark', fontSize?: number }` from the start; unknown preset values fall back to `dash-dark`.

## Migration Plan

- First run after upgrade: no settings file exists → load `dash-dark` preset → visual appearance unchanged.
- Rollback: deleting `settings.json` in userData restores defaults; no schema migration needed since this is the first settings file.
