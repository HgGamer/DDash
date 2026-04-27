import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { AutoUpdateInfo, AutoUpdateSettings } from '@shared/types';
import type { AutoUpdater } from './auto-updater';
import type { SettingsManager } from './settings';
import type { JsonStore } from './store';

export function registerAutoUpdateIpc(args: {
  updater: AutoUpdater;
  settings: SettingsManager;
  store: JsonStore;
  getWindow: () => BrowserWindow | null;
}): void {
  const { updater, settings, store, getWindow } = args;

  const send = (channel: string, payload: unknown) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle(IPC.AutoUpdateGetInfo, async (): Promise<AutoUpdateInfo> => updater.getInfo());

  ipcMain.handle(IPC.AutoUpdateGetSettings, async (): Promise<AutoUpdateSettings> =>
    settings.getAutoUpdate(),
  );

  ipcMain.handle(
    IPC.AutoUpdateSetSettings,
    async (
      _e,
      patch: Partial<Omit<AutoUpdateSettings, 'version'>>,
    ): Promise<AutoUpdateSettings> => {
      const next = settings.setAutoUpdate(patch);
      await store.flush();
      return next;
    },
  );

  ipcMain.handle(IPC.AutoUpdateCheck, async (): Promise<AutoUpdateInfo> => updater.check());

  ipcMain.handle(IPC.AutoUpdateInstallNow, async (): Promise<void> => {
    await updater.installNow();
  });

  updater.on('info', (info) => send(IPC.AutoUpdateInfoChanged, info));
  settings.on('autoUpdateChanged', (s: AutoUpdateSettings) => {
    send(IPC.AutoUpdateSettingsChanged, s);
  });
}
