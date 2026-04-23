import { BrowserWindow, dialog, ipcMain } from 'electron';
import {
  IPC,
  type BrowseTerminalStyleResult,
  type ProjectAddArgs,
  type ProjectPickDirectoryResult,
  type ProjectRenameArgs,
  type ProjectReorderArgs,
  type PtyCloseArgs,
  type PtyDataEvent,
  type PtyErrorEvent,
  type PtyExitEvent,
  type PtyOpenArgs,
  type PtyResizeArgs,
  type PtyWriteArgs,
} from '@shared/ipc';
import { loadStyleFromFile } from './terminal-style-file';
import type { ProjectRegistry } from './registry';
import type { JsonStore } from './store';
import type { SettingsManager } from './settings';
import type { TerminalStylePreset, TerminalStyleSettings } from '@shared/types';
import { PtySessionManager } from './pty-session';

export function registerIpc(args: {
  store: JsonStore;
  registry: ProjectRegistry;
  ptyManager: PtySessionManager;
  settings: SettingsManager;
  getWindow: () => BrowserWindow | null;
}): void {
  const { store, registry, ptyManager, settings, getWindow } = args;

  const send = (channel: string, payload: unknown) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle(IPC.ProjectList, async () => registry.list());

  ipcMain.handle(IPC.ProjectAdd, async (_e, args: ProjectAddArgs) => {
    const proj = registry.add(args.path, args.name);
    await store.flush();
    return proj;
  });

  ipcMain.handle(IPC.ProjectRemove, async (_e, id: string) => {
    // Kill any live session first.
    const session = ptyManager.get(id);
    if (session) {
      ptyManager.delete(id);
      await session.kill();
    }
    registry.remove(id);
    await store.flush();
  });

  ipcMain.handle(IPC.ProjectRename, async (_e, args: ProjectRenameArgs) => {
    registry.rename(args.id, args.name);
    await store.flush();
  });

  ipcMain.handle(IPC.ProjectReorder, async (_e, args: ProjectReorderArgs) => {
    registry.reorder(args.orderedIds);
    await store.flush();
  });

  ipcMain.handle(IPC.ProjectSetActive, async (_e, id: string | null) => {
    registry.setLastActive(id);
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

  ipcMain.handle(IPC.PtyOpen, async (_e, args: PtyOpenArgs) => {
    const proj = registry.getById(args.projectId);
    if (!proj) return { ok: false, error: { kind: 'path-missing', path: '' } };
    const result = await ptyManager.spawn({
      projectId: args.projectId,
      cwd: proj.path,
      cols: args.cols,
      rows: args.rows,
      onData: (data) => {
        // eslint-disable-next-line no-console
        console.log(`[pty:${args.projectId.slice(0, 6)}] data ${data.length}b:`, JSON.stringify(data.slice(0, 120)));
        const ev: PtyDataEvent = { projectId: args.projectId, data };
        send(IPC.PtyData, ev);
      },
      onExit: (exitCode, signal) => {
        const ev: PtyExitEvent = { projectId: args.projectId, exitCode, signal };
        ptyManager.delete(args.projectId);
        send(IPC.PtyExit, ev);
      },
    });
    if (!result.ok && result.error) {
      const ev: PtyErrorEvent = { projectId: args.projectId, error: result.error };
      send(IPC.PtyError, ev);
    }
    return result;
  });

  ipcMain.on(IPC.PtyWrite, (_e, args: PtyWriteArgs) => {
    const s = ptyManager.get(args.projectId);
    // eslint-disable-next-line no-console
    console.log(`[pty:${args.projectId.slice(0, 6)}] write ${args.data.length}b:`, JSON.stringify(args.data), 'session?', !!s);
    s?.write(args.data);
  });

  ipcMain.on(IPC.PtyResize, (_e, args: PtyResizeArgs) => {
    ptyManager.get(args.projectId)?.resize(args.cols, args.rows);
  });

  ipcMain.handle(IPC.PtyClose, async (_e, args: PtyCloseArgs) => {
    const session = ptyManager.get(args.projectId);
    if (!session) return;
    ptyManager.delete(args.projectId);
    await session.kill();
  });

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
