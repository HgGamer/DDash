import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type DashApi,
  type ProjectAddArgs,
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
import type { TerminalStylePreset, TerminalStyleSettings } from '@shared/types';

function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: DashApi = {
  projects: {
    list: () => ipcRenderer.invoke(IPC.ProjectList),
    add: (args: ProjectAddArgs) => ipcRenderer.invoke(IPC.ProjectAdd, args),
    remove: (id: string) => ipcRenderer.invoke(IPC.ProjectRemove, id),
    rename: (args: ProjectRenameArgs) => ipcRenderer.invoke(IPC.ProjectRename, args),
    reorder: (args: ProjectReorderArgs) => ipcRenderer.invoke(IPC.ProjectReorder, args),
    setActive: (id: string | null) => ipcRenderer.invoke(IPC.ProjectSetActive, id),
    pickDirectory: () => ipcRenderer.invoke(IPC.ProjectPickDirectory),
  },
  pty: {
    open: (args: PtyOpenArgs) => ipcRenderer.invoke(IPC.PtyOpen, args),
    write: (args: PtyWriteArgs) => ipcRenderer.send(IPC.PtyWrite, args),
    resize: (args: PtyResizeArgs) => ipcRenderer.send(IPC.PtyResize, args),
    close: (args: PtyCloseArgs) => ipcRenderer.invoke(IPC.PtyClose, args),
    onData: (h) => subscribe<PtyDataEvent>(IPC.PtyData, h),
    onExit: (h) => subscribe<PtyExitEvent>(IPC.PtyExit, h),
    onError: (h) => subscribe<PtyErrorEvent>(IPC.PtyError, h),
  },
  settings: {
    getTerminalStyle: () => ipcRenderer.invoke(IPC.SettingsGetTerminalStyle),
    setTerminalStyle: (preset: TerminalStylePreset) =>
      ipcRenderer.invoke(IPC.SettingsSetTerminalStyle, preset),
    browseTerminalStyle: () => ipcRenderer.invoke(IPC.SettingsBrowseTerminalStyle),
    onTerminalStyleChanged: (h) =>
      subscribe<TerminalStyleSettings>(IPC.SettingsTerminalStyleChanged, h),
  },
  menu: {
    onAddProject: (h) => subscribe<void>(IPC.MenuAddProject, () => h()),
    onRemoveActive: (h) => subscribe<void>(IPC.MenuRemoveActive, () => h()),
    onNextTab: (h) => subscribe<void>(IPC.MenuNextTab, () => h()),
    onPrevTab: (h) => subscribe<void>(IPC.MenuPrevTab, () => h()),
    onActivateIndex: (h) => subscribe<number>(IPC.MenuActivateIndex, (i) => h(i)),
    onOpenTerminalStyle: (h) => subscribe<void>(IPC.MenuOpenTerminalStyle, () => h()),
  },
};

contextBridge.exposeInMainWorld('api', api);
