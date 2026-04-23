import { useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { TerminalStyleSettingsModal } from './components/TerminalStyleSettings';
import { useStore } from './store';

export function App() {
  const {
    projects,
    activeId,
    setProjects,
    setActive,
    upsertTab,
    clearTab,
    setTerminalStyle,
    setTerminalStyleModalOpen,
    terminalStyleModalOpen,
  } = useStore();

  const refreshProjects = useCallback(async () => {
    const list = await window.api.projects.list();
    setProjects(list);
    return list;
  }, [setProjects]);

  const activate = useCallback(
    async (id: string | null) => {
      setActive(id);
      await window.api.projects.setActive(id);
    },
    [setActive],
  );

  const addProject = useCallback(async () => {
    const pick = await window.api.projects.pickDirectory();
    if (!pick.path) return;
    const proj = await window.api.projects.add({ path: pick.path });
    const list = await refreshProjects();
    if (proj) {
      const existing = list.find((p) => p.id === proj.id);
      if (existing) await activate(existing.id);
    }
  }, [refreshProjects, activate]);

  // Initial load + restore last-active.
  useEffect(() => {
    void (async () => {
      const list = await refreshProjects();
      // Read last-active from the main process indirectly: main already
      // persists it; we simply pick the most recently opened project as a
      // fallback when available.
      const lastActive = list
        .filter((p) => p.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))[0];
      if (lastActive) setActive(lastActive.id);
    })();
  }, [refreshProjects, setActive]);

  // Block the renderer's default "navigate to dropped file" behavior. The
  // TerminalPane attaches its own drop handler that calls preventDefault;
  // this is the safety net for drops anywhere else in the window.
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  // Terminal style: hydrate from persisted settings and subscribe to changes.
  useEffect(() => {
    void (async () => {
      const current = await window.api.settings.getTerminalStyle();
      setTerminalStyle(current);
    })();
    const off = window.api.settings.onTerminalStyleChanged((s) => {
      setTerminalStyle(s);
    });
    return () => off();
  }, [setTerminalStyle]);

  // PTY events.
  useEffect(() => {
    const offData = window.api.pty.onData(() => {
      // xterm components handle their own data; nothing to do here.
    });
    const offExit = window.api.pty.onExit(({ projectId, exitCode }) => {
      upsertTab(projectId, { status: 'exited', exitCode });
    });
    const offErr = window.api.pty.onError(({ projectId, error }) => {
      upsertTab(projectId, { status: 'exited', error });
    });
    return () => {
      offData();
      offExit();
      offErr();
    };
  }, [upsertTab]);

  // Menu shortcuts.
  useEffect(() => {
    const offs = [
      window.api.menu.onAddProject(() => void addProject()),
      window.api.menu.onRemoveActive(() =>
        (async () => {
          if (!activeId) return;
          await window.api.projects.remove(activeId);
          clearTab(activeId);
          const list = await refreshProjects();
          const next = list[0]?.id ?? null;
          await activate(next);
        })(),
      ),
      window.api.menu.onNextTab(() => cycleTab(1)),
      window.api.menu.onPrevTab(() => cycleTab(-1)),
      window.api.menu.onActivateIndex((i) => {
        const list = useStore.getState().projects;
        const target = list[i];
        if (target) void activate(target.id);
      }),
      window.api.menu.onOpenTerminalStyle(() => setTerminalStyleModalOpen(true)),
    ];
    return () => offs.forEach((o) => o());

    function cycleTab(delta: number) {
      const list = useStore.getState().projects;
      if (list.length === 0) return;
      const currentIndex = list.findIndex((p) => p.id === useStore.getState().activeId);
      const nextIndex = (currentIndex + delta + list.length) % list.length;
      void activate(list[nextIndex].id);
    }
  }, [addProject, activeId, activate, clearTab, refreshProjects, setTerminalStyleModalOpen]);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  return (
    <div className="app">
      <Sidebar
        activeId={activeId}
        onActivate={activate}
        onAddProject={addProject}
        onRefresh={refreshProjects}
      />
      <Workspace project={activeProject} />
      {terminalStyleModalOpen && (
        <TerminalStyleSettingsModal onClose={() => setTerminalStyleModalOpen(false)} />
      )}
    </div>
  );
}
