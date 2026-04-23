import { create } from 'zustand';
import type {
  ActiveSelection,
  GitViewSettings,
  NotificationSettings,
  Project,
  PtySessionStatus,
  PtySpawnError,
  TerminalStyleSettings,
  Worktree,
} from '@shared/types';
import { DEFAULT_GIT_VIEW_SETTINGS, DEFAULT_NOTIFICATION_SETTINGS } from '@shared/types';
import { compositeKey } from '@shared/ipc';

export interface TabState {
  status: PtySessionStatus;
  error?: PtySpawnError;
  exitCode?: number | null;
  /** Set when the PTY rings the terminal bell (BEL) while the tab is not
   * active — typically Claude asking for a permission/confirmation. Cleared
   * when the tab becomes active. */
  needsAttention?: boolean;
}

/** When set, the main workspace area shows a diff view instead of the
 *  terminal. Cleared on active-tab change. */
export interface GitDiffSelection {
  projectId: string;
  worktreeId: string | null;
  path: string;
  stage: 'staged' | 'unstaged' | 'untracked';
}

interface AppStore {
  projects: Project[];
  activeId: ActiveSelection | null;
  /** Composite keys of tabs whose terminal pane has been mounted this session. */
  mountedKeys: string[];
  tabs: Record<string, TabState>;
  loaded: boolean;
  terminalStyle: TerminalStyleSettings;
  notifications: NotificationSettings;
  gitView: GitViewSettings;
  gitDiff: GitDiffSelection | null;
  settingsModalOpen: boolean;
  settingsModalTab: 'terminal' | 'notifications' | 'git';

  setProjects: (projects: Project[]) => void;
  setActive: (active: ActiveSelection | null) => void;
  ensureMounted: (key: string) => void;
  upsertTab: (key: string, patch: Partial<TabState>) => void;
  clearTab: (key: string) => void;
  clearProjectAndWorktrees: (projectId: string) => void;
  setTerminalStyle: (s: TerminalStyleSettings) => void;
  setNotifications: (s: NotificationSettings) => void;
  setGitView: (s: GitViewSettings) => void;
  openDiff: (sel: GitDiffSelection) => void;
  closeDiff: () => void;
  openSettings: (tab?: 'terminal' | 'notifications' | 'git') => void;
  closeSettings: () => void;
}

export const useStore = create<AppStore>((set) => ({
  projects: [],
  activeId: null,
  mountedKeys: [],
  tabs: {},
  loaded: false,
  terminalStyle: { version: 1, preset: 'dash-dark' },
  notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
  gitView: { ...DEFAULT_GIT_VIEW_SETTINGS },
  gitDiff: null,
  settingsModalOpen: false,
  settingsModalTab: 'terminal',

  setProjects: (projects) => set({ projects, loaded: true }),
  setActive: (active) =>
    set((s) => {
      const key = active ? compositeKey(active.projectId, active.worktreeId) : null;
      let tabs = s.tabs;
      if (key && s.tabs[key]?.needsAttention) {
        tabs = { ...s.tabs, [key]: { ...s.tabs[key], needsAttention: false } };
        window.api.notify.attentionClear(key);
      }
      return {
        activeId: active,
        mountedKeys:
          key && !s.mountedKeys.includes(key) ? [...s.mountedKeys, key] : s.mountedKeys,
        tabs,
        // Any open diff belongs to the previously active tab; discard it.
        gitDiff: null,
      };
    }),
  ensureMounted: (key) =>
    set((s) => ({
      mountedKeys: s.mountedKeys.includes(key) ? s.mountedKeys : [...s.mountedKeys, key],
    })),
  upsertTab: (key, patch) =>
    set((s) => {
      const prev: TabState = s.tabs[key] ?? { status: 'not-started' };
      return { tabs: { ...s.tabs, [key]: { ...prev, ...patch } } };
    }),
  clearTab: (key) =>
    set((s) => {
      if (s.tabs[key]?.needsAttention) window.api.notify.attentionClear(key);
      const { [key]: _omit, ...rest } = s.tabs;
      return { tabs: rest, mountedKeys: s.mountedKeys.filter((m) => m !== key) };
    }),
  clearProjectAndWorktrees: (projectId) =>
    set((s) => {
      const isMatch = (k: string) => k === projectId || k.startsWith(`${projectId}:`);
      const tabs: Record<string, TabState> = {};
      for (const [k, v] of Object.entries(s.tabs)) {
        if (isMatch(k)) {
          if (v.needsAttention) window.api.notify.attentionClear(k);
          continue;
        }
        tabs[k] = v;
      }
      return {
        tabs,
        mountedKeys: s.mountedKeys.filter((k) => !isMatch(k)),
      };
    }),
  setTerminalStyle: (s) => set({ terminalStyle: s }),
  setNotifications: (s) => set({ notifications: s }),
  setGitView: (s) => set({ gitView: s }),
  openDiff: (sel) => set({ gitDiff: sel }),
  closeDiff: () => set({ gitDiff: null }),
  openSettings: (tab) =>
    set((s) => ({ settingsModalOpen: true, settingsModalTab: tab ?? s.settingsModalTab })),
  closeSettings: () => set({ settingsModalOpen: false }),
}));

export function worktreesByProject(projects: Project[], projectId: string): Worktree[] {
  return projects.find((p) => p.id === projectId)?.worktrees ?? [];
}
