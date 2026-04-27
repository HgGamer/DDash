import { app, BrowserWindow, nativeImage, shell } from 'electron';
import path from 'node:path';
import { JsonStore } from './store';
import { ProjectRegistry } from './registry';
import { PtySessionManager } from './pty-session';
import { registerIpc } from './ipc';
import { registerGitIpc } from './git-ipc';
import { registerShellIpc } from './shell-ipc';
import { ShellSessionManager } from './shell-session';
import { installAppMenu } from './menu';
import { SettingsManager } from './settings';
import { attachWindowStatePersistence } from './window-state';
import { createAutoUpdater, type AutoUpdater } from './auto-updater';
import { registerAutoUpdateIpc } from './auto-update-ipc';

const isDev = !app.isPackaged;

// In production, electron-builder generates platform-native icons from
// `build/icon.png` and packs them into the app bundle, so the OS picks them
// up automatically. In dev we need to point at the PNG on disk ourselves so
// the dev window (and macOS dock) show the right icon.
const devIconPath = path.join(app.getAppPath(), 'build', 'icon.png');

let mainWindow: BrowserWindow | null = null;
let store!: JsonStore;
let registry!: ProjectRegistry;
const ptyManager = new PtySessionManager();
const shellManager = new ShellSessionManager();
let autoUpdater: AutoUpdater | null = null;

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
    ...(isDev ? { icon: devIconPath } : {}),
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
  if (isDev && process.platform === 'darwin' && app.dock) {
    const img = nativeImage.createFromPath(devIconPath);
    if (!img.isEmpty()) app.dock.setIcon(img);
  }

  store = new JsonStore({ dir: app.getPath('userData') });
  await store.load();
  registry = new ProjectRegistry(store);
  await registry.refreshGitMeta();
  const settings = new SettingsManager(store);

  registerIpc({ store, registry, ptyManager, shellManager, settings, getWindow: () => mainWindow });
  registerGitIpc({ registry, getWindow: () => mainWindow });
  registerShellIpc({ registry, settings, shellManager, getWindow: () => mainWindow });
  autoUpdater = createAutoUpdater({ settings, store, getWindow: () => mainWindow });
  registerAutoUpdateIpc({ updater: autoUpdater, settings, store, getWindow: () => mainWindow });
  installAppMenu(() => mainWindow, () => autoUpdater);

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
      shellManager.killAll();
      if (store) await store.flush();
    } catch {
      // best-effort cleanup; fall through to exit either way
    }
    // If an update has been downloaded, swap the running app for the new
    // one now — quitAndInstall replaces the binary and relaunches, so we
    // never reach `app.exit` below in that path.
    if (autoUpdater?.hasPendingInstall()) {
      autoUpdater.shutdown();
      try {
        await autoUpdater.installNow();
        return;
      } catch {
        // fall through to normal exit if the install handoff fails
      }
    }
    autoUpdater?.shutdown();
    app.exit(0);
  })();
});
