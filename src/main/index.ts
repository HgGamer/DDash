import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { JsonStore } from './store';
import { ProjectRegistry } from './registry';
import { PtySessionManager } from './pty-session';
import { registerIpc } from './ipc';
import { installAppMenu } from './menu';
import { attachWindowStatePersistence } from './window-state';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let store!: JsonStore;
let registry!: ProjectRegistry;
const ptyManager = new PtySessionManager();

async function createWindow(): Promise<void> {
  const state = store.get();
  const win = new BrowserWindow({
    width: state.window.width,
    height: state.window.height,
    x: state.window.x ?? undefined,
    y: state.window.y ?? undefined,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (state.window.maximized) win.maximize();

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  attachWindowStatePersistence(win, store);

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devUrl) {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.whenReady().then(async () => {
  store = new JsonStore({ dir: app.getPath('userData') });
  await store.load();
  registry = new ProjectRegistry(store);

  registerIpc({ store, registry, ptyManager, getWindow: () => mainWindow });
  installAppMenu(() => mainWindow);

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  // Quit on all platforms when the last window is closed, including macOS —
  // this is a single-window developer tool, not a background/menu-bar app.
  app.quit();
});

let cleanShutdownStarted = false;
app.on('before-quit', (event) => {
  if (cleanShutdownStarted) return;
  cleanShutdownStarted = true;
  event.preventDefault();
  void (async () => {
    try {
      await ptyManager.killAll();
      if (store) await store.flush();
    } finally {
      app.exit(0);
    }
  })();
});
