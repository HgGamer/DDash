import { app, BrowserWindow, dialog, ipcMain, Notification } from 'electron';
import { promises as fs } from 'node:fs';
import {
  IPC,
  agentKey,
  compositeKey,
  type BrowseTerminalStyleResult,
  type NotifyAttentionArgs,
  type ProjectAddArgs,
  type ProjectPickDirectoryResult,
  type ProjectRemoveResult,
  type ProjectRenameArgs,
  type ProjectReorderArgs,
  type ProjectSetWorktreesCollapsedArgs,
  type ProjectSetFolderArgs,
  type FolderCreateArgs,
  type FolderRenameArgs,
  type FolderSetCollapsedArgs,
  type FolderReorderArgs,
  type PtyCloseArgs,
  type PtyDataEvent,
  type PtyErrorEvent,
  type PtyExitEvent,
  type PtyOpenArgs,
  type PtyResizeArgs,
  type PtyWriteArgs,
  type WorktreeCreateArgs,
  type WorktreeCreateResult,
  type WorktreeReconcileEntry,
  type WorktreeHeadEntry,
  type WorktreeRemoveArgs,
  type WorktreeRemoveResult,
} from '@shared/ipc';
import { loadStyleFromFile } from './terminal-style-file';
import { readClaudeUsageToday } from './claude-usage';
import { readClaudePlanUsage } from './claude-plan-usage';
import type { ProjectRegistry } from './registry';
import type { JsonStore } from './store';
import type { SettingsManager } from './settings';
import type {
  ActiveSelection,
  AgentDef,
  AgentsSettings,
  DocsViewSettings,
  GitViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
  WebAccessSettings,
  Worktree,
} from '@shared/types';
import { PtySessionManager } from './pty-session';
import type { ShellSessionManager } from './shell-session';
import {
  addWorktree as gitAddWorktree,
  computeDefaultWorktreePath,
  listLocalBranches as gitListLocalBranches,
  listWorktrees as gitListWorktrees,
  listWorktreesWithHeads as gitListWorktreesWithHeads,
  removeWorktree as gitRemoveWorktree,
} from './git';

export function registerIpc(args: {
  store: JsonStore;
  registry: ProjectRegistry;
  ptyManager: PtySessionManager;
  shellManager: ShellSessionManager;
  settings: SettingsManager;
  getWindow: () => BrowserWindow | null;
  remoteFeed?: (key: string, data: string) => void;
  webFeed?: (key: string, data: string) => void;
}): void {
  const { store, registry, ptyManager, shellManager, settings, getWindow, remoteFeed, webFeed } = args;

  const send = (channel: string, payload: unknown) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle(IPC.ProjectList, async () => registry.list());

  ipcMain.handle(IPC.ProjectAdd, async (_e, args: ProjectAddArgs) => {
    const proj = await registry.add(args.path, args.name);
    await store.flush();
    return proj;
  });

  ipcMain.handle(IPC.ProjectRemove, async (_e, id: string): Promise<ProjectRemoveResult> => {
    const proj = registry.getById(id);
    if (!proj) return { ok: true };
    const errors: { worktreeId: string; message: string }[] = [];
    // Kill all PTYs (primary + worktrees) up front.
    const primaryKey = compositeKey(id, null);
    const primarySession = ptyManager.get(primaryKey);
    if (primarySession) {
      ptyManager.delete(primaryKey);
      await primarySession.kill();
    }
    for (const wt of proj.worktrees) {
      const k = compositeKey(id, wt.id);
      const s = ptyManager.get(k);
      if (s) {
        ptyManager.delete(k);
        await s.kill();
      }
    }
    shellManager.killForProject(id);
    // Remove each worktree via git, collecting failures.
    for (const wt of proj.worktrees) {
      const r = await gitRemoveWorktree(proj.path, wt.path, { force: false });
      if (r.ok) {
        registry.removeWorktreeFromRegistry(id, wt.id);
      } else {
        errors.push({ worktreeId: wt.id, message: r.stderr || r.stdout || `git exited ${r.exitCode}` });
      }
    }
    if (errors.length > 0) {
      await store.flush();
      return { ok: false, errors };
    }
    registry.remove(id);
    await store.flush();
    return { ok: true };
  });

  ipcMain.handle(IPC.ProjectRename, async (_e, args: ProjectRenameArgs) => {
    registry.rename(args.id, args.name);
    await store.flush();
  });

  ipcMain.handle(IPC.ProjectReorder, async (_e, args: ProjectReorderArgs) => {
    registry.reorder(args.orderedIds);
    await store.flush();
  });

  ipcMain.handle(IPC.ProjectSetActive, async (_e, active: ActiveSelection | null) => {
    registry.setLastActive(active);
    await store.flush();
  });

  ipcMain.handle(
    IPC.ProjectSetWorktreesCollapsed,
    async (_e, a: ProjectSetWorktreesCollapsedArgs) => {
      registry.setWorktreesCollapsed(a.id, a.collapsed);
      await store.flush();
    },
  );

  ipcMain.handle(IPC.ProjectSetFolder, async (_e, a: ProjectSetFolderArgs) => {
    registry.setProjectFolder(a.projectId, a.folderId);
    await store.flush();
  });

  // Folder handlers -----------------------------------------------------

  ipcMain.handle(IPC.FolderList, async () => registry.listFolders());

  ipcMain.handle(IPC.FolderCreate, async (_e, a: FolderCreateArgs) => {
    const folder = registry.createFolder(a.name);
    await store.flush();
    return folder;
  });

  ipcMain.handle(IPC.FolderRename, async (_e, a: FolderRenameArgs) => {
    registry.renameFolder(a.id, a.name);
    await store.flush();
  });

  ipcMain.handle(IPC.FolderRemove, async (_e, id: string) => {
    registry.removeFolder(id);
    await store.flush();
  });

  ipcMain.handle(IPC.FolderSetCollapsed, async (_e, a: FolderSetCollapsedArgs) => {
    registry.setFolderCollapsed(a.id, a.collapsed);
    await store.flush();
  });

  ipcMain.handle(IPC.FolderReorder, async (_e, a: FolderReorderArgs) => {
    registry.reorderFolders(a.orderedIds);
    await store.flush();
  });

  ipcMain.handle(IPC.ProjectPickDirectory, async (): Promise<ProjectPickDirectoryResult> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Add Project',
    });
    if (result.canceled || result.filePaths.length === 0) return { path: null };
    return { path: result.filePaths[0] };
  });

  // Worktree handlers ---------------------------------------------------

  ipcMain.handle(IPC.WorktreeList, async (_e, projectId: string): Promise<Worktree[]> => {
    return registry.getById(projectId)?.worktrees ?? [];
  });

  ipcMain.handle(
    IPC.WorktreeListWithHeads,
    async (_e, projectId: string): Promise<WorktreeHeadEntry[]> => {
      const proj = registry.getById(projectId);
      if (!proj) return [];
      return gitListWorktreesWithHeads(proj);
    },
  );

  ipcMain.handle(
    IPC.WorktreeCreate,
    async (_e, a: WorktreeCreateArgs): Promise<WorktreeCreateResult> => {
      const proj = registry.getById(a.projectId);
      if (!proj) return { ok: false, error: 'project not found' };
      const targetPath = a.path ?? (await computeDefaultWorktreePath(proj, a.branch));
      const r = await gitAddWorktree(proj.path, { branch: a.branch, path: targetPath, mode: a.mode });
      if (!r.ok) {
        return { ok: false, error: r.stderr || r.stdout || `git exited ${r.exitCode}` };
      }
      const wt = registry.addWorktree(a.projectId, { branch: a.branch, path: targetPath });
      registry.pushRecentBranch(a.projectId, a.branch);
      await store.flush();
      return { ok: true, worktree: wt };
    },
  );

  ipcMain.handle(
    IPC.WorktreeRemove,
    async (_e, a: WorktreeRemoveArgs): Promise<WorktreeRemoveResult> => {
      const proj = registry.getById(a.projectId);
      if (!proj) return { ok: false, error: 'project not found' };
      const wt = proj.worktrees.find((w) => w.id === a.worktreeId);
      if (!wt) return { ok: false, error: 'worktree not found' };
      const k = compositeKey(a.projectId, a.worktreeId);
      const s = ptyManager.get(k);
      if (s) {
        ptyManager.delete(k);
        await s.kill();
      }
      shellManager.killForProject(a.projectId, a.worktreeId);
      const r = await gitRemoveWorktree(proj.path, wt.path, { force: !!a.force });
      if (!r.ok) {
        return { ok: false, error: r.stderr || r.stdout || `git exited ${r.exitCode}` };
      }
      registry.removeWorktreeFromRegistry(a.projectId, a.worktreeId);
      await store.flush();
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.WorktreeReconcile,
    async (_e, projectId: string): Promise<WorktreeReconcileEntry[]> => {
      const proj = registry.getById(projectId);
      if (!proj) return [];
      const list = await gitListWorktrees(proj.path);
      const knownPaths = new Set(list.map((e) => e.path));
      const out: WorktreeReconcileEntry[] = [];
      for (const wt of proj.worktrees) {
        let present = knownPaths.has(wt.path);
        if (present) {
          try {
            await fs.access(wt.path);
          } catch {
            present = false;
          }
        }
        const status: 'present' | 'missing' = present ? 'present' : 'missing';
        registry.setWorktreeStatus(projectId, wt.id, status === 'missing' ? 'missing' : undefined);
        out.push({ worktreeId: wt.id, status });
      }
      return out;
    },
  );

  ipcMain.handle(IPC.WorktreeListLocalBranches, async (_e, projectId: string): Promise<string[]> => {
    const proj = registry.getById(projectId);
    if (!proj) return [];
    return gitListLocalBranches(proj.path);
  });

  ipcMain.handle(
    IPC.WorktreeComputeDefaultPath,
    async (_e, projectId: string, branch: string): Promise<string> => {
      const proj = registry.getById(projectId);
      if (!proj) return '';
      return computeDefaultWorktreePath(proj, branch);
    },
  );

  // PTY handlers --------------------------------------------------------

  ipcMain.handle(IPC.PtyOpen, async (_e, args: PtyOpenArgs) => {
    const proj = registry.getById(args.projectId);
    if (!proj) return { ok: false, error: { kind: 'path-missing', path: '' } };
    let cwd = proj.path;
    if (args.worktreeId) {
      const wt = proj.worktrees.find((w) => w.id === args.worktreeId);
      if (!wt) {
        const ev: PtyErrorEvent = {
          projectId: args.projectId,
          worktreeId: args.worktreeId,
          error: { kind: 'path-missing', path: '' },
        };
        send(IPC.PtyError, ev);
        return { ok: false, error: ev.error };
      }
      cwd = wt.path;
    }
    const agentId = args.agentId ?? null;
    // Resolve the command for a custom agent; the built-in Claude session has
    // no agentId and no command (handled by PtySession.spawn's default path).
    let command: string | undefined;
    if (agentId) {
      const agent = settings.getAgents().agents.find((a) => a.id === agentId);
      if (!agent) {
        const ev: PtyErrorEvent = {
          projectId: args.projectId,
          worktreeId: args.worktreeId ?? null,
          agentId,
          error: { kind: 'path-missing', path: '' },
        };
        send(IPC.PtyError, ev);
        return { ok: false, error: ev.error };
      }
      command = agent.command;
    }
    // On Windows, if the user picked a default shell (e.g. PowerShell), launch
    // Claude Code / agent tabs through it too. Empty = keep the direct launch.
    const winShell =
      process.platform === 'win32'
        ? settings.getIntegratedTerminal().defaultShell?.trim() || undefined
        : undefined;
    const key = agentKey(args.projectId, args.worktreeId ?? null, agentId);
    const result = await ptyManager.spawn({
      key,
      cwd,
      cols: args.cols,
      rows: args.rows,
      command,
      shell: winShell,
      onData: (data) => {
        const ev: PtyDataEvent = {
          projectId: args.projectId,
          worktreeId: args.worktreeId ?? null,
          agentId,
          data,
        };
        send(IPC.PtyData, ev);
        remoteFeed?.(key, data);
        webFeed?.(key, data);
      },
      onExit: (exitCode, signal) => {
        const ev: PtyExitEvent = {
          projectId: args.projectId,
          worktreeId: args.worktreeId ?? null,
          agentId,
          exitCode,
          signal,
        };
        ptyManager.delete(key);
        send(IPC.PtyExit, ev);
      },
    });
    if (!result.ok && result.error) {
      const ev: PtyErrorEvent = {
        projectId: args.projectId,
        worktreeId: args.worktreeId ?? null,
        agentId,
        error: result.error,
      };
      send(IPC.PtyError, ev);
    }
    return result;
  });

  ipcMain.on(IPC.PtyWrite, (_e, args: PtyWriteArgs) => {
    const key = agentKey(args.projectId, args.worktreeId ?? null, args.agentId ?? null);
    ptyManager.get(key)?.write(args.data);
  });

  ipcMain.on(IPC.PtyResize, (_e, args: PtyResizeArgs) => {
    const key = agentKey(args.projectId, args.worktreeId ?? null, args.agentId ?? null);
    ptyManager.get(key)?.resize(args.cols, args.rows);
  });

  ipcMain.handle(IPC.PtyClose, async (_e, args: PtyCloseArgs) => {
    const key = agentKey(args.projectId, args.worktreeId ?? null, args.agentId ?? null);
    const session = ptyManager.get(key);
    if (!session) return;
    ptyManager.delete(key);
    await session.kill();
  });

  // Attention -----------------------------------------------------------

  const attention = new Set<string>();
  const updateBadge = () => {
    if (process.platform === 'darwin') {
      app.dock?.setBadge(attention.size > 0 ? String(attention.size) : '');
    } else {
      app.setBadgeCount(attention.size);
    }
  };

  ipcMain.on(IPC.NotifyAttention, (_e, args: NotifyAttentionArgs) => {
    const win = getWindow();
    const focused = !!win && win.isFocused();
    if (focused) return;
    const key = compositeKey(args.projectId, args.worktreeId ?? null);
    const firstTime = !attention.has(key);
    attention.add(key);
    updateBadge();
    if (!firstTime) return;
    const prefs = settings.getNotifications();
    if (prefs.systemNotifications && Notification.isSupported()) {
      new Notification({
        title: args.projectName,
        body: args.kind === 'done' ? 'Claude is done.' : 'Claude is waiting for input.',
        silent: false,
      }).show();
    }
    if (prefs.dockBounce && process.platform === 'darwin') app.dock?.bounce('critical');
  });

  ipcMain.on(IPC.NotifyAttentionClear, (_e, key: string) => {
    if (!attention.delete(key)) return;
    updateBadge();
  });

  const attachFocusClear = (win: BrowserWindow) => {
    win.on('focus', () => {
      if (attention.size === 0) return;
      attention.clear();
      updateBadge();
    });
  };
  const initialWin = getWindow();
  if (initialWin) attachFocusClear(initialWin);
  app.on('browser-window-created', (_e, win) => attachFocusClear(win));

  ipcMain.handle(IPC.SettingsGetTerminalStyle, async (): Promise<TerminalStyleSettings> => {
    return settings.getTerminalStyle();
  });

  ipcMain.handle(
    IPC.SettingsSetTerminalStyle,
    async (_e, preset: TerminalStylePreset): Promise<TerminalStyleSettings> => {
      const next = settings.setTerminalStyle(preset);
      await store.flush();
      return next;
    },
  );

  ipcMain.handle(
    IPC.SettingsSetTerminalStyleOverrides,
    async (_e, overrides: TerminalStyleOptions | null): Promise<TerminalStyleSettings> => {
      const next = settings.setTerminalStyleOverrides(overrides);
      await store.flush();
      return next;
    },
  );

  ipcMain.handle(IPC.SettingsGetNotifications, async (): Promise<NotificationSettings> => {
    return settings.getNotifications();
  });

  ipcMain.handle(
    IPC.SettingsSetNotifications,
    async (_e, patch: Partial<Omit<NotificationSettings, 'version'>>): Promise<NotificationSettings> => {
      const next = settings.setNotifications(patch);
      await store.flush();
      return next;
    },
  );

  settings.on('notificationsChanged', (s: NotificationSettings) => {
    send(IPC.SettingsNotificationsChanged, s);
  });

  ipcMain.handle(IPC.SettingsGetGitView, async (): Promise<GitViewSettings> => {
    return settings.getGitView();
  });

  ipcMain.handle(
    IPC.SettingsSetGitView,
    async (_e, patch: Partial<Omit<GitViewSettings, 'version'>>): Promise<GitViewSettings> => {
      const next = settings.setGitView(patch);
      await store.flush();
      return next;
    },
  );

  settings.on('gitViewChanged', (s: GitViewSettings) => {
    send(IPC.SettingsGitViewChanged, s);
  });

  ipcMain.handle(IPC.SettingsGetWebAccess, async (): Promise<WebAccessSettings> => {
    return settings.getWebAccess();
  });

  ipcMain.handle(
    IPC.SettingsSetWebAccess,
    async (_e, patch: Partial<Omit<WebAccessSettings, 'version'>>): Promise<WebAccessSettings> => {
      const next = settings.setWebAccess(patch);
      await store.flush();
      return next;
    },
  );

  settings.on('webAccessChanged', (s: WebAccessSettings) => {
    send(IPC.SettingsWebAccessChanged, s);
  });

  ipcMain.handle(IPC.SettingsGetDocsView, async (): Promise<DocsViewSettings> => {
    return settings.getDocsView();
  });

  ipcMain.handle(
    IPC.SettingsSetDocsView,
    async (_e, patch: Partial<Omit<DocsViewSettings, 'version'>>): Promise<DocsViewSettings> => {
      const next = settings.setDocsView(patch);
      await store.flush();
      return next;
    },
  );

  settings.on('docsViewChanged', (s: DocsViewSettings) => {
    send(IPC.SettingsDocsViewChanged, s);
  });

  ipcMain.handle(IPC.SettingsGetAgents, async (): Promise<AgentsSettings> => {
    const [usage, planUsage] = await Promise.all([
      readClaudeUsageToday(),
      readClaudePlanUsage(),
    ]);
    return { ...settings.getAgents(), claudeUsage: usage, claudePlanUsage: planUsage } as AgentsSettings;
  });

  ipcMain.handle(
    IPC.SettingsSetAgents,
    async (_e, agents: AgentDef[]): Promise<AgentsSettings> => {
      const next = settings.setAgents(agents);
      await store.flush();
      return next;
    },
  );

  settings.on('agentsChanged', (s: AgentsSettings) => {
    send(IPC.SettingsAgentsChanged, s);
  });

  ipcMain.handle(
    IPC.SettingsGetIntegratedTerminal,
    async (): Promise<IntegratedTerminalSettings> => settings.getIntegratedTerminal(),
  );

  ipcMain.handle(
    IPC.SettingsSetIntegratedTerminal,
    async (
      _e,
      patch: Partial<Omit<IntegratedTerminalSettings, 'version'>>,
    ): Promise<IntegratedTerminalSettings> => {
      const next = settings.setIntegratedTerminal(patch);
      await store.flush();
      return next;
    },
  );

  settings.on('integratedTerminalChanged', (s: IntegratedTerminalSettings) => {
    send(IPC.SettingsIntegratedTerminalChanged, s);
  });

  ipcMain.handle(IPC.SettingsBrowseTerminalStyle, async (): Promise<BrowseTerminalStyleResult> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile'],
      title: 'Load Terminal Style',
      filters: [
        { name: 'Terminal Style', extensions: ['json', 'terminal'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Apple Terminal Profile', extensions: ['terminal'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, reason: 'canceled' };
    }
    try {
      const loaded = await loadStyleFromFile(result.filePaths[0]);
      const next = settings.setCustomTerminalStyle(loaded.style, loaded.name);
      await store.flush();
      return { ok: true, settings: next };
    } catch (err) {
      return { ok: false, reason: 'invalid', message: (err as Error).message };
    }
  });

  settings.on('terminalStyleChanged', (next: TerminalStyleSettings) => {
    send(IPC.SettingsTerminalStyleChanged, next);
  });
}
