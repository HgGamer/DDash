import type { Project, PtySpawnResult, TerminalStylePreset, TerminalStyleSettings } from './types';

export const IPC = {
  // Project registry (renderer → main, request/response)
  ProjectList: 'project:list',
  ProjectAdd: 'project:add',
  ProjectRemove: 'project:remove',
  ProjectRename: 'project:rename',
  ProjectReorder: 'project:reorder',
  ProjectSetActive: 'project:setActive',
  ProjectPickDirectory: 'project:pickDirectory',

  // PTY lifecycle (renderer → main)
  PtyOpen: 'pty:open',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyClose: 'pty:close',

  // PTY events (main → renderer)
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
  PtyError: 'pty:error',

  // Settings (renderer ↔ main)
  SettingsGetTerminalStyle: 'settings:getTerminalStyle',
  SettingsSetTerminalStyle: 'settings:setTerminalStyle',
  SettingsBrowseTerminalStyle: 'settings:browseTerminalStyle',
  SettingsTerminalStyleChanged: 'settings:terminalStyleChanged',

  // Attention / system notifications (renderer → main)
  NotifyAttention: 'notify:attention',
  NotifyAttentionClear: 'notify:attentionClear',

  // Menu/shortcut events (main → renderer)
  MenuAddProject: 'menu:addProject',
  MenuRemoveActive: 'menu:removeActive',
  MenuNextTab: 'menu:nextTab',
  MenuPrevTab: 'menu:prevTab',
  MenuActivateIndex: 'menu:activateIndex',
  MenuOpenTerminalStyle: 'menu:openTerminalStyle',
} as const;

// Request/response payloads
export interface ProjectAddArgs {
  path: string;
  name?: string;
}
export interface ProjectRenameArgs {
  id: string;
  name: string;
}
export interface ProjectReorderArgs {
  orderedIds: string[];
}
export interface ProjectPickDirectoryResult {
  path: string | null;
}

export type BrowseTerminalStyleResult =
  | { ok: true; settings: TerminalStyleSettings }
  | { ok: false; reason: 'canceled' }
  | { ok: false; reason: 'invalid'; message: string };

export interface PtyOpenArgs {
  projectId: string;
  cols: number;
  rows: number;
}
export interface PtyWriteArgs {
  projectId: string;
  data: string;
}
export interface PtyResizeArgs {
  projectId: string;
  cols: number;
  rows: number;
}
export interface PtyCloseArgs {
  projectId: string;
}

// Event payloads
export interface PtyDataEvent {
  projectId: string;
  data: string;
}
export interface PtyExitEvent {
  projectId: string;
  exitCode: number | null;
  signal: number | null;
}
export interface PtyErrorEvent {
  projectId: string;
  error: NonNullable<PtySpawnResult['error']>;
}

export interface NotifyAttentionArgs {
  projectId: string;
  projectName: string;
}

// The typed API exposed on window.api via contextBridge.
export interface DashApi {
  projects: {
    list(): Promise<Project[]>;
    add(args: ProjectAddArgs): Promise<Project | null>;
    remove(id: string): Promise<void>;
    rename(args: ProjectRenameArgs): Promise<void>;
    reorder(args: ProjectReorderArgs): Promise<void>;
    setActive(id: string | null): Promise<void>;
    pickDirectory(): Promise<ProjectPickDirectoryResult>;
  };
  pty: {
    open(args: PtyOpenArgs): Promise<PtySpawnResult>;
    write(args: PtyWriteArgs): void;
    resize(args: PtyResizeArgs): void;
    close(args: PtyCloseArgs): Promise<void>;
    onData(handler: (ev: PtyDataEvent) => void): () => void;
    onExit(handler: (ev: PtyExitEvent) => void): () => void;
    onError(handler: (ev: PtyErrorEvent) => void): () => void;
  };
  settings: {
    getTerminalStyle(): Promise<TerminalStyleSettings>;
    setTerminalStyle(preset: TerminalStylePreset): Promise<TerminalStyleSettings>;
    browseTerminalStyle(): Promise<BrowseTerminalStyleResult>;
    onTerminalStyleChanged(handler: (s: TerminalStyleSettings) => void): () => void;
  };
  notify: {
    attention(args: NotifyAttentionArgs): void;
    attentionClear(projectId: string): void;
  };
  menu: {
    onAddProject(handler: () => void): () => void;
    onRemoveActive(handler: () => void): () => void;
    onNextTab(handler: () => void): () => void;
    onPrevTab(handler: () => void): () => void;
    onActivateIndex(handler: (index: number) => void): () => void;
    onOpenTerminalStyle(handler: () => void): () => void;
  };
}

declare global {
  interface Window {
    api: DashApi;
  }
}
