import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { IPC } from '@shared/ipc';

export function installAppMenu(getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin';
  const isDev = !app.isPackaged;

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
        {
          label: 'Terminal Style…',
          click: () => send(IPC.MenuOpenTerminalStyle),
        },
        { type: 'separator' },
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
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
