import type {
  ActiveSelection,
  AutoUpdateInfo,
  AutoUpdateSettings,
  GitViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  Project,
  PtySpawnResult,
  ShellTab,
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
  Todo,
  TodoViewSettings,
  Worktree,
} from './types';
import type {
  GitBranch,
  GitChangedEvent,
  GitCommit,
  GitOperationResult,
  GitStashEntry,
  GitStashFile,
  GitStatus,
} from './git';

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
  WorktreeListWithHeads: 'worktree:listWithHeads',
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

  // Git view (renderer ↔ main)
  GitIsRepo: 'git:isRepo',
  GitStatus: 'git:status',
  GitLog: 'git:log',
  GitBranches: 'git:branches',
  GitStage: 'git:stage',
  GitUnstage: 'git:unstage',
  GitCommit: 'git:commit',
  GitPush: 'git:push',
  GitCheckout: 'git:checkout',
  GitCreateBranch: 'git:createBranch',
  GitDiff: 'git:diff',
  GitShowCommit: 'git:showCommit',
  GitDiscard: 'git:discard',
  GitStashList: 'git:stashList',
  GitStashPush: 'git:stashPush',
  GitStashApply: 'git:stashApply',
  GitStashPop: 'git:stashPop',
  GitStashDrop: 'git:stashDrop',
  GitStashShowFiles: 'git:stashShowFiles',
  GitSubscribe: 'git:subscribe',
  GitUnsubscribe: 'git:unsubscribe',
  GitChanged: 'git:changed',

  // Git-view settings (renderer ↔ main)
  SettingsGetGitView: 'settings:getGitView',
  SettingsSetGitView: 'settings:setGitView',
  SettingsGitViewChanged: 'settings:gitViewChanged',

  // Todos (renderer ↔ main)
  TodoList: 'todo:list',
  TodoAdd: 'todo:add',
  TodoUpdate: 'todo:update',
  TodoRemove: 'todo:remove',

  // Todo-view settings (renderer ↔ main)
  SettingsGetTodoView: 'settings:getTodoView',
  SettingsSetTodoView: 'settings:setTodoView',
  SettingsTodoViewChanged: 'settings:todoViewChanged',

  // Integrated-terminal settings (renderer ↔ main)
  SettingsGetIntegratedTerminal: 'settings:getIntegratedTerminal',
  SettingsSetIntegratedTerminal: 'settings:setIntegratedTerminal',
  SettingsIntegratedTerminalChanged: 'settings:integratedTerminalChanged',

  // Integrated shell tabs (renderer ↔ main)
  ShellOpen: 'shell:open',
  ShellClose: 'shell:close',
  ShellWrite: 'shell:write',
  ShellResize: 'shell:resize',
  ShellList: 'shell:list',
  ShellRename: 'shell:rename',
  ShellData: 'shell:data',
  ShellExit: 'shell:exit',

  // Auto-update (renderer ↔ main)
  AutoUpdateGetInfo: 'autoUpdate:getInfo',
  AutoUpdateGetSettings: 'autoUpdate:getSettings',
  AutoUpdateSetSettings: 'autoUpdate:setSettings',
  AutoUpdateCheck: 'autoUpdate:check',
  AutoUpdateInstallNow: 'autoUpdate:installNow',
  AutoUpdateInfoChanged: 'autoUpdate:infoChanged',
  AutoUpdateSettingsChanged: 'autoUpdate:settingsChanged',

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

/** One entry per row of the project's worktree list, including the project's
 *  primary tree. `worktreeId` is null for the primary tree row; `head` is the
 *  short-hash form of HEAD for that worktree, or null when the worktree path
 *  is missing on disk. */
export interface WorktreeHeadEntry {
  worktreeId: string | null;
  head: string | null;
}

// Git view IPC payloads --------------------------------------------------

/** Addresses a project primary tree OR one of its worktrees — the main
 *  process resolves it to an absolute `cwd` for git operations. */
export interface GitTabRef {
  projectId: string;
  worktreeId?: string | null;
}

export type GitIsRepoResult =
  | { ok: true; cwd: string }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing' };

export type GitStatusResult =
  | { ok: true; status: GitStatus }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing'; stderr?: string };

export interface GitLogArgs extends GitTabRef {
  /** Max commits to return. Defaults to 500 in the main process. */
  limit?: number;
}

export type GitLogResult =
  | { ok: true; commits: GitCommit[] }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing'; stderr?: string };

export type GitBranchesResult =
  | { ok: true; branches: GitBranch[] }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing'; stderr?: string };

export interface GitStagePathsArgs extends GitTabRef {
  paths: string[];
}

export interface GitCommitArgs extends GitTabRef {
  subject: string;
  description?: string;
}

export interface GitCheckoutArgs extends GitTabRef {
  branch: string;
}

export interface GitCreateBranchArgs extends GitTabRef {
  name: string;
}

export interface GitDiffArgs extends GitTabRef {
  path: string;
  /**
   * 'staged'    — diffs the index against HEAD
   * 'unstaged'  — diffs the worktree against the index
   * 'untracked' — treats the file as all-new (diff vs /dev/null)
   */
  stage: 'staged' | 'unstaged' | 'untracked';
  /**
   * When set, ignore `stage` and return the patch introduced by this commit
   * for `path` (i.e. commit^..commit). Used by the commit-browser UI. For the
   * repository's root commit (no parent), returns the full initial content as
   * an addition.
   */
  commit?: string;
  /**
   * When set, ignore `stage` and `commit` and return the patch captured by
   * this stash entry for `path`, via `git stash show -p <ref>`. The ref may
   * be either a reflog selector (e.g. `stash@{0}`) or the stash commit SHA.
   */
  stash?: string;
}

export interface GitShowCommitArgs extends GitTabRef {
  /** Full SHA (or any ref resolvable by git) of the commit to inspect. */
  commit: string;
}

export interface GitCommitFile {
  /** Path at the commit (or the new path for a rename). */
  path: string;
  /** For renames, the previous path. */
  oldPath?: string;
  /** Narrowed subset of GitChangeKind that commit diffs actually produce. */
  kind: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface GitCommitDetail {
  hash: string;
  authorName: string;
  authorEmail: string;
  /** ISO 8601 author date (git's %aI). */
  authorDate: string;
  /** Full commit message (subject + body). */
  message: string;
}

export type GitShowCommitResult =
  | { ok: true; commit: GitCommitDetail; files: GitCommitFile[] }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing' | 'unknown-commit'; stderr?: string };

export interface GitDiscardArgs extends GitTabRef {
  paths: string[];
  /** 'tracked' restores from HEAD; 'untracked' deletes the files from disk. */
  kind: 'tracked' | 'untracked';
}

export type GitDiffResult =
  | { ok: true; diff: string; binary: boolean }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing'; stderr?: string };

// Stash IPC payloads ----------------------------------------------------

export type GitStashListResult =
  | { ok: true; stashes: GitStashEntry[] }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing'; stderr?: string };

export interface GitStashPushArgs extends GitTabRef {
  /** Optional stash message. When empty/undefined, git generates the default
   *  `WIP on <branch>: <hash> <subject>`. */
  message?: string;
  /** When true, also stash untracked (but not gitignored) files via `-u`. */
  includeUntracked?: boolean;
}

/** Apply / Pop / Drop all share the same shape: a stash ref plus the SHA the
 *  renderer last saw at that ref. The main process re-resolves the ref and
 *  fails with `stash-mismatch` if the SHA has shifted out from under us. */
export interface GitStashWriteArgs extends GitTabRef {
  /** Reflog selector, e.g. `stash@{0}`. */
  ref: string;
  /** SHA the renderer believes `ref` points to. */
  expectedSha: string;
}

export interface GitStashShowFilesArgs extends GitTabRef {
  /** Reflog selector or stash commit SHA. */
  ref: string;
}

export type GitStashShowFilesResult =
  | { ok: true; files: GitStashFile[] }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing' | 'unknown-stash'; stderr?: string };

export type { GitChangedEvent, GitOperationResult };

// Shell / integrated-terminal IPC payloads ------------------------------

export interface ShellOpenArgs {
  projectId: string;
  worktreeId?: string | null;
  tabId: string;
  cols: number;
  rows: number;
  label?: string;
}

export type ShellOpenResult =
  | { ok: true; tab: ShellTab; replay: string }
  | { ok: false; reason: 'tab-missing' | 'spawn-failed'; message?: string };

export interface ShellTabIdArgs {
  tabId: string;
}

export interface ShellWriteArgs {
  tabId: string;
  data: string;
}

export interface ShellResizeArgs {
  tabId: string;
  cols: number;
  rows: number;
}

export interface ShellListArgs {
  projectId: string;
  worktreeId?: string | null;
}

export interface ShellRenameArgs {
  tabId: string;
  label: string;
}

export interface ShellDataEvent {
  tabId: string;
  data: string;
}

export interface ShellExitEvent {
  tabId: string;
  exitCode: number | null;
  signal: number | null;
}

// Todo IPC payloads ------------------------------------------------------

export interface TodoAddArgs {
  projectId: string;
  text: string;
}
export interface TodoUpdateArgs {
  projectId: string;
  id: string;
  patch: Partial<Pick<Todo, 'text' | 'done'>>;
}
export interface TodoRemoveArgs {
  projectId: string;
  id: string;
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
    listWithHeads(projectId: string): Promise<WorktreeHeadEntry[]>;
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
    getGitView(): Promise<GitViewSettings>;
    setGitView(patch: Partial<Omit<GitViewSettings, 'version'>>): Promise<GitViewSettings>;
    onGitViewChanged(handler: (s: GitViewSettings) => void): () => void;
    getTodoView(): Promise<TodoViewSettings>;
    setTodoView(patch: Partial<Omit<TodoViewSettings, 'version'>>): Promise<TodoViewSettings>;
    onTodoViewChanged(handler: (s: TodoViewSettings) => void): () => void;
    getIntegratedTerminal(): Promise<IntegratedTerminalSettings>;
    setIntegratedTerminal(
      patch: Partial<Omit<IntegratedTerminalSettings, 'version'>>,
    ): Promise<IntegratedTerminalSettings>;
    onIntegratedTerminalChanged(handler: (s: IntegratedTerminalSettings) => void): () => void;
  };
  shell: {
    open(args: ShellOpenArgs): Promise<ShellOpenResult>;
    close(args: ShellTabIdArgs): Promise<void>;
    write(args: ShellWriteArgs): void;
    resize(args: ShellResizeArgs): void;
    list(args: ShellListArgs): Promise<ShellTab[]>;
    rename(args: ShellRenameArgs): Promise<void>;
    onData(handler: (ev: ShellDataEvent) => void): () => void;
    onExit(handler: (ev: ShellExitEvent) => void): () => void;
  };
  notify: {
    attention(args: NotifyAttentionArgs): void;
    attentionClear(key: string): void;
  };
  git: {
    isRepo(args: GitTabRef): Promise<GitIsRepoResult>;
    status(args: GitTabRef): Promise<GitStatusResult>;
    log(args: GitLogArgs): Promise<GitLogResult>;
    branches(args: GitTabRef): Promise<GitBranchesResult>;
    stage(args: GitStagePathsArgs): Promise<GitOperationResult>;
    unstage(args: GitStagePathsArgs): Promise<GitOperationResult>;
    commit(args: GitCommitArgs): Promise<GitOperationResult>;
    push(args: GitTabRef): Promise<GitOperationResult>;
    checkout(args: GitCheckoutArgs): Promise<GitOperationResult>;
    createBranch(args: GitCreateBranchArgs): Promise<GitOperationResult>;
    diff(args: GitDiffArgs): Promise<GitDiffResult>;
    showCommit(args: GitShowCommitArgs): Promise<GitShowCommitResult>;
    discard(args: GitDiscardArgs): Promise<GitOperationResult>;
    stashList(args: GitTabRef): Promise<GitStashListResult>;
    stashPush(args: GitStashPushArgs): Promise<GitOperationResult>;
    stashApply(args: GitStashWriteArgs): Promise<GitOperationResult>;
    stashPop(args: GitStashWriteArgs): Promise<GitOperationResult>;
    stashDrop(args: GitStashWriteArgs): Promise<GitOperationResult>;
    stashShowFiles(args: GitStashShowFilesArgs): Promise<GitStashShowFilesResult>;
    subscribe(args: GitTabRef): Promise<void>;
    unsubscribe(args: GitTabRef): Promise<void>;
    onChanged(handler: (ev: GitChangedEvent) => void): () => void;
  };
  todos: {
    list(projectId: string): Promise<Todo[]>;
    add(args: TodoAddArgs): Promise<Todo>;
    update(args: TodoUpdateArgs): Promise<Todo | null>;
    remove(args: TodoRemoveArgs): Promise<void>;
  };
  autoUpdate: {
    getInfo(): Promise<AutoUpdateInfo>;
    getSettings(): Promise<AutoUpdateSettings>;
    setSettings(patch: Partial<Omit<AutoUpdateSettings, 'version'>>): Promise<AutoUpdateSettings>;
    /** Trigger a manual check. Returns the resulting info. No-op (resolves with
     *  the current info) if a check/download is already in progress, or if the
     *  updater is disabled on this build. */
    check(): Promise<AutoUpdateInfo>;
    /** Quit and install the downloaded update immediately. No-op if state is
     *  not 'downloaded'. */
    installNow(): Promise<void>;
    onInfoChanged(handler: (info: AutoUpdateInfo) => void): () => void;
    onSettingsChanged(handler: (settings: AutoUpdateSettings) => void): () => void;
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
