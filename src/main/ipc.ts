import { app, BrowserWindow, dialog, ipcMain, Notification } from 'electron';
import { promises as fs } from 'node:fs';
import {
  IPC,
  compositeKey,
  type BrowseTerminalStyleResult,
  type NotifyAttentionArgs,
  type ProjectAddArgs,
  type ProjectPickDirectoryResult,
  type ProjectRemoveResult,
  type ProjectRenameArgs,
  type ProjectReorderArgs,
  type PtyCloseArgs,
  type PtyDataEvent,
  type PtyErrorEvent,
  type PtyExitEvent,
  type PtyOpenArgs,
  type PtyResizeArgs,
  type PtyWriteArgs,
  type TodoAddArgs,
  type TodoRemoveArgs,
  type TodoUpdateArgs,
  type WorktreeCreateArgs,
  type WorktreeCreateResult,
  type WorktreeReconcileEntry,
  type WorktreeHeadEntry,
  type WorktreeRemoveArgs,
  type WorktreeRemoveResult,
} from '@shared/ipc';
import { loadStyleFromFile } from './terminal-style-file';
import type { ProjectRegistry } from './registry';
import type { JsonStore } from './store';
import type { SettingsManager } from './settings';
import type {
  ActiveSelection,
  GitViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
  Todo,
  TodoViewSettings,
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
}): void {
  const { store, registry, ptyManager, shellManager, settings, getWindow } = args;

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
    const key = compositeKey(args.projectId, args.worktreeId ?? null);
    const result = await ptyManager.spawn({
      key,
      cwd,
      cols: args.cols,
      rows: args.rows,
      onData: (data) => {
        const ev: PtyDataEvent = {
          projectId: args.projectId,
          worktreeId: args.worktreeId ?? null,
          data,
        };
        send(IPC.PtyData, ev);
      },
      onExit: (exitCode, signal) => {
        const ev: PtyExitEvent = {
          projectId: args.projectId,
          worktreeId: args.worktreeId ?? null,
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
        error: result.error,
      };
      send(IPC.PtyError, ev);
    }
    return result;
  });

  ipcMain.on(IPC.PtyWrite, (_e, args: PtyWriteArgs) => {
    const key = compositeKey(args.projectId, args.worktreeId ?? null);
    ptyManager.get(key)?.write(args.data);
  });

  ipcMain.on(IPC.PtyResize, (_e, args: PtyResizeArgs) => {
    const key = compositeKey(args.projectId, args.worktreeId ?? null);
    ptyManager.get(key)?.resize(args.cols, args.rows);
  });

  ipcMain.handle(IPC.PtyClose, async (_e, args: PtyCloseArgs) => {
    const key = compositeKey(args.projectId, args.worktreeId ?? null);
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
        body: 'Claude is waiting for input.',
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

  ipcMain.handle(IPC.SettingsGetTodoView, async (): Promise<TodoViewSettings> => {
    return settings.getTodoView();
  });

  ipcMain.handle(
    IPC.SettingsSetTodoView,
    async (_e, patch: Partial<Omit<TodoViewSettings, 'version'>>): Promise<TodoViewSettings> => {
      const next = settings.setTodoView(patch);
      await store.flush();
      return next;
    },
  );

  settings.on('todoViewChanged', (s: TodoViewSettings) => {
    send(IPC.SettingsTodoViewChanged, s);
  });

  // Todo CRUD ----------------------------------------------------------

  ipcMain.handle(IPC.TodoList, async (_e, projectId: string): Promise<Todo[]> => {
    return registry.listTodos(projectId);
  });

  ipcMain.handle(IPC.TodoAdd, async (_e, args: TodoAddArgs): Promise<Todo | null> => {
    const created = registry.addTodo(args.projectId, args.text);
    if (created) await store.flush();
    return created;
  });

  ipcMain.handle(IPC.TodoUpdate, async (_e, args: TodoUpdateArgs): Promise<Todo | null> => {
    const updated = registry.updateTodo(args.projectId, args.id, args.patch);
    if (updated) await store.flush();
    return updated;
  });

  ipcMain.handle(IPC.TodoRemove, async (_e, args: TodoRemoveArgs): Promise<void> => {
    registry.removeTodo(args.projectId, args.id);
    await store.flush();
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
