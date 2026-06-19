import path from 'node:path';
import { ipcMain, type BrowserWindow } from 'electron';
import {
  IPC,
  type ShellListArgs,
  type ShellOpenArgs,
  type ShellOpenResult,
  type ShellRenameArgs,
  type ShellResizeArgs,
  type ShellTabIdArgs,
  type ShellWriteArgs,
} from '@shared/ipc';
import type { ShellTab } from '@shared/types';
import type { ProjectRegistry } from './registry';
import type { SettingsManager } from './settings';
import { ShellSessionManager, resolveDefaultShell } from './shell-session';

/** Friendly, human-readable name for a shell executable path. */
function shellDisplayName(shell: string): string {
  const base = path.basename(shell).toLowerCase();
  if (base.includes('pwsh')) return 'pwsh';
  if (base.includes('powershell')) return 'PowerShell';
  if (base.includes('cmd')) return 'Command Prompt';
  if (base.includes('bash')) return 'bash';
  if (base.includes('zsh')) return 'zsh';
  if (base.includes('fish')) return 'fish';
  return path.basename(shell) || 'shell';
}

export function registerShellIpc(args: {
  registry: ProjectRegistry;
  settings: SettingsManager;
  shellManager: ShellSessionManager;
  getWindow: () => BrowserWindow | null;
}): { dispose: () => void } {
  const { registry, settings, shellManager, getWindow } = args;

  function resolveCwd(projectId: string, worktreeId: string | null): string | null {
    const proj = registry.getById(projectId);
    if (!proj) return null;
    if (!worktreeId) return proj.path;
    const wt = proj.worktrees.find((w) => w.id === worktreeId);
    return wt ? wt.path : null;
  }

  ipcMain.handle(
    IPC.ShellOpen,
    async (_e, req: ShellOpenArgs): Promise<ShellOpenResult> => {
      // If the session already exists (e.g. the renderer remounted), return the
      // cached tab + buffered replay so the client can restore the view.
      const existing = shellManager.get(req.tabId);
      if (existing) {
        return { ok: true, tab: { ...existing.tab }, replay: existing.replay() };
      }

      const worktreeId = req.worktreeId ?? null;
      const cwd = resolveCwd(req.projectId, worktreeId);
      if (!cwd) return { ok: false, reason: 'tab-missing' };

      // A per-tab override (chosen from the "new terminal" shell picker) wins;
      // otherwise fall back to the configured default shell.
      const shell =
        req.shell && req.shell.trim().length > 0
          ? req.shell
          : resolveDefaultShell(settings.getIntegratedTerminal().defaultShell);
      // Label the tab by its shell so it's obvious which one launched (the cwd
      // is still shown in the tab's hover tooltip).
      const label = req.label ?? shellDisplayName(shell);

      const result = await shellManager.spawn({
        tabId: req.tabId,
        projectId: req.projectId,
        worktreeId,
        cwd,
        shell,
        label,
        cols: req.cols,
        rows: req.rows,
        onData: (data) => {
          const win = getWindow();
          if (win && !win.isDestroyed()) win.webContents.send(IPC.ShellData, { tabId: req.tabId, data });
        },
        onExit: (exitCode, signal) => {
          const win = getWindow();
          if (win && !win.isDestroyed())
            win.webContents.send(IPC.ShellExit, { tabId: req.tabId, exitCode, signal });
        },
      });

      if (!result.ok) {
        return { ok: false, reason: 'spawn-failed', message: result.message };
      }
      return { ok: true, tab: result.tab, replay: '' };
    },
  );

  ipcMain.handle(IPC.ShellClose, async (_e, req: ShellTabIdArgs): Promise<void> => {
    shellManager.close(req.tabId);
  });

  ipcMain.on(IPC.ShellWrite, (_e, req: ShellWriteArgs) => {
    shellManager.get(req.tabId)?.write(req.data);
  });

  ipcMain.on(IPC.ShellResize, (_e, req: ShellResizeArgs) => {
    shellManager.get(req.tabId)?.resize(req.cols, req.rows);
  });

  ipcMain.handle(IPC.ShellList, async (_e, req: ShellListArgs): Promise<ShellTab[]> => {
    return shellManager.listFor(req.projectId, req.worktreeId ?? null);
  });

  ipcMain.handle(IPC.ShellRename, async (_e, req: ShellRenameArgs): Promise<void> => {
    shellManager.rename(req.tabId, req.label);
  });

  return {
    dispose() {
      ipcMain.removeHandler(IPC.ShellOpen);
      ipcMain.removeHandler(IPC.ShellClose);
      ipcMain.removeAllListeners(IPC.ShellWrite);
      ipcMain.removeAllListeners(IPC.ShellResize);
      ipcMain.removeHandler(IPC.ShellList);
      ipcMain.removeHandler(IPC.ShellRename);
    },
  };
}
