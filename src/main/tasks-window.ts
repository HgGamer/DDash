import { app, BrowserWindow, ipcMain, shell, webContents } from 'electron';
import { IPC } from '@shared/ipc';
import { TASKS_BOARD_URL, TASKS_PARTITION, isAllowedTasksUrl } from '@shared/tasks';

/**
 * The task board (a claude.ai artifact page) is shown two ways: embedded in the
 * Tasks view through a <webview>, and popped out into its own window. Both use
 * one persistent partition, so a single claude.ai login serves both.
 *
 * Guest pages are remote content: no node, no preload, context isolation on,
 * and navigation is kept to claude.ai and the identity providers its login uses;
 * any other link opens in the system browser.
 */
let tasksWindow: BrowserWindow | null = null;

/** Reads the board page's headline counters (#c-fut, #c-rad, #c-sor). */
const READ_COUNTS = `(() => {
  const n = (id) => { const el = document.getElementById(id); const v = el ? parseInt(el.textContent || '', 10) : NaN; return Number.isFinite(v) ? v : null; };
  const r = { running: n('c-fut'), waiting: n('c-rad'), queued: n('c-sor') };
  return r.running === null || r.waiting === null || r.queued === null ? null : r;
})()`;

function guardGuest(contents: Electron.WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedTasksUrl(url)) {
      // Login popups (Google, Apple, Microsoft) stay inside the partition.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          webPreferences: {
            partition: TASKS_PARTITION,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (!isAllowedTasksUrl(url)) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
}

export function registerTasksIpc(): void {
  // Every <webview> the renderer attaches is forced onto the board's partition
  // with node off, whatever attributes it asked for.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (_ev, webPreferences, params) => {
      delete (webPreferences as { preload?: string }).preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.partition = TASKS_PARTITION;
      if (!isAllowedTasksUrl(params.src)) params.src = TASKS_BOARD_URL;
    });
    if (contents.getType() === 'webview') guardGuest(contents);
  });

  // The artifact page runs in a sandboxed iframe inside claude.ai's shell, out of
  // reach of the renderer; the main process runs a read-only probe in every
  // frame of the guest and returns the first frame that has the counters.
  ipcMain.handle(IPC.TasksReadCounts, async (_e, id: number) => {
    const wc = webContents.fromId(id);
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return null;
    for (const frame of wc.mainFrame.framesInSubtree) {
      try {
        const r = (await frame.executeJavaScript(READ_COUNTS)) as {
          running: number;
          waiting: number;
          queued: number;
        } | null;
        if (r) return r;
      } catch {
        /* a frame that is gone or still loading */
      }
    }
    return null;
  });

  ipcMain.handle(IPC.TasksOpenWindow, async (): Promise<void> => {
    if (tasksWindow && !tasksWindow.isDestroyed()) {
      if (tasksWindow.isMinimized()) tasksWindow.restore();
      tasksWindow.focus();
      return;
    }
    const win = new BrowserWindow({
      width: 1100,
      height: 860,
      minWidth: 420,
      minHeight: 400,
      title: 'Dash — Tasks',
      autoHideMenuBar: true,
      webPreferences: {
        partition: TASKS_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    guardGuest(win.webContents);
    win.on('closed', () => {
      if (tasksWindow === win) tasksWindow = null;
    });
    tasksWindow = win;
    await win.loadURL(TASKS_BOARD_URL);
  });
}
