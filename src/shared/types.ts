export interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  lastOpenedAt: string | null;
  order: number;
}

export interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

export interface AppState {
  version: 1;
  projects: Project[];
  lastActiveProjectId: string | null;
  window: WindowState;
}

export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 800,
  x: null,
  y: null,
  maximized: false,
};

export const DEFAULT_APP_STATE: AppState = {
  version: 1,
  projects: [],
  lastActiveProjectId: null,
  window: DEFAULT_WINDOW_STATE,
};

export type PtySessionStatus = 'not-started' | 'running' | 'exited';

export type PtySpawnError =
  | { kind: 'path-missing'; path: string }
  | { kind: 'claude-not-found'; installUrl: string };

export interface PtySpawnResult {
  ok: boolean;
  error?: PtySpawnError;
}
