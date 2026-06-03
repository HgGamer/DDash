import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { IPC } from '@shared/ipc';
import type { AutoUpdater } from './auto-updater';
import type { SettingsManager } from './settings';

export function installAppMenu(
  getWindow: () => BrowserWindow | null,
  getUpdater: () => AutoUpdater | null = () => null,
  settings?: SettingsManager,
): void {
  const build = (): void => doInstall(getWindow, getUpdater, settings, build);
  build();
}

function doInstall(
  getWindow: () => BrowserWindow | null,
  getUpdater: () => AutoUpdater | null,
  settings: SettingsManager | undefined,
  rebuild: () => void,
): void {
  const isMac = process.platform === 'darwin';
  const isDev = !app.isPackaged;
  const webAccess = settings?.getWebAccess();
  if (settings && !(rebuild as { _wired?: boolean })._wired) {
    settings.on('webAccessChanged', () => rebuild());
    (rebuild as { _wired?: boolean })._wired = true;
  }
  const webAccessItem: MenuItemConstructorOptions | null = settings && webAccess
    ? {
        label: 'Web access (LAN)',
        type: 'checkbox',
        checked: webAccess.enabled,
        enabled: webAccess.password.length > 0,
        click: () => {
          settings.setWebAccess({ enabled: !webAccess.enabled });
        },
      }
    : null;
  // Disable the menu item on builds where the updater is a no-op so users
  // don't get a misleading "checking" spinner that never finds anything.
  const updaterEnabled = (() => {
    const u = getUpdater();
    if (!u) return !isDev; // updater not yet wired — fall back to packaged-build heuristic
    const state = u.getInfo().state;
    return !(state.kind === 'idle' && state.disabledReason);
  })();
  const checkForUpdates: MenuItemConstructorOptions = {
    label: 'Check for updates…',
    enabled: updaterEnabled,
    click: () => void getUpdater()?.check(),
  };

  const send = (channel: string, payload?: unknown) => {
    const w = getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  };

  const tabAccelerators: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: `Tab ${i + 1}`,
    accelerator: `${isMac ? 'Cmd' : 'Ctrl'}+${i + 1}`,
    click: () => send(IPC.MenuActivateIndex, i),
    visible: false,
  }));

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              checkForUpdates,
              { type: 'separator' },
              {
                label: 'Settings…',
                accelerator: 'Cmd+,',
                click: () => send(IPC.MenuOpenSettings),
              },
              ...(webAccessItem ? [{ type: 'separator' } as MenuItemConstructorOptions, webAccessItem] : []),
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Add Project…',
          accelerator: isMac ? 'Cmd+O' : 'Ctrl+O',
          click: () => send(IPC.MenuAddProject),
        },
        {
          label: 'Remove Active Project',
          accelerator: isMac ? 'Cmd+Backspace' : 'Ctrl+Delete',
          click: () => send(IPC.MenuRemoveActive),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...(isMac
          ? []
          : ([
              {
                label: 'Settings…',
                accelerator: 'Ctrl+,',
                click: () => send(IPC.MenuOpenSettings),
              },
              ...(webAccessItem ? [webAccessItem] : []),
              { type: 'separator' },
            ] as MenuItemConstructorOptions[])),
        { role: 'togglefullscreen' },
        // Dev-only diagnostics — not shipped to end users.
        ...(isDev
          ? ([
              { type: 'separator' },
              { role: 'reload' },
              { role: 'toggleDevTools' },
            ] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: 'Tabs',
      submenu: [
        {
          label: 'Next Tab',
          accelerator: isMac ? 'Cmd+Alt+Right' : 'Ctrl+Tab',
          click: () => send(IPC.MenuNextTab),
        },
        {
          label: 'Previous Tab',
          accelerator: isMac ? 'Cmd+Alt+Left' : 'Ctrl+Shift+Tab',
          click: () => send(IPC.MenuPrevTab),
        },
        { type: 'separator' },
        ...tabAccelerators,
      ],
    },
    {
      role: 'window',
      submenu: [{ role: 'minimize' }, ...(isMac ? ([{ role: 'zoom' }] as MenuItemConstructorOptions[]) : [])],
    },
    ...(isMac
      ? []
      : ([
          {
            label: 'Help',
            submenu: [checkForUpdates],
          },
        ] as MenuItemConstructorOptions[])),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
