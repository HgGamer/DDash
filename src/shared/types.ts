export interface Worktree {
  id: string;
  branch: string;
  path: string;
  addedAt: string;
  lastOpenedAt: string | null;
  order: number;
  /** Runtime-only flag set by reconcile when the worktree is registered but
   * absent on disk / unknown to git. Never persisted. */
  status?: 'missing';
}

export interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  lastOpenedAt: string | null;
  order: number;
  worktrees: Worktree[];
  todos: Todo[];
  /** Optional override for where this project's worktrees live on disk.
   * When unset, defaults to `<project.path>.worktrees`. */
  worktreesRoot?: string;
  /** Runtime-only cache populated after launch. Never persisted. */
  isGitRepo?: boolean;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
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
      '"OperatorMono Nerd Font", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace',
    fontSize: 14,
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

export interface GitViewSettings {
  version: 1;
  /** Feature flag — when false, the git view button and panel are hidden. */
  enabled: boolean;
  /** Whether the panel is expanded. Persisted globally, not per-tab. */
  expanded: boolean;
  /** Width in pixels of the expanded panel. */
  panelWidth: number;
}

export const DEFAULT_GIT_VIEW_SETTINGS: GitViewSettings = {
  version: 1,
  enabled: true,
  expanded: false,
  panelWidth: 360,
};

export const GIT_VIEW_MIN_WIDTH = 240;
export const GIT_VIEW_MAX_WIDTH = 720;

export interface TodoViewSettings {
  version: 1;
  /** Whether the panel is expanded. Persisted globally, not per-project. */
  expanded: boolean;
  /** Width in pixels of the expanded panel. */
  panelWidth: number;
}

export const DEFAULT_TODO_VIEW_SETTINGS: TodoViewSettings = {
  version: 1,
  expanded: false,
  panelWidth: 320,
};

export const TODO_VIEW_MIN_WIDTH = 240;
export const TODO_VIEW_MAX_WIDTH = 720;

export interface IntegratedTerminalSettings {
  version: 1;
  /** When false, the statusbar button and dock are hidden. */
  enabled: boolean;
  /** Whether the dock is expanded. Global, not per-tab. */
  expanded: boolean;
  /** Dock height in pixels. Clamped at render time. */
  height: number;
  /** Optional shell override. When unset, resolves from $SHELL / %COMSPEC%. */
  defaultShell?: string;
}

export const DEFAULT_INTEGRATED_TERMINAL_SETTINGS: IntegratedTerminalSettings = {
  version: 1,
  enabled: true,
  expanded: false,
  height: 240,
};

export const INTEGRATED_TERMINAL_MIN_HEIGHT = 120;
export const INTEGRATED_TERMINAL_MAX_HEIGHT_RATIO = 0.8;

export type AutoUpdateChannel = 'stable' | 'beta';

export interface AutoUpdateSettings {
  version: 1;
  /** Master switch for background checks and downloads. */
  enabled: boolean;
  channel: AutoUpdateChannel;
  /** ISO timestamp of the last successful check (success = no error from the
   * release feed; "no update available" still counts). Null if never checked. */
  lastCheckedAt: string | null;
}

export const DEFAULT_AUTO_UPDATE_SETTINGS: AutoUpdateSettings = {
  version: 1,
  enabled: true,
  channel: 'stable',
  lastCheckedAt: null,
};

/** Translate the user-facing channel name to electron-updater's wire name.
 *  electron-updater calls the stable channel "latest". */
export function autoUpdateChannelToFeed(channel: AutoUpdateChannel): string {
  return channel === 'beta' ? 'beta' : 'latest';
}

/** Why the updater is not running on this build. Surfaced to the renderer so
 * the UI can show "Updates managed by your package manager" / "Updates
 * disabled in development" instead of the live controls. */
export type AutoUpdateDisabledReason =
  | 'development'
  | 'unsupported-platform'
  | 'auto-disabled';

export type AutoUpdateState =
  | { kind: 'idle'; disabledReason?: AutoUpdateDisabledReason }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | {
      kind: 'downloaded';
      version: string;
      /** macOS: Squirrel can't apply updates to ad-hoc-signed builds. We download
       *  the artifact but leave the install to the user (Finder reveal). */
      manualInstall?: boolean;
    }
  | { kind: 'error'; message: string };

export interface AutoUpdateInfo {
  /** Version of the running application. */
  currentVersion: string;
  state: AutoUpdateState;
  lastCheckedAt: string | null;
}

export interface ShellTab {
  tabId: string;
  projectId: string;
  worktreeId: string | null;
  cwd: string;
  shell: string;
  label: string;
  startedAt: string;
  exitCode: number | null;
}

export interface ActiveSelection {
  projectId: string;
  worktreeId: string | null;
}

export interface AppState {
  version: 2;
  projects: Project[];
  lastActive: ActiveSelection | null;
  window: WindowState;
  terminalStyle: TerminalStyleSettings;
  notifications: NotificationSettings;
  gitView: GitViewSettings;
  todoView: TodoViewSettings;
  integratedTerminal: IntegratedTerminalSettings;
  autoUpdate: AutoUpdateSettings;
}

export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 800,
  x: null,
  y: null,
  maximized: false,
};

export const DEFAULT_APP_STATE: AppState = {
  version: 2,
  projects: [],
  lastActive: null,
  window: DEFAULT_WINDOW_STATE,
  terminalStyle: DEFAULT_TERMINAL_STYLE,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  gitView: DEFAULT_GIT_VIEW_SETTINGS,
  todoView: DEFAULT_TODO_VIEW_SETTINGS,
  integratedTerminal: DEFAULT_INTEGRATED_TERMINAL_SETTINGS,
  autoUpdate: DEFAULT_AUTO_UPDATE_SETTINGS,
};

export type PtySessionStatus = 'not-started' | 'running' | 'exited';

export type PtySpawnError =
  | { kind: 'path-missing'; path: string }
  | { kind: 'claude-not-found'; installUrl: string };

export interface PtySpawnResult {
  ok: boolean;
  error?: PtySpawnError;
}
