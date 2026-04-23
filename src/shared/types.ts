export interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  lastOpenedAt: string | null;
  order: number;
}

export interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

export type TerminalStylePreset = 'default' | 'dash-dark' | 'custom';

export interface TerminalStyleTheme {
  background?: string;
  foreground?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export type TerminalCursorStyle = 'block' | 'underline' | 'bar';

export interface TerminalStyleOptions {
  theme?: TerminalStyleTheme;
  fontFamily?: string;
  fontSize?: number;
  cursorStyle?: TerminalCursorStyle;
  cursorBlink?: boolean;
  scrollback?: number;
}

export interface TerminalStyleSettings {
  version: 1;
  preset: TerminalStylePreset;
  /** Only meaningful when preset === 'custom'. */
  customStyle?: TerminalStyleOptions;
  /** Display label for the loaded custom style (typically the filename). */
  customStyleName?: string;
  /** User overrides layered on top of the resolved preset. Individual
   * fields (e.g. fontSize, cursorStyle) set here win over the preset. */
  overrides?: TerminalStyleOptions;
}

export const DEFAULT_TERMINAL_STYLE: TerminalStyleSettings = {
  version: 1,
  preset: 'dash-dark',
};

// Options the renderer passes to xterm.js for built-in presets. 'default'
// intentionally carries no overrides — xterm.js applies its own defaults.
// The 'custom' preset reads its options from TerminalStyleSettings.customStyle.
export const TERMINAL_STYLE_PRESETS: Record<'default' | 'dash-dark', TerminalStyleOptions> = {
  default: {},
  'dash-dark': {
    theme: { background: '#000000' },
    fontFamily:
      '"SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace',
    fontSize: 13,
  },
};

export const TERMINAL_STYLE_PRESET_IDS: TerminalStylePreset[] = ['default', 'dash-dark', 'custom'];

export function resolveTerminalStyleOptions(s: TerminalStyleSettings): TerminalStyleOptions {
  let base: TerminalStyleOptions;
  if (s.preset === 'custom') {
    // Inherit the Dash-dark font family/size when the custom style doesn't
    // specify them. Leaving these undefined causes xterm.js to fall back to
    // its internal default ("courier-new, courier, monospace"), which on
    // macOS resolves to the serif-looking Courier and renders with huge
    // cell-gaps — see commit history for context.
    const fallback = TERMINAL_STYLE_PRESETS['dash-dark'];
    const custom = s.customStyle ?? {};
    base = {
      theme: custom.theme ?? fallback.theme,
      fontFamily: custom.fontFamily ?? fallback.fontFamily,
      fontSize: custom.fontSize ?? fallback.fontSize,
      cursorStyle: custom.cursorStyle,
      cursorBlink: custom.cursorBlink,
      scrollback: custom.scrollback,
    };
  } else {
    base = TERMINAL_STYLE_PRESETS[s.preset];
  }
  const o = s.overrides;
  if (!o) return base;
  // Shallow merge — `theme` is treated atomically so an override that
  // provides a theme replaces the preset's theme entirely (users shouldn't
  // need to think about which individual ANSI slot they're merging into).
  return {
    theme: o.theme ?? base.theme,
    fontFamily: o.fontFamily ?? base.fontFamily,
    fontSize: o.fontSize ?? base.fontSize,
    cursorStyle: o.cursorStyle ?? base.cursorStyle,
    cursorBlink: o.cursorBlink ?? base.cursorBlink,
    scrollback: o.scrollback ?? base.scrollback,
  };
}

export interface NotificationSettings {
  version: 1;
  /** Bounce the dock (macOS) when an inactive tab needs attention. */
  dockBounce: boolean;
  /** Show a system notification when an inactive tab needs attention. */
  systemNotifications: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  version: 1,
  dockBounce: true,
  systemNotifications: true,
};

export interface AppState {
  version: 1;
  projects: Project[];
  lastActiveProjectId: string | null;
  window: WindowState;
  terminalStyle: TerminalStyleSettings;
  notifications: NotificationSettings;
}

export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 800,
  x: null,
  y: null,
  maximized: false,
};

export const DEFAULT_APP_STATE: AppState = {
  version: 1,
  projects: [],
  lastActiveProjectId: null,
  window: DEFAULT_WINDOW_STATE,
  terminalStyle: DEFAULT_TERMINAL_STYLE,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
};

export type PtySessionStatus = 'not-started' | 'running' | 'exited';

export type PtySpawnError =
  | { kind: 'path-missing'; path: string }
  | { kind: 'claude-not-found'; installUrl: string };

export interface PtySpawnResult {
  ok: boolean;
  error?: PtySpawnError;
}
