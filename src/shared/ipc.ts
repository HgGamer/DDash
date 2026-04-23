import type {
  ActiveSelection,
  NotificationSettings,
  Project,
  PtySpawnResult,
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
  Worktree,
} from './types';

export const IPC = {
  // Project registry (renderer → main, request/response)
  ProjectList: 'project:list',
  ProjectAdd: 'project:add',
  ProjectRemove: 'project:remove',
  ProjectRename: 'project:rename',
  ProjectReorder: 'project:reorder',
  ProjectSetActive: 'project:setActive',
  ProjectPickDirectory: 'project:pickDirectory',

  // Worktree management (renderer → main)
  WorktreeList: 'worktree:list',
  WorktreeCreate: 'worktree:create',
  WorktreeRemove: 'worktree:remove',
  WorktreeReconcile: 'worktree:reconcile',
  WorktreeListLocalBranches: 'worktree:listLocalBranches',
  WorktreeComputeDefaultPath: 'worktree:computeDefaultPath',

  // PTY lifecycle (renderer → main)
  PtyOpen: 'pty:open',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyClose: 'pty:close',

  // PTY events (main → renderer)
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
  PtyError: 'pty:error',

  // Settings (renderer ↔ main)
  SettingsGetTerminalStyle: 'settings:getTerminalStyle',
  SettingsSetTerminalStyle: 'settings:setTerminalStyle',
  SettingsSetTerminalStyleOverrides: 'settings:setTerminalStyleOverrides',
  SettingsBrowseTerminalStyle: 'settings:browseTerminalStyle',
  SettingsTerminalStyleChanged: 'settings:terminalStyleChanged',
  SettingsGetNotifications: 'settings:getNotifications',
  SettingsSetNotifications: 'settings:setNotifications',
  SettingsNotificationsChanged: 'settings:notificationsChanged',

  // Attention / system notifications (renderer → main)
  NotifyAttention: 'notify:attention',
  NotifyAttentionClear: 'notify:attentionClear',

  // Menu/shortcut events (main → renderer)
  MenuAddProject: 'menu:addProject',
  MenuRemoveActive: 'menu:removeActive',
  MenuNextTab: 'menu:nextTab',
  MenuPrevTab: 'menu:prevTab',
  MenuActivateIndex: 'menu:activateIndex',
  MenuOpenSettings: 'menu:openSettings',
} as const;

// Composite key helpers — primary tree is the bare projectId, worktrees are
// `${projectId}:${worktreeId}`. Used as the single key for PTY sessions and
// renderer tab state.
export function compositeKey(projectId: string, worktreeId: string | null | undefined): string {
  return worktreeId ? `${projectId}:${worktreeId}` : projectId;
}

export function parseCompositeKey(key: string): { projectId: string; worktreeId: string | null } {
  const i = key.indexOf(':');
  if (i < 0) return { projectId: key, worktreeId: null };
  return { projectId: key.slice(0, i), worktreeId: key.slice(i + 1) };
}

// Request/response payloads
export interface ProjectAddArgs {
  path: string;
  name?: string;
}
export interface ProjectRenameArgs {
  id: string;
  name: string;
}
export interface ProjectReorderArgs {
  orderedIds: string[];
}
export interface ProjectPickDirectoryResult {
  path: string | null;
}

export type ProjectRemoveResult =
  | { ok: true }
  | { ok: false; errors: { worktreeId: string; message: string }[] };

export type BrowseTerminalStyleResult =
  | { ok: true; settings: TerminalStyleSettings }
  | { ok: false; reason: 'canceled' }
  | { ok: false; reason: 'invalid'; message: string };

export interface PtyOpenArgs {
  projectId: string;
  worktreeId?: string | null;
  cols: number;
  rows: number;
}
export interface PtyWriteArgs {
  projectId: string;
  worktreeId?: string | null;
  data: string;
}
export interface PtyResizeArgs {
  projectId: string;
  worktreeId?: string | null;
  cols: number;
  rows: number;
}
export interface PtyCloseArgs {
  projectId: string;
  worktreeId?: string | null;
}

// Event payloads
export interface PtyDataEvent {
  projectId: string;
  worktreeId?: string | null;
  data: string;
}
export interface PtyExitEvent {
  projectId: string;
  worktreeId?: string | null;
  exitCode: number | null;
  signal: number | null;
}
export interface PtyErrorEvent {
  projectId: string;
  worktreeId?: string | null;
  error: NonNullable<PtySpawnResult['error']>;
}

export interface NotifyAttentionArgs {
  projectId: string;
  worktreeId?: string | null;
  projectName: string;
}

// Worktree IPC payloads
export interface WorktreeCreateArgs {
  projectId: string;
  branch: string;
  mode: 'new' | 'existing';
  path?: string;
}
export type WorktreeCreateResult =
  | { ok: true; worktree: Worktree }
  | { ok: false; error: string };

export interface WorktreeRemoveArgs {
  projectId: string;
  worktreeId: string;
  force?: boolean;
}
export type WorktreeRemoveResult = { ok: true } | { ok: false; error: string };

export interface WorktreeReconcileEntry {
  worktreeId: string;
  status: 'present' | 'missing';
}

// The typed API exposed on window.api via contextBridge.
export interface DashApi {
  projects: {
    list(): Promise<Project[]>;
    add(args: ProjectAddArgs): Promise<Project | null>;
    remove(id: string): Promise<ProjectRemoveResult>;
    rename(args: ProjectRenameArgs): Promise<void>;
    reorder(args: ProjectReorderArgs): Promise<void>;
    setActive(active: ActiveSelection | null): Promise<void>;
    pickDirectory(): Promise<ProjectPickDirectoryResult>;
  };
  worktrees: {
    list(projectId: string): Promise<Worktree[]>;
    create(args: WorktreeCreateArgs): Promise<WorktreeCreateResult>;
    remove(args: WorktreeRemoveArgs): Promise<WorktreeRemoveResult>;
    reconcile(projectId: string): Promise<WorktreeReconcileEntry[]>;
    listLocalBranches(projectId: string): Promise<string[]>;
    computeDefaultPath(projectId: string, branch: string): Promise<string>;
  };
  pty: {
    open(args: PtyOpenArgs): Promise<PtySpawnResult>;
    write(args: PtyWriteArgs): void;
    resize(args: PtyResizeArgs): void;
    close(args: PtyCloseArgs): Promise<void>;
    onData(handler: (ev: PtyDataEvent) => void): () => void;
    onExit(handler: (ev: PtyExitEvent) => void): () => void;
    onError(handler: (ev: PtyErrorEvent) => void): () => void;
  };
  settings: {
    getTerminalStyle(): Promise<TerminalStyleSettings>;
    setTerminalStyle(preset: TerminalStylePreset): Promise<TerminalStyleSettings>;
    setTerminalStyleOverrides(
      overrides: TerminalStyleOptions | null,
    ): Promise<TerminalStyleSettings>;
    browseTerminalStyle(): Promise<BrowseTerminalStyleResult>;
    onTerminalStyleChanged(handler: (s: TerminalStyleSettings) => void): () => void;
    getNotifications(): Promise<NotificationSettings>;
    setNotifications(
      patch: Partial<Omit<NotificationSettings, 'version'>>,
    ): Promise<NotificationSettings>;
    onNotificationsChanged(handler: (s: NotificationSettings) => void): () => void;
  };
  notify: {
    attention(args: NotifyAttentionArgs): void;
    attentionClear(key: string): void;
  };
  menu: {
    onAddProject(handler: () => void): () => void;
    onRemoveActive(handler: () => void): () => void;
    onNextTab(handler: () => void): () => void;
    onPrevTab(handler: () => void): () => void;
    onActivateIndex(handler: (index: number) => void): () => void;
    onOpenSettings(handler: () => void): () => void;
  };
}

declare global {
  interface Window {
    api: DashApi;
  }
}
