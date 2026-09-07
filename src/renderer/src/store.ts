import { create } from 'zustand';
import type {
  ActiveSelection,
  AgentDef,
  ClaudeUsageSummary,
  ClaudePlanUsage,
  DocsViewSettings,
  GitViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  Project,
  ProjectFolder,
  PtySessionStatus,
  PtySpawnError,
  ShellTab,
  TerminalStyleSettings,
  WebAccessSettings,
  Worktree,
} from '@shared/types';
import {
  DEFAULT_DOCS_VIEW_SETTINGS,
  DEFAULT_GIT_VIEW_SETTINGS,
  DEFAULT_INTEGRATED_TERMINAL_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_WEB_ACCESS_SETTINGS,
} from '@shared/types';
import { compositeKey, parseCompositeKey, agentKey, isClaudeAgentId } from '@shared/ipc';
import { applyTheme, loadTheme, type AppTheme } from './lib/theme';

/** How the board arranges its pinned windows. 'tile' and 'main' both fill the
 *  workspace; 'free' lets each tile be dragged and resized freely. */
export type BoardLayout = 'free' | 'tile' | 'main';

const BOARD_KEY = 'dash.board';
const BOARD_SIZES_KEY = 'dash.boardSizes';
function loadBoard(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(BOARD_KEY) ?? '[]');
    // Session keys are id-shaped and never contain a slash; drop anything else,
    // so board files corrupted by an external drop (a pasted URL, a dragged
    // file path) clean themselves up instead of lingering forever.
    return Array.isArray(v)
      ? v.filter((x) => typeof x === 'string' && !!x && !x.includes('/'))
      : [];
  } catch {
    return [];
  }
}
function saveBoard(board: string[]) {
  localStorage.setItem(BOARD_KEY, JSON.stringify(board));
}
const BOARD_LAYOUT_KEY = 'dash.boardLayout';
const BOARD_COLUMNS_KEY = 'dash.boardColumns';
function loadBoardLayout(): BoardLayout {
  const v = localStorage.getItem(BOARD_LAYOUT_KEY);
  return v === 'free' || v === 'main' ? v : 'tile';
}
function loadBoardColumns(): number {
  const n = Number(localStorage.getItem(BOARD_COLUMNS_KEY));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function loadBoardSizes(): Record<string, { w: number; h: number }> {
  try {
    const v = JSON.parse(localStorage.getItem(BOARD_SIZES_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function saveBoardSizes(sizes: Record<string, { w: number; h: number }>) {
  localStorage.setItem(BOARD_SIZES_KEY, JSON.stringify(sizes));
}
const WINDOW_LABELS_KEY = 'dash.windowLabels';
function loadWindowLabels(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(WINDOW_LABELS_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function saveWindowLabels(labels: Record<string, string>) {
  localStorage.setItem(WINDOW_LABELS_KEY, JSON.stringify(labels));
}
/** The selection a session/board key belongs to (strips any ::agent: suffix). */
function selectionOf(sessionKey: string): string {
  const i = sessionKey.indexOf('::agent:');
  return i < 0 ? sessionKey : sessionKey.slice(0, i);
}

// Extra Claude windows live in openAgentsByKey/activeAgentByKey, which are
// otherwise in-memory — so a reload (or Vite HMR resetting this module) drops
// them. Persist just the claude: markers so added windows survive; custom
// agents stay session-only as before.
const WINDOWS_KEY = 'dash.windows';
function loadWindows(): {
  open: Record<string, string[]>;
  active: Record<string, string | null>;
  primaryClosed: Record<string, true>;
} {
  try {
    const v = JSON.parse(localStorage.getItem(WINDOWS_KEY) ?? '{}');
    const open: Record<string, string[]> = v.open && typeof v.open === 'object' ? v.open : {};
    const stored: Record<string, true> =
      v.primaryClosed && typeof v.primaryClosed === 'object' ? v.primaryClosed : {};
    // A closed primary window is only restorable while the selection has an
    // extra window left to show; otherwise it would come back with no window at
    // all (custom agents, for one, are not persisted).
    const primaryClosed: Record<string, true> = {};
    for (const k of Object.keys(stored)) {
      if (open[k]?.length) primaryClosed[k] = true;
    }
    const active: Record<string, string | null> =
      v.active && typeof v.active === 'object' ? v.active : {};
    // With no built-in window to fall back on, the selection must open on one
    // of its extra windows.
    for (const k of Object.keys(primaryClosed)) {
      if (!active[k]) active[k] = open[k][0];
    }
    return { open, active, primaryClosed };
  } catch {
    return { open: {}, active: {}, primaryClosed: {} };
  }
}
function saveWindows(
  open: Record<string, string[]>,
  active: Record<string, string | null>,
  primaryClosed: Record<string, true>,
) {
  const fOpen: Record<string, string[]> = {};
  for (const [k, ids] of Object.entries(open)) {
    const claude = ids.filter(isClaudeAgentId);
    if (claude.length) fOpen[k] = claude;
  }
  const fActive: Record<string, string> = {};
  for (const [k, id] of Object.entries(active)) {
    if (id && isClaudeAgentId(id)) fActive[k] = id;
  }
  localStorage.setItem(
    WINDOWS_KEY,
    JSON.stringify({ open: fOpen, active: fActive, primaryClosed }),
  );
}
const RESTORED_WINDOWS = loadWindows();

// Restore-last-session: reopen the previously active selection on launch and
// resume its Claude conversation (`claude --continue`). Default on.
const RESTORE_SESSION_KEY = 'dash.restoreSession';
function loadRestoreSession(): boolean {
  return localStorage.getItem(RESTORE_SESSION_KEY) !== 'false';
}
const ACTIVE_ID_KEY = 'dash.activeId';
export function loadSavedActive(): ActiveSelection | null {
  try {
    const v = JSON.parse(localStorage.getItem(ACTIVE_ID_KEY) ?? 'null');
    return v && typeof v.projectId === 'string' ? v : null;
  } catch {
    return null;
  }
}
function saveActive(active: ActiveSelection | null) {
  if (active) localStorage.setItem(ACTIVE_ID_KEY, JSON.stringify(active));
  else localStorage.removeItem(ACTIVE_ID_KEY);
}

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
  folders: ProjectFolder[];
  activeId: ActiveSelection | null;
  /** Composite keys of tabs whose terminal pane has been mounted this session. */
  mountedKeys: string[];
  /** Selections whose built-in "Claude Code" window the user closed. Persisted
   *  with the extra windows, so it survives a reload the same way. */
  primaryClosed: Record<string, true>;
  tabs: Record<string, TabState>;
  loaded: boolean;
  /** Active app UI theme. Persisted in localStorage via `lib/theme.ts`. */
  theme: AppTheme;
  claudeUsage: ClaudeUsageSummary | null;
  claudePlanUsage: ClaudePlanUsage | null;
  terminalStyle: TerminalStyleSettings;
  notifications: NotificationSettings;
  gitView: GitViewSettings;
  docsView: DocsViewSettings;
  integratedTerminal: IntegratedTerminalSettings;
  webAccess: WebAccessSettings;
  /** Per-selection shell tab state, keyed by compositeKey(projectId, worktreeId). */
  shellTabs: Record<string, ShellTabsEntry>;
  gitDiff: GitDiffSelection | null;
  gitCommit: GitCommitSelection | null;
  /** Project the new-worktree modal is open for, or null when closed. */
  newWorktreeProjectId: string | null;
  gitStash: GitStashSelection | null;
  /** Open document tabs (markdown relPaths) per selection compositeKey. The
   *  "Claude Code" terminal is the implicit first tab and is not stored here. */
  docTabs: Record<string, string[]>;
  /** Which content tab is active per selection: a doc relPath, or null/absent
   *  for the Claude Code terminal. */
  activeDocByKey: Record<string, string | null>;
  /** User-defined custom agents (name + command), configured in settings. */
  agents: AgentDef[];
  /** Open custom-agent tabs (agent ids) per selection compositeKey. The
   *  "Claude Code" terminal is always implicitly available and not listed. */
  openAgentsByKey: Record<string, string[]>;
  /** Which custom agent is currently shown per selection, or null/absent when
   *  the Claude Code terminal or a doc is shown. Takes precedence over
   *  activeDocByKey when set. */
  activeAgentByKey: Record<string, string | null>;
  /** Which view the side panel shows (selected from the activity bar). */
  sidebarView: 'projects' | 'files' | 'git' | 'board';
  /** Selection compositeKeys pinned to the multi-project board grid, in display
   *  order. Persisted in localStorage; the board reuses the panes Workspace
   *  keeps mounted. */
  board: string[];
  /** Per-cell board tile size (px), keyed by selection compositeKey. Used only
   *  in 'free' layout. */
  boardSizes: Record<string, { w: number; h: number }>;
  /** Board layout: 'tile' auto-fits all windows to fill the workspace; 'main'
   *  fills it too, but gives the first window a full-height column and stacks
   *  the rest beside it; 'free' lets each tile be dragged/resized. */
  boardLayout: BoardLayout;
  /** Columns for 'tile' layout; 0 = auto (√count). */
  boardColumns: number;
  /** Custom names for Claude windows, keyed by session key (compositeKey for
   *  the primary tab, agentKey for extra Claude windows). Persisted. */
  windowLabels: Record<string, string>;
  /** Whether the side panel is expanded. */
  sidebarOpen: boolean;
  /** Open files with unsaved edits, keyed by an opaque id. Used for the
   *  unsaved-changes warning on app close. */
  dirtyFiles: Record<string, true>;
  settingsModalOpen: boolean;
  settingsModalTab: 'appearance' | 'terminal' | 'notifications' | 'git' | 'integrated-terminal' | 'agents' | 'updates' | 'web-access' | 'board' | 'keybindings' | 'startup';
  /** Reopen the last session and resume Claude on launch. Persisted. */
  restoreSession: boolean;
  /** Whether the command palette (Cmd/Ctrl+K) is open. */
  paletteOpen: boolean;

  setProjects: (projects: Project[]) => void;
  setFolders: (folders: ProjectFolder[]) => void;
  /** Switch the app UI theme and persist the choice. */
  setTheme: (theme: AppTheme) => void;
  setClaudeUsage: (usage: ClaudeUsageSummary | null) => void;
  setClaudePlanUsage: (usage: ClaudePlanUsage | null) => void;
  setActive: (active: ActiveSelection | null) => void;
  ensureMounted: (key: string) => void;
  upsertTab: (key: string, patch: Partial<TabState>) => void;
  clearTab: (key: string) => void;
  clearProjectAndWorktrees: (projectId: string) => void;
  setTerminalStyle: (s: TerminalStyleSettings) => void;
  setNotifications: (s: NotificationSettings) => void;
  setGitView: (s: GitViewSettings) => void;
  setDocsView: (s: DocsViewSettings) => void;
  setIntegratedTerminal: (s: IntegratedTerminalSettings) => void;
  setWebAccess: (s: WebAccessSettings) => void;
  setAgents: (agents: AgentDef[]) => void;
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
  openNewWorktree: (projectId: string) => void;
  closeNewWorktree: () => void;
  openStash: (sel: GitStashSelection) => void;
  closeStash: () => void;
  /** Open a doc as a content tab for the selection and make it active. */
  openDoc: (selectionKey: string, relPath: string) => void;
  /** Close a doc tab; if it was active, fall back to a neighbor or the terminal. */
  closeDoc: (selectionKey: string, relPath: string) => void;
  /** Switch the active content tab (a doc relPath, or null for the terminal). */
  setActiveDoc: (selectionKey: string, relPath: string | null) => void;
  /** Open a custom agent as a content tab for the selection and make it active. */
  openAgent: (selectionKey: string, agentId: string) => void;
  /** Close an agent tab; kills its session and falls back to a neighbor or
   *  the Claude Code terminal. */
  closeAgent: (selectionKey: string, agentId: string) => void;
  /** Make a custom agent the active content tab (it must already be open). */
  setActiveAgent: (selectionKey: string, agentId: string) => void;
  /** Activity-bar click: select a view (opening the panel), or collapse it when
   *  the already-active view's icon is clicked again. */
  selectSidebarView: (view: 'projects' | 'files' | 'git' | 'board') => void;
  /** Close a selection's built-in "Claude Code" window. Only takes effect while
   *  another window is open, so a selection never ends up with none; the built-in
   *  window returns when the last extra one is closed. */
  closePrimaryWindow: (selectionKey: string) => void;
  /** Add/remove a selection compositeKey to/from the board grid. Pinning also
   *  mounts the selection so its pane exists to render. */
  toggleBoard: (key: string) => void;
  /** Move `fromKey` to just before `toKey` in the board order (drag-reorder). */
  reorderBoard: (fromKey: string, toKey: string) => void;
  /** Persist a board tile's resized dimensions. */
  setBoardSize: (key: string, w: number, h: number) => void;
  /** Set the board layout mode. */
  setBoardLayout: (layout: BoardLayout) => void;
  /** Set the tile-layout column count (0 = auto). */
  setBoardColumns: (columns: number) => void;
  /** Rename a Claude window (empty string reverts to the default label). */
  setWindowLabel: (sessionKey: string, label: string) => void;
  setFileDirty: (id: string, dirty: boolean) => void;
  openSettings: (tab?: 'terminal' | 'notifications' | 'git' | 'integrated-terminal' | 'agents' | 'updates' | 'web-access' | 'board' | 'startup') => void;
  closeSettings: () => void;
  setRestoreSession: (on: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useStore = create<AppStore>((set) => ({
  projects: [],
  folders: [],
  activeId: null,
  mountedKeys: [],
  tabs: {},
  loaded: false,
  theme: loadTheme(),
  claudeUsage: null,
  claudePlanUsage: null,
  terminalStyle: { version: 1, preset: 'dash-dark' },
  notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
  gitView: { ...DEFAULT_GIT_VIEW_SETTINGS },
  docsView: { ...DEFAULT_DOCS_VIEW_SETTINGS },
  integratedTerminal: { ...DEFAULT_INTEGRATED_TERMINAL_SETTINGS },
  webAccess: { ...DEFAULT_WEB_ACCESS_SETTINGS },
  shellTabs: {},
  gitDiff: null,
  gitCommit: null,
  newWorktreeProjectId: null,
  gitStash: null,
  docTabs: {},
  activeDocByKey: {},
  agents: [],
  openAgentsByKey: RESTORED_WINDOWS.open,
  activeAgentByKey: RESTORED_WINDOWS.active,
  primaryClosed: RESTORED_WINDOWS.primaryClosed,
  sidebarView: 'projects',
  board: loadBoard(),
  boardSizes: loadBoardSizes(),
  boardLayout: loadBoardLayout(),
  boardColumns: loadBoardColumns(),
  windowLabels: loadWindowLabels(),
  sidebarOpen: true,
  dirtyFiles: {},
  settingsModalOpen: false,
  settingsModalTab: 'terminal',
  restoreSession: loadRestoreSession(),
  paletteOpen: false,

  setProjects: (projects) => set({ projects, loaded: true }),
  setFolders: (folders) => set({ folders }),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  setClaudeUsage: (usage) => set({ claudeUsage: usage }),
  setClaudePlanUsage: (usage) => set({ claudePlanUsage: usage }),
  setActive: (active) =>
    set((s) => {
      saveActive(active);
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
      const { [key]: _dt, ...docTabs } = s.docTabs;
      const { [key]: _ad, ...activeDocByKey } = s.activeDocByKey;
      const { [key]: openAgents, ...openAgentsByKey } = s.openAgentsByKey;
      const { [key]: _aa, ...activeAgentByKey } = s.activeAgentByKey;
      // Kill any agent sessions belonging to the removed selection.
      if (openAgents?.length) {
        const { projectId, worktreeId } = parseCompositeKey(key);
        for (const agentId of openAgents) {
          void window.api.pty.close({ projectId, worktreeId, agentId });
        }
      }
      return {
        tabs: rest,
        mountedKeys: s.mountedKeys.filter((m) => m !== key),
        docTabs,
        activeDocByKey,
        openAgentsByKey,
        activeAgentByKey,
      };
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
      const docTabs: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(s.docTabs)) {
        if (!isMatch(k)) docTabs[k] = v;
      }
      const activeDocByKey: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(s.activeDocByKey)) {
        if (!isMatch(k)) activeDocByKey[k] = v;
      }
      const openAgentsByKey: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(s.openAgentsByKey)) {
        if (isMatch(k)) {
          const { projectId: pid, worktreeId } = parseCompositeKey(k);
          for (const agentId of v) void window.api.pty.close({ projectId: pid, worktreeId, agentId });
        } else {
          openAgentsByKey[k] = v;
        }
      }
      const activeAgentByKey: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(s.activeAgentByKey)) {
        if (!isMatch(k)) activeAgentByKey[k] = v;
      }
      return {
        tabs,
        mountedKeys: s.mountedKeys.filter((k) => !isMatch(k)),
        shellTabs,
        docTabs,
        activeDocByKey,
        openAgentsByKey,
        activeAgentByKey,
      };
    }),
  setTerminalStyle: (s) => set({ terminalStyle: s }),
  setNotifications: (s) => set({ notifications: s }),
  setGitView: (s) => set({ gitView: s }),
  setDocsView: (s) => set({ docsView: s }),
  setIntegratedTerminal: (s) => set({ integratedTerminal: s }),
  setWebAccess: (s) => set({ webAccess: s }),
  setAgents: (agents) =>
    set((s) => {
      // If a configured agent was removed, drop any open tabs referencing it.
      // Extra Claude windows (claude: markers) aren't configured agents, so keep
      // them regardless of the agent list.
      const valid = new Set(agents.map((a) => a.id));
      const keep = (id: string) => isClaudeAgentId(id) || valid.has(id);
      let changedOpen = false;
      const openAgentsByKey: Record<string, string[]> = {};
      for (const [k, ids] of Object.entries(s.openAgentsByKey)) {
        const next = ids.filter(keep);
        if (next.length !== ids.length) changedOpen = true;
        openAgentsByKey[k] = next;
      }
      const activeAgentByKey: Record<string, string | null> = {};
      for (const [k, id] of Object.entries(s.activeAgentByKey)) {
        activeAgentByKey[k] = id && keep(id) ? id : null;
      }
      return changedOpen
        ? { agents, openAgentsByKey, activeAgentByKey }
        : { agents, activeAgentByKey };
    }),
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
  openNewWorktree: (projectId) => set({ newWorktreeProjectId: projectId }),
  closeNewWorktree: () => set({ newWorktreeProjectId: null }),
  openStash: (sel) => set({ gitStash: sel, gitDiff: null, gitCommit: null }),
  closeStash: () => set({ gitStash: null }),
  openDoc: (selectionKey, relPath) =>
    set((s) => {
      const prev = s.docTabs[selectionKey] ?? [];
      const tabs = prev.includes(relPath) ? prev : [...prev, relPath];
      return {
        docTabs: { ...s.docTabs, [selectionKey]: tabs },
        activeDocByKey: { ...s.activeDocByKey, [selectionKey]: relPath },
        // A doc takes over the content area from any active agent.
        activeAgentByKey: { ...s.activeAgentByKey, [selectionKey]: null },
      };
    }),
  closeDoc: (selectionKey, relPath) =>
    set((s) => {
      const prev = s.docTabs[selectionKey] ?? [];
      const idx = prev.indexOf(relPath);
      const tabs = prev.filter((t) => t !== relPath);
      const wasActive = s.activeDocByKey[selectionKey] === relPath;
      // Fall back to the tab to the left, then right, then the terminal.
      const nextActive = wasActive ? tabs[idx - 1] ?? tabs[idx] ?? null : s.activeDocByKey[selectionKey];
      return {
        docTabs: { ...s.docTabs, [selectionKey]: tabs },
        activeDocByKey: { ...s.activeDocByKey, [selectionKey]: nextActive },
      };
    }),
  setActiveDoc: (selectionKey, relPath) =>
    set((s) => ({
      activeDocByKey: { ...s.activeDocByKey, [selectionKey]: relPath },
      // Selecting the Claude terminal (null) or a doc deactivates any agent.
      activeAgentByKey: { ...s.activeAgentByKey, [selectionKey]: null },
    })),
  openAgent: (selectionKey, agentId) =>
    set((s) => {
      const prev = s.openAgentsByKey[selectionKey] ?? [];
      const open = prev.includes(agentId) ? prev : [...prev, agentId];
      return {
        openAgentsByKey: { ...s.openAgentsByKey, [selectionKey]: open },
        activeAgentByKey: { ...s.activeAgentByKey, [selectionKey]: agentId },
        // An agent takes over the content area from any active doc.
        activeDocByKey: { ...s.activeDocByKey, [selectionKey]: null },
      };
    }),
  closeAgent: (selectionKey, agentId) =>
    set((s) => {
      const prev = s.openAgentsByKey[selectionKey] ?? [];
      const idx = prev.indexOf(agentId);
      const open = prev.filter((id) => id !== agentId);
      const wasActive = s.activeAgentByKey[selectionKey] === agentId;
      // Fall back to the neighbor agent, else the Claude/doc content (null).
      const nextActive = wasActive ? open[idx - 1] ?? open[idx] ?? null : s.activeAgentByKey[selectionKey];
      // Kill the underlying session.
      const { projectId, worktreeId } = parseCompositeKey(selectionKey);
      void window.api.pty.close({ projectId, worktreeId, agentId });
      // Closing a window also unpins it from the board.
      const sessionKey = agentKey(projectId, worktreeId, agentId);
      const board = s.board.includes(sessionKey)
        ? s.board.filter((k) => k !== sessionKey)
        : s.board;
      if (board !== s.board) saveBoard(board);
      // A selection always keeps at least one window: when the last extra one
      // goes, a closed built-in Claude window comes back.
      let primaryClosed = s.primaryClosed;
      if (!open.length && primaryClosed[selectionKey]) {
        const { [selectionKey]: _reopened, ...rest } = primaryClosed;
        primaryClosed = rest;
      }
      return {
        openAgentsByKey: { ...s.openAgentsByKey, [selectionKey]: open },
        activeAgentByKey: { ...s.activeAgentByKey, [selectionKey]: nextActive },
        primaryClosed,
        board,
      };
    }),
  closePrimaryWindow: (selectionKey) =>
    set((s) => {
      const open = s.openAgentsByKey[selectionKey] ?? [];
      // Refuse to leave the selection with no window at all.
      if (!open.length || s.primaryClosed[selectionKey]) return {};
      const { projectId, worktreeId } = parseCompositeKey(selectionKey);
      void window.api.pty.close({ projectId, worktreeId });
      if (s.tabs[selectionKey]?.needsAttention) window.api.notify.attentionClear(selectionKey);
      // Closing a window also unpins it from the board.
      const board = s.board.includes(selectionKey)
        ? s.board.filter((k) => k !== selectionKey)
        : s.board;
      if (board !== s.board) saveBoard(board);
      const { [selectionKey]: _gone, ...tabs } = s.tabs;
      return {
        primaryClosed: { ...s.primaryClosed, [selectionKey]: true as const },
        // Hand the content area to a window that still exists.
        activeAgentByKey: { ...s.activeAgentByKey, [selectionKey]: open[0] },
        activeDocByKey: { ...s.activeDocByKey, [selectionKey]: null },
        tabs,
        board,
      };
    }),
  setActiveAgent: (selectionKey, agentId) =>
    set((s) => ({
      activeAgentByKey: { ...s.activeAgentByKey, [selectionKey]: agentId },
      activeDocByKey: { ...s.activeDocByKey, [selectionKey]: null },
    })),
  selectSidebarView: (view) =>
    set((s) => (s.sidebarView === view ? { sidebarOpen: !s.sidebarOpen } : { sidebarView: view, sidebarOpen: true })),
  toggleBoard: (key) =>
    set((s) => {
      const board = s.board.includes(key)
        ? s.board.filter((k) => k !== key)
        : [...s.board, key];
      saveBoard(board);
      // Pinning must mount the window's selection so its pane exists to render.
      const selKey = selectionOf(key);
      const mountedKeys = s.mountedKeys.includes(selKey) ? s.mountedKeys : [...s.mountedKeys, selKey];
      // Pinning the built-in window of a selection whose built-in window is
      // closed reopens it — otherwise the pin would render nothing.
      let primaryClosed = s.primaryClosed;
      if (key === selKey && board.includes(key) && primaryClosed[key]) {
        const { [key]: _reopened, ...rest } = primaryClosed;
        primaryClosed = rest;
      }
      return { board, mountedKeys, primaryClosed };
    }),
  reorderBoard: (fromKey, toKey) =>
    set((s) => {
      // Reordering only moves a tile that is already pinned. A drop coming from
      // outside the app carries arbitrary text in `text/plain`, which must not
      // turn into a board entry.
      if (fromKey === toKey || !s.board.includes(fromKey)) return {};
      const arr = s.board.filter((k) => k !== fromKey);
      const idx = arr.indexOf(toKey);
      if (idx < 0) arr.push(fromKey);
      else arr.splice(idx, 0, fromKey);
      saveBoard(arr);
      return { board: arr };
    }),
  setBoardSize: (key, w, h) =>
    set((s) => {
      const cur = s.boardSizes[key];
      if (cur && cur.w === w && cur.h === h) return {};
      const boardSizes = { ...s.boardSizes, [key]: { w, h } };
      saveBoardSizes(boardSizes);
      return { boardSizes };
    }),
  setBoardLayout: (layout) => {
    localStorage.setItem(BOARD_LAYOUT_KEY, layout);
    set({ boardLayout: layout });
  },
  setBoardColumns: (columns) => {
    const n = columns > 0 ? Math.floor(columns) : 0;
    localStorage.setItem(BOARD_COLUMNS_KEY, String(n));
    set({ boardColumns: n });
  },
  setWindowLabel: (sessionKey, label) =>
    set((s) => {
      const trimmed = label.trim();
      const windowLabels = { ...s.windowLabels };
      if (trimmed) windowLabels[sessionKey] = trimmed;
      else delete windowLabels[sessionKey];
      saveWindowLabels(windowLabels);
      return { windowLabels };
    }),
  setFileDirty: (id, dirty) =>
    set((s) => {
      if (dirty) {
        if (s.dirtyFiles[id]) return {};
        return { dirtyFiles: { ...s.dirtyFiles, [id]: true } };
      }
      if (!s.dirtyFiles[id]) return {};
      const { [id]: _omit, ...rest } = s.dirtyFiles;
      return { dirtyFiles: rest };
    }),
  openSettings: (tab) =>
    set((s) => ({ settingsModalOpen: true, settingsModalTab: tab ?? s.settingsModalTab })),
  closeSettings: () => set({ settingsModalOpen: false }),
  setRestoreSession: (on) => {
    localStorage.setItem(RESTORE_SESSION_KEY, String(on));
    set({ restoreSession: on });
  },
  setPaletteOpen: (open) => set({ paletteOpen: open }),
}));

// Persist extra Claude windows whenever they change, so they survive reloads.
useStore.subscribe((s, prev) => {
  if (
    s.openAgentsByKey !== prev.openAgentsByKey ||
    s.activeAgentByKey !== prev.activeAgentByKey ||
    s.primaryClosed !== prev.primaryClosed
  ) {
    saveWindows(s.openAgentsByKey, s.activeAgentByKey, s.primaryClosed);
  }
});

export function worktreesByProject(projects: Project[], projectId: string): Worktree[] {
  return projects.find((p) => p.id === projectId)?.worktrees ?? [];
}
