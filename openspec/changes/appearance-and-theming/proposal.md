## Why

The `newdesign` rework introduced a macOS-native frosted look, a light theme, and
per-theme terminal palettes, but the pieces are only partly wired: window vibrancy
follows the *system* appearance rather than the app's chosen theme (so light mode
looks muddy on a dark desktop), there is no real theme control (only a status-bar
cycle button), the light theme has not been contrast-audited, and the terminal is
force-switched to light with no opt-out. This change makes appearance a coherent,
first-class system.

## What Changes

- Formalize a three-theme system — **dark** (default), **light**, **pink** — with a
  persisted selection and a **"Follow system appearance"** option.
- Bind the native window material to the active theme: set
  `nativeTheme.themeSource` from the renderer's theme so macOS vibrancy renders
  light behind the light theme and dark behind dark/pink.
- Move the theme control out of the status bar into **Settings** (keep a quick
  toggle, but make Settings the source of truth).
- Guarantee light-theme legibility: glass materials, borders, and text meet
  **WCAG AA** contrast; audit the heavy surfaces (git view, settings, diff,
  markdown).
- Terminal palette follows the app theme, with a **per-user opt-out** so a custom
  terminal style is not overridden.
- Polish the frosted chrome (sidebar, bars, headers, popovers) so it reads as
  intentional glass in every theme.

## Capabilities

### New Capabilities
- `ui-theme`: theme selection (dark/light/pink), persistence, "follow system
  appearance", and how the choice propagates to the renderer, the native window
  material, and the terminal.

### Modified Capabilities
- `visual-design-system`: add the light token set and glass materials; require
  WCAG AA contrast for text/controls across themes.
- `desktop-shell`: window vibrancy/appearance must track the active theme via
  `nativeTheme.themeSource`.
- `terminal-style-settings`: terminal palette follows the app theme with an
  explicit opt-out that preserves a user's custom style.

## Impact

- Renderer: `lib/theme.ts`, `store.ts`, `StatusBar.tsx`, `SettingsModal.tsx`,
  `styles/tokens.css`, `TerminalPane.tsx`, `IntegratedTerminalDock.tsx`,
  `MonacoView.tsx`.
- Main: `index.ts` (window creation / `nativeTheme`), a new IPC channel to push
  the theme to the main process, `settings.ts` for the opt-out flag.
- No data migration; new settings default to current behavior (dark, follow-system
  off, terminal-follows-theme on).
