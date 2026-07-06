import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import path from 'node:path';
import { JsonStore } from './store';
import { ProjectRegistry } from './registry';
import { PtySessionManager } from './pty-session';
import { registerIpc } from './ipc';
import { registerGitIpc } from './git-ipc';
import { registerShellIpc } from './shell-ipc';
import { registerDocsIpc } from './docs-ipc';
import { ShellSessionManager } from './shell-session';
import { installAppMenu } from './menu';
import { SettingsManager } from './settings';
import { attachWindowStatePersistence } from './window-state';
import { createAutoUpdater, type AutoUpdater } from './auto-updater';
import { registerAutoUpdateIpc } from './auto-update-ipc';
import { RemoteServer } from './remote-server';
import { WebServer } from './web-server';
import { ClaudeHooks } from './claude-hooks';
import { ClaudeTray } from './tray';
import { compositeKey, IPC } from '../shared/ipc';
import { resolveTerminalStyleOptions, type WebAccessSettings } from '@shared/types';

const isDev = !app.isPackaged;

// In production, electron-builder generates platform-native icons from
// `build/icon.png` and packs them into the app bundle, so the OS picks them
// up automatically. In dev we need to point at the PNG on disk ourselves so
// the dev window (and macOS dock) show the right icon.
const devIconPath = path.join(app.getAppPath(), 'build', 'icon.png');

let mainWindow: BrowserWindow | null = null;
// Tracks whether the renderer has unsaved file edits, and whether the user has
// already confirmed discarding them during this close/quit sequence.
let hasUnsavedChanges = false;
let unsavedConfirmed = false;
let store!: JsonStore;
let registry!: ProjectRegistry;
const ptyManager = new PtySessionManager();
const shellManager = new ShellSessionManager();
let autoUpdater: AutoUpdater | null = null;
let claudeHooks: ClaudeHooks | null = null;
let claudeTray: ClaudeTray | null = null;

/** Returns true if it's OK to proceed with closing (no unsaved changes, or the
 *  user chose to discard them). Shows a confirm dialog otherwise. */
function confirmDiscardIfUnsaved(parent?: BrowserWindow): boolean {
  if (!hasUnsavedChanges || unsavedConfirmed) return true;
  const opts = {
    type: 'warning' as const,
    buttons: ['Discard & Close', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Unsaved changes',
    message: 'You have unsaved changes.',
    detail: 'Close anyway? Your unsaved edits will be lost.',
  };
  const choice = parent ? dialog.showMessageBoxSync(parent, opts) : dialog.showMessageBoxSync(opts);
  if (choice === 0) {
    unsavedConfirmed = true;
    return true;
  }
  return false;
}

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

  // Warn before closing the window if there are unsaved file edits.
  win.on('close', (e) => {
    if (!confirmDiscardIfUnsaved(win)) e.preventDefault();
  });

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

  ipcMain.on(IPC.AppSetUnsaved, (_e, unsaved: boolean) => {
    hasUnsavedChanges = !!unsaved;
    if (!hasUnsavedChanges) unsavedConfirmed = false;
  });

  store = new JsonStore({ dir: app.getPath('userData') });
  await store.load();
  registry = new ProjectRegistry(store);
  await registry.refreshGitMeta();
  const settings = new SettingsManager(store);

  const remoteServer = new RemoteServer({ registry, ptyManager, compositeKey });
  remoteServer.start(7779);

  const webServer = new WebServer({
    registry,
    ptyManager,
    compositeKey,
    getTerminalStyle: () => resolveTerminalStyleOptions(settings.getTerminalStyle()),
  });
  const applyWebAccess = async (wa: WebAccessSettings) => {
    // Always stop first so port/password changes are picked up.
    if (webServer.isRunning()) {
      await webServer.stop();
    }
    if (wa.enabled && wa.password.length > 0) {
      try {
        await webServer.start({ port: wa.port, password: wa.password });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[web-server] failed to start:', (err as Error).message);
      }
    }
  };
  void applyWebAccess(settings.getWebAccess());
  settings.on('webAccessChanged', (wa) => { void applyWebAccess(wa); });

  // Reliable "done" / "needs input" signals via Claude Code hooks. Auto-installs
  // its hook into ~/.claude/settings.json and forwards state to the renderer.
  claudeTray = new ClaudeTray(() => mainWindow);
  claudeTray.start();
  claudeHooks = new ClaudeHooks({
    registry,
    onState: (ev) => {
      claudeTray?.update(compositeKey(ev.projectId, ev.worktreeId), ev.state);
      const win = mainWindow;
      if (win && !win.isDestroyed()) win.webContents.send(IPC.ClaudeHookState, ev);
    },
  });
  void claudeHooks.start();

  registerIpc({
    store, registry, ptyManager, shellManager, settings,
    getWindow: () => mainWindow,
    remoteFeed: (k, d) => remoteServer.feed(k, d),
    webFeed: (k, d) => webServer.feed(k, d),
  });
  registerGitIpc({ registry, getWindow: () => mainWindow });
  registerShellIpc({ registry, settings, shellManager, getWindow: () => mainWindow });
  registerDocsIpc({ registry });
  autoUpdater = createAutoUpdater({ settings, store, getWindow: () => mainWindow });
  registerAutoUpdateIpc({ updater: autoUpdater, settings, store, getWindow: () => mainWindow });
  installAppMenu(() => mainWindow, () => autoUpdater, settings);

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
  // Warn about unsaved edits on Cmd/Ctrl+Q (where no window 'close' fires first).
  if (!confirmDiscardIfUnsaved(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined)) {
    event.preventDefault();
    return;
  }
  cleanShutdownStarted = true;
  event.preventDefault();
  void (async () => {
    try {
      await ptyManager.killAll();
      shellManager.killAll();
      claudeTray?.destroy();
      await claudeHooks?.stop();
      if (store) await store.flush();
    } catch {
      // best-effort cleanup; fall through to exit either way
    }
    // If an update has been downloaded, swap the running app for the new
    // one now — quitAndInstall replaces the binary and relaunches, so we
    // typically never reach `app.exit` below.
    if (autoUpdater?.hasPendingInstall()) {
      autoUpdater.shutdown();
      try {
        await autoUpdater.installNow();
      } catch {
        // best-effort; fall through to exit either way
      }
    } else {
      autoUpdater?.shutdown();
    }
    app.exit(0);
  })();
});
