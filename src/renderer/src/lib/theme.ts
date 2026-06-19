/*
 * App UI theme — toggles the design-token set applied to the renderer. The
 * default `dark` theme lives in `:root` (tokens.css); alternate themes override
 * the color tokens under `[data-theme="…"]`. The choice is persisted in
 * localStorage and applied to `<html>` before React mounts to avoid a flash.
 */

export type AppTheme = 'dark' | 'pink';

export const APP_THEMES: AppTheme[] = ['dark', 'pink'];

const STORAGE_KEY = 'ddash.theme';

export function loadTheme(): AppTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'pink' || v === 'dark') return v;
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
