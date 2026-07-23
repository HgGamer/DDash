## Context

The renderer owns theme state in `lib/theme.ts` + `store.ts`, applied via a
`data-theme` attribute on `<html>` and CSS token overrides in `styles/tokens.css`.
The main process creates the `BrowserWindow` with `vibrancy: 'sidebar'` on macOS.
Today the renderer never tells main which theme is active, so the vibrancy material
follows the OS appearance and can mismatch the app theme. The terminal palette is
resolved in the renderer per app theme; the editor (Monaco) has light/dark themes.

## Goals / Non-Goals

**Goals:**
- One coherent appearance system: theme choice drives renderer tokens, native
  window material, terminal palette, and editor theme together.
- Light theme is legible everywhere (WCAG AA), independent of the wallpaper.
- A real theme control in Settings, plus optional "follow system".

**Non-Goals:**
- New custom/user-authored themes beyond dark/light/pink.
- Merging the activity rail into the sidebar (tracked separately).
- Changing the terminal-style preset system itself.

## Decisions

- **Bind window material via `nativeTheme.themeSource`.** On theme change the
  renderer sends the resolved light/dark base to main over one IPC channel; main
  sets `nativeTheme.themeSource = 'light' | 'dark'`, which flips the vibrancy
  material. Chosen over per-theme `vibrancy` juggling because `themeSource` is the
  supported lever and also fixes native menus/controls. Pink maps to `dark`.
- **"Follow system" derives, does not store, the concrete theme.** Persist a
  `followSystem` flag + last explicit theme. When following, read
  `nativeTheme.shouldUseDarkColors` and subscribe to its `updated` event. Picking
  an explicit theme clears the flag. Avoids a stale persisted theme fighting the OS.
- **Light-glass opacity is high (~0.85+).** Contrast must not depend on the backdrop;
  `themeSource` handles the common case but the material stays robust regardless.
- **Terminal opt-out is a boolean setting**, consumed by the existing
  `effectiveTerminalOptions(style, appTheme)` helper (already added). Default on.
- **Settings is the source of truth; the status-bar control becomes a shortcut**
  that opens/reflects the same setting.

## Risks / Trade-offs

- [`themeSource` is app-global] → acceptable; the app is single-window.
- [Light terminal palette can't fix programs that hard-code light-on-dark ANSI] →
  documented; the opt-out lets those users keep a dark terminal.
- [WCAG audit is manual without screenshots] → add a contrast-check script over the
  token pairs as the durable guard.

## Migration Plan

- New settings default to current behavior: theme `dark`, `followSystem` false,
  `terminalFollowsTheme` true. No data migration.
- Rollback: revert the IPC channel and `nativeTheme` call; themes still work in the
  renderer as they do today.

## Open Questions

- Should "follow system" be the out-of-box default? (Leaning: no — keep `dark`.)
