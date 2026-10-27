import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { ENTER_DELAY_MS, pastePayload } from '@shared/console-paste';
import type { TaskUserEdit } from '@shared/tasks';
import type { PtySessionManager } from './pty-session';
import { TasksStore } from './tasks-store';

/**
 * The task board's main-process side: the store (shared with the loopback hook
 * server, where sessions write), the renderer IPC, and the pop-out window — a
 * second renderer showing only the Tasks view (`?view=tasks`).
 */
let tasksWindow: BrowserWindow | null = null;

export function createTasksStore(dir: string, ptyManager: PtySessionManager): TasksStore {
  return new TasksStore(dir, (key, text) => {
    const pty = ptyManager.get(key);
    if (!pty) return false;
    pty.write(pastePayload(text));
    setTimeout(() => pty.write('\r'), ENTER_DELAY_MS);
    return true;
  });
}

export function registerTasksIpc(deps: {
  tasks: TasksStore;
  /** Loads the renderer into a window, with extra query parameters. */
  loadRenderer: (win: BrowserWindow, query: Record<string, string>) => Promise<void>;
  preload: string;
}): void {
  const { tasks } = deps;
  tasks.onChange((state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.TasksChanged, state);
    }
  });

  ipcMain.handle(IPC.TasksList, () => tasks.get());
  ipcMain.handle(IPC.TasksEdit, (_e, edit: TaskUserEdit) => tasks.userEdit(edit));
  ipcMain.handle(IPC.TasksDelete, (_e, id: string) => tasks.remove(String(id)));

  ipcMain.handle(IPC.TasksOpenWindow, async (): Promise<void> => {
    if (tasksWindow && !tasksWindow.isDestroyed()) {
      if (tasksWindow.isMinimized()) tasksWindow.restore();
      tasksWindow.focus();
      return;
    }
    const win = new BrowserWindow({
      width: 1000,
      height: 820,
      minWidth: 420,
      minHeight: 400,
      title: 'Dash — Tasks',
      autoHideMenuBar: true,
      backgroundColor: '#0b0b0c',
      webPreferences: {
        preload: deps.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.on('closed', () => {
      if (tasksWindow === win) tasksWindow = null;
    });
    tasksWindow = win;
    await deps.loadRenderer(win, { view: 'tasks' });
  });
}
