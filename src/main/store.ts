import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_APP_STATE,
  DEFAULT_GIT_VIEW_SETTINGS,
  DEFAULT_INTEGRATED_TERMINAL_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_TERMINAL_STYLE,
  GIT_VIEW_MAX_WIDTH,
  GIT_VIEW_MIN_WIDTH,
  INTEGRATED_TERMINAL_MIN_HEIGHT,
  TERMINAL_STYLE_PRESET_IDS,
  type ActiveSelection,
  type AppState,
  type GitViewSettings,
  type IntegratedTerminalSettings,
  type NotificationSettings,
  type Project,
  type TerminalStyleSettings,
  type Worktree,
} from '@shared/types';

export interface StoreOptions {
  dir: string;
  filename?: string;
  debounceMs?: number;
}

export class JsonStore {
  private readonly filePath: string;
  private readonly debounceMs: number;
  private state: AppState = structuredClone(DEFAULT_APP_STATE);
  private loaded = false;
  private pendingTimer: NodeJS.Timeout | null = null;
  private writeInFlight: Promise<void> | null = null;

  constructor(opts: StoreOptions) {
    this.filePath = path.join(opts.dir, opts.filename ?? 'app-state.json');
    this.debounceMs = opts.debounceMs ?? 150;
  }

  async load(): Promise<AppState> {
    if (this.loaded) return this.state;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const migrated = this.migrate(parsed);
      if (migrated) {
        this.state = migrated;
      } else {
        // Unknown future version — back up and start fresh.
        try {
          await fs.rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
        } catch {
          /* ignore */
        }
        this.state = structuredClone(DEFAULT_APP_STATE);
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') {
        // Corrupt file — back it up and start fresh rather than crashing.
        try {
          await fs.rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
      this.state = structuredClone(DEFAULT_APP_STATE);
    }
    this.loaded = true;
    return this.state;
  }

  get(): AppState {
    return this.state;
  }

  update(mutator: (draft: AppState) => void): AppState {
    mutator(this.state);
    this.scheduleSave();
    return this.state;
  }

  private scheduleSave(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    // Serialize writes so concurrent flushes don't interleave.
    if (this.writeInFlight) await this.writeInFlight;
    const snapshot = JSON.stringify(serializeForDisk(this.state), null, 2);
    this.writeInFlight = this.writeAtomic(snapshot).finally(() => {
      this.writeInFlight = null;
    });
    await this.writeInFlight;
  }

  private async writeAtomic(contents: string): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, this.filePath);
  }

  private migrate(raw: unknown): AppState | null {
    const base = structuredClone(DEFAULT_APP_STATE);
    if (!raw || typeof raw !== 'object') return base;
    const r = raw as Record<string, unknown>;
    const version = typeof r.version === 'number' ? r.version : 1;
    if (version > 2) return null;
    const projects = Array.isArray(r.projects)
      ? (r.projects as unknown[]).map(normalizeProject).filter((p): p is Project => p !== null)
      : [];
    const lastActive = normalizeActive(r.lastActive, r.lastActiveProjectId, projects);
    return {
      version: 2,
      projects,
      lastActive,
      window: { ...base.window, ...((r.window as object) ?? {}) },
      terminalStyle: migrateTerminalStyle(r.terminalStyle),
      notifications: migrateNotifications(r.notifications),
      gitView: migrateGitView(r.gitView),
      integratedTerminal: migrateIntegratedTerminal(r.integratedTerminal),
    };
  }
}

function serializeForDisk(state: AppState): AppState {
  return {
    ...state,
    projects: state.projects.map((p) => {
      const { isGitRepo: _ig, ...rest } = p;
      return {
        ...rest,
        worktrees: rest.worktrees.map((w) => {
          const { status: _s, ...wrest } = w;
          return wrest;
        }),
      };
    }),
  };
}

function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.path !== 'string') return null;
  const worktrees = Array.isArray(r.worktrees)
    ? (r.worktrees as unknown[]).map(normalizeWorktree).filter((w): w is Worktree => w !== null)
    : [];
  const proj: Project = {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : r.id,
    path: r.path,
    addedAt: typeof r.addedAt === 'string' ? r.addedAt : new Date().toISOString(),
    lastOpenedAt: typeof r.lastOpenedAt === 'string' ? r.lastOpenedAt : null,
    order: typeof r.order === 'number' ? r.order : 0,
    worktrees,
  };
  if (typeof r.worktreesRoot === 'string') proj.worktreesRoot = r.worktreesRoot;
  return proj;
}

function normalizeWorktree(raw: unknown): Worktree | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.branch !== 'string' || typeof r.path !== 'string') {
    return null;
  }
  return {
    id: r.id,
    branch: r.branch,
    path: r.path,
    addedAt: typeof r.addedAt === 'string' ? r.addedAt : new Date().toISOString(),
    lastOpenedAt: typeof r.lastOpenedAt === 'string' ? r.lastOpenedAt : null,
    order: typeof r.order === 'number' ? r.order : 0,
  };
}

function normalizeActive(
  rawActive: unknown,
  rawLegacyId: unknown,
  projects: Project[],
): ActiveSelection | null {
  if (rawActive && typeof rawActive === 'object') {
    const a = rawActive as Record<string, unknown>;
    if (typeof a.projectId === 'string') {
      const wid = typeof a.worktreeId === 'string' ? a.worktreeId : null;
      const proj = projects.find((p) => p.id === a.projectId);
      if (!proj) return null;
      if (wid && !proj.worktrees.some((w) => w.id === wid)) {
        return { projectId: proj.id, worktreeId: null };
      }
      return { projectId: proj.id, worktreeId: wid };
    }
  }
  if (typeof rawLegacyId === 'string') {
    const proj = projects.find((p) => p.id === rawLegacyId);
    if (proj) return { projectId: proj.id, worktreeId: null };
  }
  return null;
}

function migrateTerminalStyle(raw: unknown): TerminalStyleSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TERMINAL_STYLE };
  const r = raw as Partial<TerminalStyleSettings>;
  const preset =
    r.preset && TERMINAL_STYLE_PRESET_IDS.includes(r.preset)
      ? r.preset
      : DEFAULT_TERMINAL_STYLE.preset;
  // A 'custom' preset is only valid if a customStyle payload accompanies it.
  if (preset === 'custom' && (!r.customStyle || typeof r.customStyle !== 'object')) {
    return { ...DEFAULT_TERMINAL_STYLE };
  }
  const out: TerminalStyleSettings = { version: 1, preset };
  if (r.customStyle && typeof r.customStyle === 'object') out.customStyle = r.customStyle;
  if (typeof r.customStyleName === 'string') out.customStyleName = r.customStyleName;
  if (r.overrides && typeof r.overrides === 'object') out.overrides = r.overrides;
  return out;
}

function migrateGitView(raw: unknown): GitViewSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_GIT_VIEW_SETTINGS };
  const r = raw as Partial<GitViewSettings>;
  const panelWidth =
    typeof r.panelWidth === 'number' && Number.isFinite(r.panelWidth)
      ? Math.min(GIT_VIEW_MAX_WIDTH, Math.max(GIT_VIEW_MIN_WIDTH, Math.round(r.panelWidth)))
      : DEFAULT_GIT_VIEW_SETTINGS.panelWidth;
  return {
    version: 1,
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_GIT_VIEW_SETTINGS.enabled,
    expanded: typeof r.expanded === 'boolean' ? r.expanded : DEFAULT_GIT_VIEW_SETTINGS.expanded,
    panelWidth,
  };
}

function migrateIntegratedTerminal(raw: unknown): IntegratedTerminalSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_INTEGRATED_TERMINAL_SETTINGS };
  const r = raw as Partial<IntegratedTerminalSettings>;
  const height =
    typeof r.height === 'number' && Number.isFinite(r.height)
      ? Math.max(INTEGRATED_TERMINAL_MIN_HEIGHT, Math.round(r.height))
      : DEFAULT_INTEGRATED_TERMINAL_SETTINGS.height;
  const out: IntegratedTerminalSettings = {
    version: 1,
    enabled:
      typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_INTEGRATED_TERMINAL_SETTINGS.enabled,
    expanded:
      typeof r.expanded === 'boolean' ? r.expanded : DEFAULT_INTEGRATED_TERMINAL_SETTINGS.expanded,
    height,
  };
  if (typeof r.defaultShell === 'string' && r.defaultShell.trim().length > 0) {
    out.defaultShell = r.defaultShell;
  }
  return out;
}

function migrateNotifications(raw: unknown): NotificationSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NOTIFICATION_SETTINGS };
  const r = raw as Partial<NotificationSettings>;
  return {
    version: 1,
    dockBounce: typeof r.dockBounce === 'boolean' ? r.dockBounce : DEFAULT_NOTIFICATION_SETTINGS.dockBounce,
    systemNotifications:
      typeof r.systemNotifications === 'boolean'
        ? r.systemNotifications
        : DEFAULT_NOTIFICATION_SETTINGS.systemNotifications,
  };
}
