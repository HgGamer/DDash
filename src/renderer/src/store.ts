import { create } from 'zustand';
import type {
  ActiveSelection,
  GitViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  Project,
  PtySessionStatus,
  PtySpawnError,
  ShellTab,
  TerminalStyleSettings,
  TodoViewSettings,
  Worktree,
} from '@shared/types';
import {
  DEFAULT_GIT_VIEW_SETTINGS,
  DEFAULT_INTEGRATED_TERMINAL_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_TODO_VIEW_SETTINGS,
} from '@shared/types';
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

/** When set, the main workspace area shows a commit detail/diff view instead
 *  of the terminal. Mutually exclusive with `gitDiff` — opening one clears
 *  the other. Cleared on active-tab change. */
export interface GitCommitSelection {
  projectId: string;
  worktreeId: string | null;
  hash: string;
}

/** When set, the main workspace area shows a stash detail/diff view instead
 *  of the terminal. Mutually exclusive with `gitDiff` and `gitCommit` — opening
 *  one clears the others. Cleared on active-tab change. The `sha` snapshot is
 *  used to detect when the selected entry has been popped/dropped externally
 *  so the renderer can clear the selection silently. */
export interface GitStashSelection {
  projectId: string;
  worktreeId: string | null;
  /** Reflog selector, e.g. `stash@{0}`. */
  ref: string;
  /** Stash commit SHA at selection time. */
  sha: string;
  /** Source branch the stash was created on, or null if detached. */
  branch: string | null;
  /** Stash message. */
  message: string;
  /** Unix epoch seconds of the stash commit. */
  time: number;
}

export interface ShellTabsEntry {
  tabs: ShellTab[];
  activeTabId: string | null;
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
  todoView: TodoViewSettings;
  integratedTerminal: IntegratedTerminalSettings;
  /** Per-selection shell tab state, keyed by compositeKey(projectId, worktreeId). */
  shellTabs: Record<string, ShellTabsEntry>;
  gitDiff: GitDiffSelection | null;
  gitCommit: GitCommitSelection | null;
  gitStash: GitStashSelection | null;
  settingsModalOpen: boolean;
  settingsModalTab: 'terminal' | 'notifications' | 'git' | 'integrated-terminal';

  setProjects: (projects: Project[]) => void;
  setActive: (active: ActiveSelection | null) => void;
  ensureMounted: (key: string) => void;
  upsertTab: (key: string, patch: Partial<TabState>) => void;
  clearTab: (key: string) => void;
  clearProjectAndWorktrees: (projectId: string) => void;
  setTerminalStyle: (s: TerminalStyleSettings) => void;
  setNotifications: (s: NotificationSettings) => void;
  setGitView: (s: GitViewSettings) => void;
  setTodoView: (s: TodoViewSettings) => void;
  setIntegratedTerminal: (s: IntegratedTerminalSettings) => void;
  setShellTabsFor: (selectionKey: string, tabs: ShellTab[]) => void;
  addShellTab: (selectionKey: string, tab: ShellTab) => void;
  removeShellTab: (selectionKey: string, tabId: string) => void;
  renameShellTab: (selectionKey: string, tabId: string, label: string) => void;
  setActiveShellTab: (selectionKey: string, tabId: string | null) => void;
  recordShellExit: (selectionKey: string, tabId: string, code: number | null) => void;
  openDiff: (sel: GitDiffSelection) => void;
  closeDiff: () => void;
  openCommit: (sel: GitCommitSelection) => void;
  closeCommit: () => void;
  openStash: (sel: GitStashSelection) => void;
  closeStash: () => void;
  openSettings: (tab?: 'terminal' | 'notifications' | 'git' | 'integrated-terminal') => void;
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
  todoView: { ...DEFAULT_TODO_VIEW_SETTINGS },
  integratedTerminal: { ...DEFAULT_INTEGRATED_TERMINAL_SETTINGS },
  shellTabs: {},
  gitDiff: null,
  gitCommit: null,
  gitStash: null,
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
        // Any open diff / commit / stash selection belongs to the previously
        // active tab; discard them all.
        gitDiff: null,
        gitCommit: null,
        gitStash: null,
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
      const shellTabs: Record<string, ShellTabsEntry> = {};
      for (const [k, v] of Object.entries(s.shellTabs)) {
        if (!isMatch(k)) shellTabs[k] = v;
      }
      return {
        tabs,
        mountedKeys: s.mountedKeys.filter((k) => !isMatch(k)),
        shellTabs,
      };
    }),
  setTerminalStyle: (s) => set({ terminalStyle: s }),
  setNotifications: (s) => set({ notifications: s }),
  setGitView: (s) => set({ gitView: s }),
  setTodoView: (s) => set({ todoView: s }),
  setIntegratedTerminal: (s) => set({ integratedTerminal: s }),
  setShellTabsFor: (selectionKey, tabs) =>
    set((s) => ({
      shellTabs: {
        ...s.shellTabs,
        [selectionKey]: {
          tabs,
          activeTabId: s.shellTabs[selectionKey]?.activeTabId
            ?? (tabs[0]?.tabId ?? null),
        },
      },
    })),
  addShellTab: (selectionKey, tab) =>
    set((s) => {
      const prev = s.shellTabs[selectionKey] ?? { tabs: [], activeTabId: null };
      return {
        shellTabs: {
          ...s.shellTabs,
          [selectionKey]: {
            tabs: [...prev.tabs, tab],
            activeTabId: tab.tabId,
          },
        },
      };
    }),
  removeShellTab: (selectionKey, tabId) =>
    set((s) => {
      const prev = s.shellTabs[selectionKey];
      if (!prev) return {};
      const nextTabs = prev.tabs.filter((t) => t.tabId !== tabId);
      const wasActive = prev.activeTabId === tabId;
      return {
        shellTabs: {
          ...s.shellTabs,
          [selectionKey]: {
            tabs: nextTabs,
            activeTabId: wasActive ? nextTabs[nextTabs.length - 1]?.tabId ?? null : prev.activeTabId,
          },
        },
      };
    }),
  renameShellTab: (selectionKey, tabId, label) =>
    set((s) => {
      const prev = s.shellTabs[selectionKey];
      if (!prev) return {};
      return {
        shellTabs: {
          ...s.shellTabs,
          [selectionKey]: {
            ...prev,
            tabs: prev.tabs.map((t) => (t.tabId === tabId ? { ...t, label } : t)),
          },
        },
      };
    }),
  setActiveShellTab: (selectionKey, tabId) =>
    set((s) => {
      const prev = s.shellTabs[selectionKey];
      if (!prev) return {};
      return {
        shellTabs: {
          ...s.shellTabs,
          [selectionKey]: { ...prev, activeTabId: tabId },
        },
      };
    }),
  recordShellExit: (selectionKey, tabId, code) =>
    set((s) => {
      const prev = s.shellTabs[selectionKey];
      if (!prev) return {};
      return {
        shellTabs: {
          ...s.shellTabs,
          [selectionKey]: {
            ...prev,
            tabs: prev.tabs.map((t) => (t.tabId === tabId ? { ...t, exitCode: code } : t)),
          },
        },
      };
    }),
  openDiff: (sel) => set({ gitDiff: sel, gitCommit: null, gitStash: null }),
  closeDiff: () => set({ gitDiff: null }),
  openCommit: (sel) => set({ gitCommit: sel, gitDiff: null, gitStash: null }),
  closeCommit: () => set({ gitCommit: null }),
  openStash: (sel) => set({ gitStash: sel, gitDiff: null, gitCommit: null }),
  closeStash: () => set({ gitStash: null }),
  openSettings: (tab) =>
    set((s) => ({ settingsModalOpen: true, settingsModalTab: tab ?? s.settingsModalTab })),
  closeSettings: () => set({ settingsModalOpen: false }),
}));

export function worktreesByProject(projects: Project[], projectId: string): Worktree[] {
  return projects.find((p) => p.id === projectId)?.worktrees ?? [];
}
