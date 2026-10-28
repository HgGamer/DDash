import type {
  ActiveSelection,
  AgentDef,
  AgentsSettings,
  AutoUpdateInfo,
  AutoUpdateSettings,
  ConsoleCommandSettings,
  GitViewSettings,
  DocsViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  Project,
  ProjectFolder,
  PtySpawnResult,
  ShellTab,
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
  WebAccessSettings,
  Worktree,
} from './types';
import type { TasksState, TaskUserEdit, TaskUserEditResult } from './tasks';
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
  ProjectSetWorktreesCollapsed: 'project:setWorktreesCollapsed',
  ProjectSetFolder: 'project:setFolder',
  ProjectPickDirectory: 'project:pickDirectory',

  // Project folders (renderer → main, request/response)
  FolderList: 'folder:list',
  FolderCreate: 'folder:create',
  FolderRename: 'folder:rename',
  FolderRemove: 'folder:remove',
  FolderSetCollapsed: 'folder:setCollapsed',
  FolderReorder: 'folder:reorder',

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

  // Claude Code hook state (main → renderer). Driven by hooks merged into
  // ~/.claude/settings.json — reliable "done" / "needs input" signals.
  ClaudeHookState: 'claude:hookState',

  // Floating modal drawn for a Claude Code mod (main ↔ renderer), see main/mod-modal.ts
  ModModalShow: 'mod:show',
  ModModalClose: 'mod:close',
  ModModalPress: 'mod:press',
  // A mod offers a prompt for a console the user picks (main → renderer), see main/mod-modal.ts
  ModSendOffer: 'mod:sendOffer',

  // Claude panel: hooks in the settings scopes, installed plugins / mods (renderer → main)
  ClaudeConfigRead: 'claudeConfig:read',
  ClaudeHooksSave: 'claudeConfig:saveHooks',

  // Git view (renderer ↔ main)
  GitIsRepo: 'git:isRepo',
  GitListRepos: 'git:listRepos',
  GitStatus: 'git:status',
  GitLog: 'git:log',
  GitBranches: 'git:branches',
  GitStage: 'git:stage',
  GitUnstage: 'git:unstage',
  GitCommit: 'git:commit',
  GitPush: 'git:push',
  GitPushForce: 'git:pushForce',
  GitFetch: 'git:fetch',
  GitPull: 'git:pull',
  GitMerge: 'git:merge',
  GitCheckout: 'git:checkout',
  GitCreateBranch: 'git:createBranch',
  GitDeleteBranch: 'git:deleteBranch',
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
  GitLsFiles: 'git:lsFiles',

  // Git-view settings (renderer ↔ main)
  SettingsGetGitView: 'settings:getGitView',
  SettingsSetGitView: 'settings:setGitView',
  SettingsGitViewChanged: 'settings:gitViewChanged',

  // Web-access (LAN web UI) settings (renderer ↔ main)
  SettingsGetWebAccess: 'settings:getWebAccess',
  SettingsSetWebAccess: 'settings:setWebAccess',
  SettingsWebAccessChanged: 'settings:webAccessChanged',

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

  // Docs / file viewer (renderer ↔ main)
  DocsList: 'docs:list',
  DocsListDir: 'docs:listDir',
  DocsRead: 'docs:read',
  DocsWrite: 'docs:write',
  DocsOpenExternal: 'docs:openExternal',
  DocsReveal: 'docs:reveal',
  DocsRename: 'docs:rename',
  DocsDelete: 'docs:delete',
  DocsCreate: 'docs:create',

  // Task board (renderer ↔ main)
  TasksList: 'tasks:list',
  TasksEdit: 'tasks:edit',
  TasksDelete: 'tasks:delete',
  TasksChanged: 'tasks:changed',
  TasksOpenWindow: 'tasks:openWindow',

  // Docs-view settings (renderer ↔ main)
  SettingsGetDocsView: 'settings:getDocsView',
  SettingsSetDocsView: 'settings:setDocsView',
  SettingsDocsViewChanged: 'settings:docsViewChanged',

  // Custom agents settings (renderer ↔ main)
  SettingsGetAgents: 'settings:getAgents',
  SettingsSetAgents: 'settings:setAgents',
  SettingsAgentsChanged: 'settings:agentsChanged',

  // The workspace toolbar's one-click console command (renderer ↔ main)
  SettingsGetConsoleCommand: 'settings:getConsoleCommand',
  SettingsSetConsoleCommand: 'settings:setConsoleCommand',
  SettingsConsoleCommandChanged: 'settings:consoleCommandChanged',

  // Auto-update (renderer ↔ main)
  AutoUpdateGetInfo: 'autoUpdate:getInfo',
  AutoUpdateGetSettings: 'autoUpdate:getSettings',
  AutoUpdateSetSettings: 'autoUpdate:setSettings',
  AutoUpdateCheck: 'autoUpdate:check',
  AutoUpdateInstallNow: 'autoUpdate:installNow',
  AutoUpdateInfoChanged: 'autoUpdate:infoChanged',
  AutoUpdateSettingsChanged: 'autoUpdate:settingsChanged',

  // App-level (renderer → main)
  AppSetUnsaved: 'app:setUnsaved',

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

// PTY session key. The built-in Claude Code session uses the bare composite
// key (no agentId) so it stays identical to historical behavior. Custom agents
// get their own keyspace suffix so multiple agents can run per selection
// without colliding with Claude or each other.
export function agentKey(
  projectId: string,
  worktreeId: string | null | undefined,
  agentId?: string | null,
): string {
  const base = compositeKey(projectId, worktreeId);
  return agentId ? `${base}::agent:${agentId}` : base;
}

// Extra Claude Code windows reuse the agent tab machinery, but their agentId
// carries this prefix so main spawns Claude (no command) instead of resolving a
// configured agent. `null` agentId is still the implicit first Claude tab.
export const CLAUDE_AGENT_PREFIX = 'claude:';
export function isClaudeAgentId(agentId: string | null | undefined): boolean {
  return !!agentId && agentId.startsWith(CLAUDE_AGENT_PREFIX);
}
export function newClaudeAgentId(): string {
  return `${CLAUDE_AGENT_PREFIX}${crypto.randomUUID()}`;
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
export interface ProjectSetWorktreesCollapsedArgs {
  id: string;
  collapsed: boolean;
}
export interface ProjectSetFolderArgs {
  projectId: string;
  folderId: string | null;
}
export interface FolderCreateArgs {
  name: string;
}
export interface FolderRenameArgs {
  id: string;
  name: string;
}
export interface FolderSetCollapsedArgs {
  id: string;
  collapsed: boolean;
}
export interface FolderReorderArgs {
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
  /** When set, launch this custom agent (looked up in settings) instead of the
   *  built-in Claude Code session. */
  agentId?: string | null;
  /** Resume the most recent Claude conversation in this cwd (`claude --continue`).
   *  Only honored on the built-in Claude path (no agentId command). */
  resume?: boolean;
  cols: number;
  rows: number;
}
export interface PtyWriteArgs {
  projectId: string;
  worktreeId?: string | null;
  agentId?: string | null;
  data: string;
}
export interface PtyResizeArgs {
  projectId: string;
  worktreeId?: string | null;
  agentId?: string | null;
  cols: number;
  rows: number;
}
export interface PtyCloseArgs {
  projectId: string;
  worktreeId?: string | null;
  agentId?: string | null;
}

// Event payloads
export interface PtyDataEvent {
  projectId: string;
  worktreeId?: string | null;
  agentId?: string | null;
  data: string;
}
export interface PtyExitEvent {
  projectId: string;
  worktreeId?: string | null;
  agentId?: string | null;
  exitCode: number | null;
  signal: number | null;
}
export interface PtyErrorEvent {
  projectId: string;
  worktreeId?: string | null;
  agentId?: string | null;
  error: NonNullable<PtySpawnResult['error']>;
}

export interface NotifyAttentionArgs {
  projectId: string;
  worktreeId?: string | null;
  projectName: string;
  /** Controls the notification body. 'done' = Claude finished; 'input' =
   *  Claude is waiting for input/permission. Defaults to 'input'. */
  kind?: 'done' | 'input';
}

/** Emitted by the Claude Code hook listener when a session changes state.
 *  'busy' = a prompt was submitted (working); 'done' = Stop fired; 'input' =
 *  Notification fired (permission / idle). */
export interface ClaudeHookStateEvent {
  projectId: string;
  worktreeId: string | null;
  projectName: string;
  state: 'busy' | 'done' | 'input';
}

/** What a mod asks dash to draw: markdown and a row of buttons; a press goes
 *  back to the mod by key. A second show with the same id replaces it. */
export interface ModModalView {
  id: string;
  title: string;
  markdown: string;
  /** row: a full-width list item (label bold, detail muted under it, dot = an
   *  unread-style marker), drawn above the plain action buttons. */
  buttons: Array<{ key: string; label: string; primary?: boolean; row?: boolean; detail?: string; dot?: boolean }>;
  /** 'float' (default): a draggable card over the app; 'sidebar': docked on the right. */
  placement?: 'float' | 'sidebar' | 'bottom';
  /** Optional tabs, switched in dash; each replaces markdown / buttons while shown.
   *  The first tab is shown first. */
  tabs?: Array<{ key: string; label: string; markdown: string; buttons: ModModalView['buttons'] }>;
  /** The mod's own UI: drawn instead of markdown / buttons / tabs in a sandboxed
   *  iframe (no scripts, no network) with dash's theme tokens as CSS vars. A click
   *  on an element with data-key presses that key back to the mod; the comment
   *  <!--markdown--> is replaced by `markdown`, rendered and sanitised. */
  html?: string;
}

/** A prompt a mod offers for a console of the user's choice (POST /mod/send-offer).
 *  dash shows it with the open consoles; nothing is typed until the user picks
 *  one and presses Send. The mod hears '__sent' or '__cancel' on its /mod/wait. */
export interface ModSendOffer {
  id: string;
  title: string;
  text: string;
}

export type ClaudeHookScope = 'user' | 'project' | 'local';
/** One hook command, flattened from settings.hooks[event][].hooks[]. `managed`:
 *  dash's own notify hook, shown but never edited. */
export interface ClaudeHookEntry {
  event: string;
  matcher: string;
  type: string;
  command: string;
  timeout?: number;
  managed: boolean;
}
export interface ClaudeScopeInfo {
  scope: ClaudeHookScope;
  path: string;
  exists: boolean;
  /** false: the file isn't valid JSON (read-only until fixed by hand). */
  isValid: boolean;
  hooks: ClaudeHookEntry[];
}
export interface ClaudePluginInfo {
  id: string;
  name: string;
  kind: 'plugin' | 'dev-mod';
  version: string;
  path: string;
  enabled: boolean;
  description: string;
  /** Classic hook events its hooks/hooks.json registers. */
  events: string[];
  /** A function-hooks mod (hooks.json `modules`). */
  isMod: boolean;
}
export interface ClaudeConfigArgs {
  projectId: string | null;
  worktreeId?: string | null;
}
export interface ClaudeConfigResult {
  scopes: ClaudeScopeInfo[];
  plugins: ClaudePluginInfo[];
}
export interface ClaudeHooksSaveArgs extends ClaudeConfigArgs {
  scope: ClaudeHookScope;
  /** The scope's whole hook list after the edit. */
  hooks: ClaudeHookEntry[];
}
export type ClaudeHooksSaveResult = { ok: true } | { ok: false; message: string };

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
  /** Absolute path of a sub-repository inside the project folder. When set,
   *  the operation targets this repo instead of the project/worktree root.
   *  Used for multi-repo folders (a folder that itself isn't a repo but whose
   *  immediate subfolders are). Must resolve to a path inside the project. */
  repoPath?: string;
}

/** A git repository discovered directly inside a project folder. */
export interface GitRepoEntry {
  /** Display name — the subfolder's basename. */
  name: string;
  /** Absolute path to the repo. */
  path: string;
}

export type GitListReposResult =
  | { ok: true; repos: GitRepoEntry[] }
  | { ok: false; reason: 'git-missing' | 'tab-missing' };

export type GitIsRepoResult =
  | { ok: true; cwd: string }
  | { ok: false; reason: 'not-a-repo' | 'git-missing' | 'tab-missing' };

/** Project files (tracked + untracked, honoring .gitignore), relative to the
 *  repo root, forward slashes — for the Cmd+K fuzzy file finder. */
export type GitLsFilesResult =
  | { ok: true; files: string[] }
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
  /** Amend the previous commit instead of creating a new one. When true and
   *  `subject` is empty, the existing message is kept (`--amend --no-edit`). */
  amend?: boolean;
}

export interface GitCheckoutArgs extends GitTabRef {
  /** Any ref checkout accepts: a local branch, `origin/foo` (auto-creates a
   *  tracking branch), or a commit SHA (detaches HEAD). */
  branch: string;
}

export interface GitCreateBranchArgs extends GitTabRef {
  name: string;
}

export interface GitMergeArgs extends GitTabRef {
  /** Branch/ref to merge into the current branch. */
  branch: string;
}

export interface GitDeleteBranchArgs extends GitTabRef {
  name: string;
  /** Use `-D` instead of `-d` to delete an unmerged branch. */
  force?: boolean;
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
  /** Shell executable override for this tab. Falls back to the configured
   *  default shell (or %COMSPEC%/$SHELL) when omitted. */
  shell?: string;
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

// Docs / markdown viewer IPC payloads -----------------------------------

export interface DocsListArgs {
  projectId: string;
}
export interface DocsFileEntry {
  /** Path relative to the project root, using forward slashes. */
  relPath: string;
  /** Modification time, epoch milliseconds. */
  mtime: number;
  /** Size in bytes. */
  size: number;
}
export type DocsListResult =
  | { ok: true; files: DocsFileEntry[] }
  | { ok: false; reason: 'project-missing' | 'error'; message?: string };

export interface DocsReadArgs {
  projectId: string;
  relPath: string;
}
export type DocsReadResult =
  | { ok: true; contents: string }
  | {
      ok: false;
      reason: 'project-missing' | 'escape' | 'not-found' | 'too-large' | 'binary' | 'error';
      message?: string;
    };

export interface DocsWriteArgs {
  projectId: string;
  relPath: string;
  contents: string;
}
export type DocsWriteResult =
  | { ok: true }
  | { ok: false; reason: 'project-missing' | 'escape' | 'too-large' | 'error'; message?: string };

/** One entry in a directory listing for the file explorer. */
export interface DocsDirEntry {
  name: string;
  /** Path relative to the project root, forward slashes. */
  relPath: string;
  type: 'dir' | 'file';
}
export interface DocsListDirArgs {
  projectId: string;
  /** Directory relative to the project root; '' lists the root. */
  relPath: string;
}
export type DocsListDirResult =
  | { ok: true; entries: DocsDirEntry[] }
  | { ok: false; reason: 'project-missing' | 'escape' | 'not-found' | 'error'; message?: string };

export interface DocsOpenExternalArgs {
  url: string;
}

export interface DocsRevealArgs {
  projectId: string;
  relPath: string;
}
export type DocsRevealResult =
  | { ok: true }
  | { ok: false; reason: 'project-missing' | 'escape' | 'not-found' | 'error'; message?: string };

export interface DocsRenameArgs {
  projectId: string;
  relPath: string;
  /** New base name (no slashes); the entry stays in its current directory. */
  newName: string;
}
export type DocsRenameResult =
  | { ok: true; relPath: string }
  | {
      ok: false;
      reason: 'project-missing' | 'escape' | 'not-found' | 'exists' | 'invalid' | 'error';
      message?: string;
    };

export interface DocsDeleteArgs {
  projectId: string;
  relPath: string;
}
export type DocsDeleteResult =
  | { ok: true }
  | { ok: false; reason: 'project-missing' | 'escape' | 'not-found' | 'error'; message?: string };

export interface DocsCreateArgs {
  projectId: string;
  /** Directory to create the entry in, relative to the project root ('' = root). */
  dirRelPath: string;
  name: string;
  type: 'file' | 'dir';
}
export type DocsCreateResult =
  | { ok: true; relPath: string }
  | {
      ok: false;
      reason: 'project-missing' | 'escape' | 'exists' | 'invalid' | 'error';
      message?: string;
    };

// The typed API exposed on window.api via contextBridge.
export interface DashApi {
  /** Host platform, mirrored from `process.platform` (e.g. 'win32', 'darwin', 'linux'). */
  platform: NodeJS.Platform;
  /** Native clipboard access (Electron's clipboard module) for the terminals. */
  clipboard: {
    readText(): string;
    writeText(text: string): void;
  };
  projects: {
    list(): Promise<Project[]>;
    add(args: ProjectAddArgs): Promise<Project | null>;
    remove(id: string): Promise<ProjectRemoveResult>;
    rename(args: ProjectRenameArgs): Promise<void>;
    reorder(args: ProjectReorderArgs): Promise<void>;
    setActive(active: ActiveSelection | null): Promise<void>;
    setWorktreesCollapsed(args: ProjectSetWorktreesCollapsedArgs): Promise<void>;
    setFolder(args: ProjectSetFolderArgs): Promise<void>;
    pickDirectory(): Promise<ProjectPickDirectoryResult>;
  };
  folders: {
    list(): Promise<ProjectFolder[]>;
    create(args: FolderCreateArgs): Promise<ProjectFolder>;
    rename(args: FolderRenameArgs): Promise<void>;
    remove(id: string): Promise<void>;
    setCollapsed(args: FolderSetCollapsedArgs): Promise<void>;
    reorder(args: FolderReorderArgs): Promise<void>;
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
    getDocsView(): Promise<DocsViewSettings>;
    setDocsView(patch: Partial<Omit<DocsViewSettings, 'version'>>): Promise<DocsViewSettings>;
    onDocsViewChanged(handler: (s: DocsViewSettings) => void): () => void;
    getIntegratedTerminal(): Promise<IntegratedTerminalSettings>;
    setIntegratedTerminal(
      patch: Partial<Omit<IntegratedTerminalSettings, 'version'>>,
    ): Promise<IntegratedTerminalSettings>;
    onIntegratedTerminalChanged(handler: (s: IntegratedTerminalSettings) => void): () => void;
    getWebAccess(): Promise<WebAccessSettings>;
    setWebAccess(
      patch: Partial<Omit<WebAccessSettings, 'version'>>,
    ): Promise<WebAccessSettings>;
    onWebAccessChanged(handler: (s: WebAccessSettings) => void): () => void;
    getAgents(): Promise<AgentsSettings>;
    setAgents(agents: AgentDef[]): Promise<AgentsSettings>;
    onAgentsChanged(handler: (s: AgentsSettings) => void): () => void;
    getConsoleCommand(): Promise<ConsoleCommandSettings>;
    setConsoleCommand(
      patch: Partial<Omit<ConsoleCommandSettings, 'version'>>,
    ): Promise<ConsoleCommandSettings>;
    onConsoleCommandChanged(handler: (s: ConsoleCommandSettings) => void): () => void;
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
  claude: {
    onHookState(handler: (ev: ClaudeHookStateEvent) => void): () => void;
    readConfig(args: ClaudeConfigArgs): Promise<ClaudeConfigResult>;
    saveHooks(args: ClaudeHooksSaveArgs): Promise<ClaudeHooksSaveResult>;
  };
  mod: {
    onShow(handler: (view: ModModalView) => void): () => void;
    onClose(handler: (id: string) => void): () => void;
    press(id: string, key: string): void;
    onSendOffer(handler: (offer: ModSendOffer) => void): () => void;
  };
  git: {
    isRepo(args: GitTabRef): Promise<GitIsRepoResult>;
    listRepos(args: GitTabRef): Promise<GitListReposResult>;
    status(args: GitTabRef): Promise<GitStatusResult>;
    log(args: GitLogArgs): Promise<GitLogResult>;
    branches(args: GitTabRef): Promise<GitBranchesResult>;
    lsFiles(args: GitTabRef): Promise<GitLsFilesResult>;
    stage(args: GitStagePathsArgs): Promise<GitOperationResult>;
    unstage(args: GitStagePathsArgs): Promise<GitOperationResult>;
    commit(args: GitCommitArgs): Promise<GitOperationResult>;
    push(args: GitTabRef): Promise<GitOperationResult>;
    pushForce(args: GitTabRef): Promise<GitOperationResult>;
    fetch(args: GitTabRef): Promise<GitOperationResult>;
    pull(args: GitTabRef): Promise<GitOperationResult>;
    merge(args: GitMergeArgs): Promise<GitOperationResult>;
    checkout(args: GitCheckoutArgs): Promise<GitOperationResult>;
    createBranch(args: GitCreateBranchArgs): Promise<GitOperationResult>;
    deleteBranch(args: GitDeleteBranchArgs): Promise<GitOperationResult>;
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
  docs: {
    list(args: DocsListArgs): Promise<DocsListResult>;
    listDir(args: DocsListDirArgs): Promise<DocsListDirResult>;
    read(args: DocsReadArgs): Promise<DocsReadResult>;
    write(args: DocsWriteArgs): Promise<DocsWriteResult>;
    openExternal(url: string): Promise<void>;
    reveal(args: DocsRevealArgs): Promise<DocsRevealResult>;
    rename(args: DocsRenameArgs): Promise<DocsRenameResult>;
    delete(args: DocsDeleteArgs): Promise<DocsDeleteResult>;
    create(args: DocsCreateArgs): Promise<DocsCreateResult>;
  };
  tasks: {
    list(): Promise<TasksState>;
    /** The user's change; may type a note about it into the owner's console. */
    edit(edit: TaskUserEdit): Promise<TaskUserEditResult>;
    delete(id: string): Promise<boolean>;
    /** Fires with the whole board whenever a session or the user changes it. */
    onChanged(cb: (state: TasksState) => void): () => void;
    /** Open (or focus) the Tasks view in its own window. */
    openWindow(): Promise<void>;
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
  app: {
    /** Tell the main process whether there are unsaved file edits, so it can
     *  warn before the window/app closes. */
    setUnsaved(unsaved: boolean): void;
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
