import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { SettingsModal } from './components/SettingsModal';
import { NewWorktreeModal } from './components/NewWorktreeModal';
import { StatusBar } from './components/StatusBar';
import { useStore } from './store';
import { compositeKey } from '@shared/ipc';
import type { ActiveSelection, Project } from '@shared/types';

export function App() {
  const {
    projects,
    activeId,
    setProjects,
    setActive,
    upsertTab,
    clearTab,
    clearProjectAndWorktrees,
    setTerminalStyle,
    setNotifications,
    setGitView,
    openSettings,
    closeSettings,
    settingsModalOpen,
  } = useStore();

  const [newWorktreeFor, setNewWorktreeFor] = useState<Project | null>(null);

  const refreshProjects = useCallback(async () => {
    const list = await window.api.projects.list();
    setProjects(list);
    return list;
  }, [setProjects]);

  const activate = useCallback(
    async (active: ActiveSelection | null) => {
      setActive(active);
      await window.api.projects.setActive(active);
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
      if (existing) await activate({ projectId: existing.id, worktreeId: null });
    }
  }, [refreshProjects, activate]);

  // Initial load + restore last-active + reconcile worktrees.
  useEffect(() => {
    void (async () => {
      const list = await refreshProjects();
      // Reconcile each project's worktrees so missing-on-disk ones are flagged.
      for (const p of list) {
        if (p.worktrees.length === 0) continue;
        await window.api.worktrees.reconcile(p.id);
      }
      // Re-pull projects so reconcile-marked statuses propagate.
      await refreshProjects();
      const lastActive = list
        .filter((p) => p.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))[0];
      if (lastActive) setActive({ projectId: lastActive.id, worktreeId: null });
    })();
  }, [refreshProjects, setActive]);

  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

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

  useEffect(() => {
    void (async () => {
      const current = await window.api.settings.getNotifications();
      setNotifications(current);
    })();
    const off = window.api.settings.onNotificationsChanged((s) => setNotifications(s));
    return () => off();
  }, [setNotifications]);

  useEffect(() => {
    void (async () => {
      const current = await window.api.settings.getGitView();
      setGitView(current);
    })();
    const off = window.api.settings.onGitViewChanged((s) => setGitView(s));
    return () => off();
  }, [setGitView]);

  // PTY events.
  useEffect(() => {
    const offData = window.api.pty.onData(() => {
      // xterm components handle their own data; nothing to do here.
    });
    const offExit = window.api.pty.onExit(({ projectId, worktreeId, exitCode }) => {
      upsertTab(compositeKey(projectId, worktreeId ?? null), { status: 'exited', exitCode });
    });
    const offErr = window.api.pty.onError(({ projectId, worktreeId, error }) => {
      upsertTab(compositeKey(projectId, worktreeId ?? null), { status: 'exited', error });
    });
    return () => {
      offData();
      offExit();
      offErr();
    };
  }, [upsertTab]);

  // Build a flat list of selectable tabs (projects + their worktrees) for cycling.
  const flatTabs = useCallback((): ActiveSelection[] => {
    const out: ActiveSelection[] = [];
    for (const p of useStore.getState().projects) {
      out.push({ projectId: p.id, worktreeId: null });
      for (const w of p.worktrees) out.push({ projectId: p.id, worktreeId: w.id });
    }
    return out;
  }, []);

  // Menu shortcuts.
  useEffect(() => {
    const offs = [
      window.api.menu.onAddProject(() => void addProject()),
      window.api.menu.onRemoveActive(() =>
        (async () => {
          if (!activeId) return;
          if (activeId.worktreeId) {
            const r = await window.api.worktrees.remove({
              projectId: activeId.projectId,
              worktreeId: activeId.worktreeId,
              force: false,
            });
            if (!r.ok) {
              window.alert(`Failed to remove worktree:\n${r.error}`);
              return;
            }
            clearTab(compositeKey(activeId.projectId, activeId.worktreeId));
          } else {
            const r = await window.api.projects.remove(activeId.projectId);
            if (!r.ok) {
              window.alert(
                'Failed to remove project — some worktrees could not be removed:\n' +
                  r.errors.map((e) => `• ${e.worktreeId}: ${e.message}`).join('\n'),
              );
              await refreshProjects();
              return;
            }
            clearProjectAndWorktrees(activeId.projectId);
          }
          const list = await refreshProjects();
          const next = list[0];
          await activate(next ? { projectId: next.id, worktreeId: null } : null);
        })(),
      ),
      window.api.menu.onNextTab(() => cycleTab(1)),
      window.api.menu.onPrevTab(() => cycleTab(-1)),
      window.api.menu.onActivateIndex((i) => {
        const list = useStore.getState().projects;
        const target = list[i];
        if (target) void activate({ projectId: target.id, worktreeId: null });
      }),
      window.api.menu.onOpenSettings(() => openSettings()),
    ];
    return () => offs.forEach((o) => o());

    function cycleTab(delta: number) {
      const tabs = flatTabs();
      if (tabs.length === 0) return;
      const cur = useStore.getState().activeId;
      const idx = cur
        ? tabs.findIndex(
            (t) => t.projectId === cur.projectId && t.worktreeId === cur.worktreeId,
          )
        : -1;
      const nextIdx = (idx + delta + tabs.length) % tabs.length;
      void activate(tabs[nextIdx]);
    }
  }, [
    addProject,
    activeId,
    activate,
    clearTab,
    clearProjectAndWorktrees,
    refreshProjects,
    openSettings,
    flatTabs,
  ]);

  return (
    <div className="app">
      <div className="app-body">
        <Sidebar
          activeId={activeId}
          onActivate={activate}
          onAddProject={addProject}
          onRefresh={refreshProjects}
          onNewWorktree={(projectId) => {
            const p = projects.find((pp) => pp.id === projectId);
            if (p) setNewWorktreeFor(p);
          }}
        />
        <Workspace activeId={activeId} />
      </div>
      <StatusBar />
      {settingsModalOpen && <SettingsModal onClose={closeSettings} />}
      {newWorktreeFor && (
        <NewWorktreeModal
          projectId={newWorktreeFor.id}
          projectPath={newWorktreeFor.path}
          worktreesRoot={newWorktreeFor.worktreesRoot}
          onClose={() => setNewWorktreeFor(null)}
          onCreated={(wt) => {
            setNewWorktreeFor(null);
            void (async () => {
              await refreshProjects();
              await activate({ projectId: newWorktreeFor.id, worktreeId: wt.id });
            })();
          }}
        />
      )}
    </div>
  );
}
