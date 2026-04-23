## Why

The embedded terminal currently hard-codes its visual style (black background, a fixed mono font stack, 13px font size). Users who prefer the look of their system terminal — or simply want to reset after experimenting — have no way to change or revert the terminal appearance from within Dash.

## What Changes

- Add a terminal-style settings surface (accessible from the app menu and/or a gear affordance in the workspace) where users can view and change the terminal's visual style.
- Introduce a named "Default terminal style" preset that loads the xterm.js defaults (no forced background theme, default font sizing) so users can one-click revert to a familiar, plain terminal appearance.
- Ship a second "Dash dark" preset that matches today's hard-coded look, so current users are not visually surprised.
- Persist the chosen style in the user's settings store so it survives app restarts, and apply it to all terminal panes (existing and newly spawned).
- Apply style changes live to open `TerminalPane` instances without requiring a session restart.

## Capabilities

### New Capabilities
- `terminal-style-settings`: User-facing settings for the embedded terminal's visual style, including presets (at minimum "Default terminal style" and "Dash dark"), persistence across restarts, and live application to open terminals.

### Modified Capabilities
- `embedded-terminal`: The terminal pane's theme, font family, and font size are no longer fixed at mount time; they are read from the terminal-style settings and update live when settings change.

## Impact

- Code: `src/renderer/src/components/TerminalPane.tsx` (read style from store instead of hard-coded values, subscribe to changes); a new settings view/component in `src/renderer/src/components/`; renderer store (`src/renderer/src/store.ts`) gains a terminal-style slice; main-process settings persistence (likely alongside `src/main/store.ts` / `window-state.ts`) and IPC surface (`src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc.ts`).
- UX: New menu entry (e.g. `View → Terminal Style…`) opens the settings surface.
- Persistence: One new on-disk settings field; migration is trivial (absence defaults to "Dash dark" to preserve current behavior).
- No changes to PTY, shell, or `claude` spawning behavior.
