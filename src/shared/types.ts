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
  /** Optional override for where this project's worktrees live on disk.
   * When unset, defaults to `<project.path>.worktrees`. */
  worktreesRoot?: string;
  /** Whether this project's worktree group is collapsed in the sidebar.
   * Persisted per project; defaults to expanded (false). */
  worktreesCollapsed?: boolean;
  /** Branches the user has most recently created worktrees from, most-recent
   * first, capped at 5. Persisted; defaults to []. */
  recentBranches?: string[];
  /** Runtime-only cache populated after launch. Never persisted. */
  isGitRepo?: boolean;
  /** Id of the folder this project is filed under, or null/undefined when it
   * sits ungrouped at the sidebar root. */
  folderId?: string | null;
}

/** A flat, one-level grouping of projects in the sidebar. */
export interface ProjectFolder {
  id: string;
  name: string;
  order: number;
  /** Whether the folder is collapsed in the sidebar; defaults to expanded. */
  collapsed?: boolean;
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
  /** xterm font-weight for normal text (100–900, or 400/700 for normal/bold). */
  fontWeight?: number;
  /** xterm font-weight for bold text. */
  fontWeightBold?: number;
  /** Line height as a multiple of the font size (xterm default 1.0). */
  lineHeight?: number;
  /** Extra horizontal space between cells, in pixels (xterm default 0). */
  letterSpacing?: number;
  cursorStyle?: TerminalCursorStyle;
  cursorBlink?: boolean;
  scrollback?: number;
  /** macOS: treat the Option key as Meta instead of composing characters. */
  macOptionIsMeta?: boolean;
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
      fontWeight: custom.fontWeight,
      fontWeightBold: custom.fontWeightBold,
      lineHeight: custom.lineHeight,
      letterSpacing: custom.letterSpacing,
      cursorStyle: custom.cursorStyle,
      cursorBlink: custom.cursorBlink,
      scrollback: custom.scrollback,
      macOptionIsMeta: custom.macOptionIsMeta,
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
    fontWeight: o.fontWeight ?? base.fontWeight,
    fontWeightBold: o.fontWeightBold ?? base.fontWeightBold,
    lineHeight: o.lineHeight ?? base.lineHeight,
    letterSpacing: o.letterSpacing ?? base.letterSpacing,
    cursorStyle: o.cursorStyle ?? base.cursorStyle,
    cursorBlink: o.cursorBlink ?? base.cursorBlink,
    scrollback: o.scrollback ?? base.scrollback,
    macOptionIsMeta: o.macOptionIsMeta ?? base.macOptionIsMeta,
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

export interface DocsViewSettings {
  version: 1;
  /** Width in pixels of the Docs (markdown viewer) panel. */
  panelWidth: number;
}

export const DEFAULT_DOCS_VIEW_SETTINGS: DocsViewSettings = {
  version: 1,
  panelWidth: 420,
};

export const DOCS_VIEW_MIN_WIDTH = 280;
export const DOCS_VIEW_MAX_WIDTH = 900;

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

/** A user-defined agent that can be launched in the workspace alongside the
 *  built-in Claude Code session. `command` is run through the user's login
 *  shell (so PATH and aliases resolve) in the selected project/worktree cwd. */
export interface AgentDef {
  /** Stable opaque id used as part of the PTY session key. */
  id: string;
  /** Display name shown on the workspace tab (e.g. "opencode"). */
  name: string;
  /** Shell command line to launch (e.g. "opencode" or "omlx launch opencode"). */
  command: string;
}

export interface AgentsSettings {
  version: 1;
  agents: AgentDef[];
}

export const DEFAULT_AGENTS_SETTINGS: AgentsSettings = {
  version: 1,
  agents: [],
};

/** The workspace toolbar's one-click command: a button that types `command`
 *  into the active console and presses Enter, on the user's click. It ships
 *  pointed at the agent-mail mod's inbox because that is what it was built
 *  for, but both the label and the command are the user's to change — any
 *  slash command or line of text works. */
export interface ConsoleCommandSettings {
  version: 1;
  /** When false, the button is hidden everywhere. */
  enabled: boolean;
  /** Button label, e.g. "✉ Mail". */
  label: string;
  /** What is typed into the console, e.g. "/mail right". */
  command: string;
}

export const DEFAULT_CONSOLE_COMMAND_SETTINGS: ConsoleCommandSettings = {
  version: 1,
  enabled: true,
  label: '✉ Mail',
  command: '/mail right',
};

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

export interface WebAccessSettings {
  version: 1;
  /** When true, the LAN web UI is served on `port`. */
  enabled: boolean;
  /** TCP port to bind on 0.0.0.0. Defaults to DEFAULT_WEB_ACCESS_PORT. */
  port: number;
  /** Plaintext password required to log into the web UI. Empty disables
   *  enabling — the server refuses to start without a password set. */
  password: string;
}

// Picked deliberately to avoid the usual dev-server suspects
// (3000/4000/5000/5173/8000/8080/9000).
export const DEFAULT_WEB_ACCESS_PORT = 47821;

export const DEFAULT_WEB_ACCESS_SETTINGS: WebAccessSettings = {
  version: 1,
  enabled: false,
  port: DEFAULT_WEB_ACCESS_PORT,
  password: '',
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
  | { kind: 'downloaded'; version: string }
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
  folders: ProjectFolder[];
  lastActive: ActiveSelection | null;
  window: WindowState;
  terminalStyle: TerminalStyleSettings;
  notifications: NotificationSettings;
  gitView: GitViewSettings;
  docsView: DocsViewSettings;
  integratedTerminal: IntegratedTerminalSettings;
  autoUpdate: AutoUpdateSettings;
  webAccess: WebAccessSettings;
  agents: AgentsSettings;
  consoleCommand: ConsoleCommandSettings;
  /** Latest Claude Code session id seen (via hooks) per selection compositeKey,
   *  used to `claude --resume <id>` when restoring a session on launch. */
  claudeSessions: Record<string, string>;
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
  folders: [],
  lastActive: null,
  window: DEFAULT_WINDOW_STATE,
  terminalStyle: DEFAULT_TERMINAL_STYLE,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  gitView: DEFAULT_GIT_VIEW_SETTINGS,
  docsView: DEFAULT_DOCS_VIEW_SETTINGS,
  integratedTerminal: DEFAULT_INTEGRATED_TERMINAL_SETTINGS,
  autoUpdate: DEFAULT_AUTO_UPDATE_SETTINGS,
  webAccess: DEFAULT_WEB_ACCESS_SETTINGS,
  agents: DEFAULT_AGENTS_SETTINGS,
  consoleCommand: DEFAULT_CONSOLE_COMMAND_SETTINGS,
  claudeSessions: {},
};

/** Aggregated Claude Code token usage for a single local calendar day, read
 *  from the JSONL session transcripts under `~/.claude/projects`. The cost is a
 *  rough estimate from a built-in price table and is labeled as such in the UI. */
export interface ClaudeUsageSummary {
  /** False when `~/.claude/projects` could not be read (Claude Code never run,
   *  or transcripts disabled). The UI hides the usage line in that case. */
  available: boolean;
  /** Local calendar day the figures cover, `YYYY-MM-DD`. */
  day: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  /** Sum of the four token buckets above. */
  totalTokens: number;
  /** Rough estimated spend for the day in USD. */
  estimatedCostUsd: number;
  /** Distinct Claude Code sessions that logged usage today. */
  sessions: number;
}

/** One rate-limit window from the Anthropic OAuth usage endpoint. */
export interface ClaudePlanWindow {
  /** Percent of the window's limit consumed (0–100). */
  utilization: number;
  /** ISO timestamp when the window resets, or null if unknown. */
  resetsAt: string | null;
}

/**
 * Subscription plan usage as reported by `/usage` — fetched live from the
 * Anthropic OAuth usage endpoint using the local Claude Code credentials. This
 * is the real rate-limit utilization, distinct from {@link ClaudeUsageSummary}
 * (which only counts today's transcript tokens).
 */
export interface ClaudePlanUsage {
  /** False when no credentials, expired token, rate-limited, or fetch failed. */
  available: boolean;
  /** Rolling 5-hour window (the "session" limit). */
  fiveHour: ClaudePlanWindow | null;
  /** Rolling 7-day window (the weekly cap). */
  sevenDay: ClaudePlanWindow | null;
  /** 7-day Opus-specific window, when the plan reports it. */
  sevenDayOpus: ClaudePlanWindow | null;
  /** 7-day Sonnet-specific window, when the plan reports it. */
  sevenDaySonnet: ClaudePlanWindow | null;
  /** Why it's unavailable, for diagnostics / UI hints. */
  reason?: 'no-credentials' | 'expired' | 'rate-limited' | 'error';
}

export type PtySessionStatus = 'not-started' | 'running' | 'exited';

export type PtySpawnError =
  | { kind: 'path-missing'; path: string }
  | { kind: 'claude-not-found'; installUrl: string };

export interface PtySpawnResult {
  ok: boolean;
  error?: PtySpawnError;
}
