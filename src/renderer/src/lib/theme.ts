/*
 * App UI theme — toggles the design-token set applied to the renderer. The
 * default `dark` theme lives in `:root` (tokens.css); alternate themes override
 * the color tokens under `[data-theme="…"]`. The choice is persisted in
 * localStorage and applied to `<html>` before React mounts to avoid a flash.
 */

import {
  resolveTerminalStyleOptions,
  type TerminalStyleOptions,
  type TerminalStyleSettings,
  type TerminalStyleTheme,
} from '@shared/types';

export type AppTheme = 'dark' | 'light' | 'pink';

/** A light xterm palette used when the app is in the light theme, so the
 *  terminal reads on a bright background instead of the default dark one. */
export const LIGHT_TERMINAL_THEME: TerminalStyleTheme = {
  // Soft grey background (not glaring white) + near-black text for contrast on
  // a thin monospace font. ANSI colors are darkened so program output (dim
  // greys, paths) stays legible on a light surface.
  background: '#e9e9ec',
  foreground: '#14151a',
  cursor: '#14151a',
  cursorAccent: '#e9e9ec',
  selectionBackground: 'rgba(59, 91, 219, 0.3)',
  black: '#1a1a1a',
  red: '#b81f31',
  green: '#137a35',
  yellow: '#8a5d08',
  blue: '#2551c0',
  magenta: '#8f2f8f',
  cyan: '#0b6b76',
  white: '#c4c4c8',
  brightBlack: '#4c4c55',
  brightRed: '#d0394c',
  brightGreen: '#1c8f44',
  brightYellow: '#9c700f',
  brightBlue: '#3a68d0',
  brightMagenta: '#a63ca6',
  brightCyan: '#178795',
  brightWhite: '#14151a',
};

/** Resolve the terminal style, forcing the light palette when the app is in the
 *  light theme (the user's terminal-style choice otherwise wins). */
export function effectiveTerminalOptions(
  s: TerminalStyleSettings,
  appTheme: AppTheme,
): TerminalStyleOptions {
  const opts = resolveTerminalStyleOptions(s);
  if (appTheme !== 'light') return opts;
  return { ...opts, theme: LIGHT_TERMINAL_THEME };
}

export const APP_THEMES: AppTheme[] = ['dark', 'light', 'pink'];

const STORAGE_KEY = 'ddash.theme';

export function loadTheme(): AppTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'pink' || v === 'dark' || v === 'light') return v;
  } catch {
    // localStorage unavailable (e.g. denied) — fall back to the default.
  }
  return 'dark';
}

export function applyTheme(theme: AppTheme): void {
  // `dark` is the base token set in :root, so it needs no attribute.
  if (theme === 'dark') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Persisting is best-effort; the in-memory choice still applies.
  }
}
