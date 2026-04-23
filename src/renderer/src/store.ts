import { create } from 'zustand';
import type {
  Project,
  PtySessionStatus,
  PtySpawnError,
  TerminalStyleSettings,
} from '@shared/types';

export interface TabState {
  status: PtySessionStatus;
  error?: PtySpawnError;
  exitCode?: number | null;
  /** Set when the PTY rings the terminal bell (BEL) while the tab is not
   * active — typically Claude asking for a permission/confirmation. Cleared
   * when the tab becomes active. */
  needsAttention?: boolean;
}

interface AppStore {
  projects: Project[];
  activeId: string | null;
  /** IDs of projects whose terminal pane has been mounted this session. */
  mountedIds: string[];
  tabs: Record<string, TabState>;
  loaded: boolean;
  terminalStyle: TerminalStyleSettings;
  terminalStyleModalOpen: boolean;

  setProjects: (projects: Project[]) => void;
  setActive: (id: string | null) => void;
  ensureMounted: (id: string) => void;
  upsertTab: (id: string, patch: Partial<TabState>) => void;
  clearTab: (id: string) => void;
  setTerminalStyle: (s: TerminalStyleSettings) => void;
  setTerminalStyleModalOpen: (open: boolean) => void;
}

export const useStore = create<AppStore>((set) => ({
  projects: [],
  activeId: null,
  mountedIds: [],
  tabs: {},
  loaded: false,
  terminalStyle: { version: 1, preset: 'dash-dark' },
  terminalStyleModalOpen: false,

  setProjects: (projects) => set({ projects, loaded: true }),
  setActive: (id) =>
    set((s) => {
      let tabs = s.tabs;
      if (id && s.tabs[id]?.needsAttention) {
        tabs = { ...s.tabs, [id]: { ...s.tabs[id], needsAttention: false } };
        window.api.notify.attentionClear(id);
      }
      return {
        activeId: id,
        mountedIds: id && !s.mountedIds.includes(id) ? [...s.mountedIds, id] : s.mountedIds,
        tabs,
      };
    }),
  ensureMounted: (id) =>
    set((s) => ({
      mountedIds: s.mountedIds.includes(id) ? s.mountedIds : [...s.mountedIds, id],
    })),
  upsertTab: (id, patch) =>
    set((s) => {
      const prev: TabState = s.tabs[id] ?? { status: 'not-started' };
      return { tabs: { ...s.tabs, [id]: { ...prev, ...patch } } };
    }),
  clearTab: (id) =>
    set((s) => {
      if (s.tabs[id]?.needsAttention) window.api.notify.attentionClear(id);
      const { [id]: _omit, ...rest } = s.tabs;
      return { tabs: rest, mountedIds: s.mountedIds.filter((m) => m !== id) };
    }),
  setTerminalStyle: (s) => set({ terminalStyle: s }),
  setTerminalStyleModalOpen: (open) => set({ terminalStyleModalOpen: open }),
}));
