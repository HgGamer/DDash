import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type DashApi,
  type GitCheckoutArgs,
  type GitChangedEvent,
  type GitCommitArgs,
  type GitCreateBranchArgs,
  type GitDiffArgs,
  type GitDiscardArgs,
  type GitLogArgs,
  type GitShowCommitArgs,
  type GitStagePathsArgs,
  type GitTabRef,
  type ProjectAddArgs,
  type ProjectRenameArgs,
  type ProjectReorderArgs,
  type PtyCloseArgs,
  type PtyDataEvent,
  type PtyErrorEvent,
  type PtyExitEvent,
  type PtyOpenArgs,
  type PtyResizeArgs,
  type PtyWriteArgs,
  type NotifyAttentionArgs,
  type ShellDataEvent,
  type ShellExitEvent,
  type ShellListArgs,
  type ShellOpenArgs,
  type ShellRenameArgs,
  type ShellResizeArgs,
  type ShellTabIdArgs,
  type ShellWriteArgs,
  type TodoAddArgs,
  type TodoRemoveArgs,
  type TodoUpdateArgs,
  type WorktreeCreateArgs,
  type WorktreeRemoveArgs,
} from '@shared/ipc';
import type {
  ActiveSelection,
  AutoUpdateInfo,
  AutoUpdateSettings,
  GitViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
  TodoViewSettings,
} from '@shared/types';

function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: DashApi = {
  projects: {
    list: () => ipcRenderer.invoke(IPC.ProjectList),
    add: (args: ProjectAddArgs) => ipcRenderer.invoke(IPC.ProjectAdd, args),
    remove: (id: string) => ipcRenderer.invoke(IPC.ProjectRemove, id),
    rename: (args: ProjectRenameArgs) => ipcRenderer.invoke(IPC.ProjectRename, args),
    reorder: (args: ProjectReorderArgs) => ipcRenderer.invoke(IPC.ProjectReorder, args),
    setActive: (active: ActiveSelection | null) =>
      ipcRenderer.invoke(IPC.ProjectSetActive, active),
    pickDirectory: () => ipcRenderer.invoke(IPC.ProjectPickDirectory),
  },
  worktrees: {
    list: (projectId: string) => ipcRenderer.invoke(IPC.WorktreeList, projectId),
    create: (args: WorktreeCreateArgs) => ipcRenderer.invoke(IPC.WorktreeCreate, args),
    remove: (args: WorktreeRemoveArgs) => ipcRenderer.invoke(IPC.WorktreeRemove, args),
    reconcile: (projectId: string) => ipcRenderer.invoke(IPC.WorktreeReconcile, projectId),
    listLocalBranches: (projectId: string) =>
      ipcRenderer.invoke(IPC.WorktreeListLocalBranches, projectId),
    computeDefaultPath: (projectId: string, branch: string) =>
      ipcRenderer.invoke(IPC.WorktreeComputeDefaultPath, projectId, branch),
  },
  pty: {
    open: (args: PtyOpenArgs) => ipcRenderer.invoke(IPC.PtyOpen, args),
    write: (args: PtyWriteArgs) => ipcRenderer.send(IPC.PtyWrite, args),
    resize: (args: PtyResizeArgs) => ipcRenderer.send(IPC.PtyResize, args),
    close: (args: PtyCloseArgs) => ipcRenderer.invoke(IPC.PtyClose, args),
    onData: (h) => subscribe<PtyDataEvent>(IPC.PtyData, h),
    onExit: (h) => subscribe<PtyExitEvent>(IPC.PtyExit, h),
    onError: (h) => subscribe<PtyErrorEvent>(IPC.PtyError, h),
  },
  settings: {
    getTerminalStyle: () => ipcRenderer.invoke(IPC.SettingsGetTerminalStyle),
    setTerminalStyle: (preset: TerminalStylePreset) =>
      ipcRenderer.invoke(IPC.SettingsSetTerminalStyle, preset),
    setTerminalStyleOverrides: (overrides: TerminalStyleOptions | null) =>
      ipcRenderer.invoke(IPC.SettingsSetTerminalStyleOverrides, overrides),
    browseTerminalStyle: () => ipcRenderer.invoke(IPC.SettingsBrowseTerminalStyle),
    onTerminalStyleChanged: (h) =>
      subscribe<TerminalStyleSettings>(IPC.SettingsTerminalStyleChanged, h),
    getNotifications: () => ipcRenderer.invoke(IPC.SettingsGetNotifications),
    setNotifications: (patch: Partial<Omit<NotificationSettings, 'version'>>) =>
      ipcRenderer.invoke(IPC.SettingsSetNotifications, patch),
    onNotificationsChanged: (h) =>
      subscribe<NotificationSettings>(IPC.SettingsNotificationsChanged, h),
    getGitView: () => ipcRenderer.invoke(IPC.SettingsGetGitView),
    setGitView: (patch: Partial<Omit<GitViewSettings, 'version'>>) =>
      ipcRenderer.invoke(IPC.SettingsSetGitView, patch),
    onGitViewChanged: (h) => subscribe<GitViewSettings>(IPC.SettingsGitViewChanged, h),
    getTodoView: () => ipcRenderer.invoke(IPC.SettingsGetTodoView),
    setTodoView: (patch: Partial<Omit<TodoViewSettings, 'version'>>) =>
      ipcRenderer.invoke(IPC.SettingsSetTodoView, patch),
    onTodoViewChanged: (h) => subscribe<TodoViewSettings>(IPC.SettingsTodoViewChanged, h),
    getIntegratedTerminal: () => ipcRenderer.invoke(IPC.SettingsGetIntegratedTerminal),
    setIntegratedTerminal: (patch: Partial<Omit<IntegratedTerminalSettings, 'version'>>) =>
      ipcRenderer.invoke(IPC.SettingsSetIntegratedTerminal, patch),
    onIntegratedTerminalChanged: (h) =>
      subscribe<IntegratedTerminalSettings>(IPC.SettingsIntegratedTerminalChanged, h),
  },
  shell: {
    open: (args: ShellOpenArgs) => ipcRenderer.invoke(IPC.ShellOpen, args),
    close: (args: ShellTabIdArgs) => ipcRenderer.invoke(IPC.ShellClose, args),
    write: (args: ShellWriteArgs) => ipcRenderer.send(IPC.ShellWrite, args),
    resize: (args: ShellResizeArgs) => ipcRenderer.send(IPC.ShellResize, args),
    list: (args: ShellListArgs) => ipcRenderer.invoke(IPC.ShellList, args),
    rename: (args: ShellRenameArgs) => ipcRenderer.invoke(IPC.ShellRename, args),
    onData: (h) => subscribe<ShellDataEvent>(IPC.ShellData, h),
    onExit: (h) => subscribe<ShellExitEvent>(IPC.ShellExit, h),
  },
  git: {
    isRepo: (args: GitTabRef) => ipcRenderer.invoke(IPC.GitIsRepo, args),
    status: (args: GitTabRef) => ipcRenderer.invoke(IPC.GitStatus, args),
    log: (args: GitLogArgs) => ipcRenderer.invoke(IPC.GitLog, args),
    branches: (args: GitTabRef) => ipcRenderer.invoke(IPC.GitBranches, args),
    stage: (args: GitStagePathsArgs) => ipcRenderer.invoke(IPC.GitStage, args),
    unstage: (args: GitStagePathsArgs) => ipcRenderer.invoke(IPC.GitUnstage, args),
    commit: (args: GitCommitArgs) => ipcRenderer.invoke(IPC.GitCommit, args),
    push: (args: GitTabRef) => ipcRenderer.invoke(IPC.GitPush, args),
    checkout: (args: GitCheckoutArgs) => ipcRenderer.invoke(IPC.GitCheckout, args),
    createBranch: (args: GitCreateBranchArgs) => ipcRenderer.invoke(IPC.GitCreateBranch, args),
    diff: (args: GitDiffArgs) => ipcRenderer.invoke(IPC.GitDiff, args),
    showCommit: (args: GitShowCommitArgs) => ipcRenderer.invoke(IPC.GitShowCommit, args),
    discard: (args: GitDiscardArgs) => ipcRenderer.invoke(IPC.GitDiscard, args),
    subscribe: (args: GitTabRef) => ipcRenderer.invoke(IPC.GitSubscribe, args),
    unsubscribe: (args: GitTabRef) => ipcRenderer.invoke(IPC.GitUnsubscribe, args),
    onChanged: (h) => subscribe<GitChangedEvent>(IPC.GitChanged, h),
  },
  todos: {
    list: (projectId: string) => ipcRenderer.invoke(IPC.TodoList, projectId),
    add: (args: TodoAddArgs) => ipcRenderer.invoke(IPC.TodoAdd, args),
    update: (args: TodoUpdateArgs) => ipcRenderer.invoke(IPC.TodoUpdate, args),
    remove: (args: TodoRemoveArgs) => ipcRenderer.invoke(IPC.TodoRemove, args),
  },
  notify: {
    attention: (args: NotifyAttentionArgs) => ipcRenderer.send(IPC.NotifyAttention, args),
    attentionClear: (key: string) => ipcRenderer.send(IPC.NotifyAttentionClear, key),
  },
  autoUpdate: {
    getInfo: () => ipcRenderer.invoke(IPC.AutoUpdateGetInfo),
    getSettings: () => ipcRenderer.invoke(IPC.AutoUpdateGetSettings),
    setSettings: (patch: Partial<Omit<AutoUpdateSettings, 'version'>>) =>
      ipcRenderer.invoke(IPC.AutoUpdateSetSettings, patch),
    check: () => ipcRenderer.invoke(IPC.AutoUpdateCheck),
    installNow: () => ipcRenderer.invoke(IPC.AutoUpdateInstallNow),
    onInfoChanged: (h) => subscribe<AutoUpdateInfo>(IPC.AutoUpdateInfoChanged, h),
    onSettingsChanged: (h) => subscribe<AutoUpdateSettings>(IPC.AutoUpdateSettingsChanged, h),
  },
  menu: {
    onAddProject: (h) => subscribe<void>(IPC.MenuAddProject, () => h()),
    onRemoveActive: (h) => subscribe<void>(IPC.MenuRemoveActive, () => h()),
    onNextTab: (h) => subscribe<void>(IPC.MenuNextTab, () => h()),
    onPrevTab: (h) => subscribe<void>(IPC.MenuPrevTab, () => h()),
    onActivateIndex: (h) => subscribe<number>(IPC.MenuActivateIndex, (i) => h(i)),
    onOpenSettings: (h) => subscribe<void>(IPC.MenuOpenSettings, () => h()),
  },
};

contextBridge.exposeInMainWorld('api', api);
