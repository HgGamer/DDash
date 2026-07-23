import { useCallback, useEffect } from 'react';
import { ActivityBar } from './components/ActivityBar';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { GitClient } from './components/GitClient';
import { SettingsModal } from './components/SettingsModal';
import { NewWorktreeModal } from './components/NewWorktreeModal';
import { StatusBar } from './components/StatusBar';
import { UpdateBanner } from './components/UpdateBanner';
import { ToastHost, toast } from './components/Toast';
import { useStore } from './store';
import { agentKey, compositeKey } from '@shared/ipc';
import type { ActiveSelection, ClaudeUsageSummary, ClaudePlanUsage } from '@shared/types';

export function App() {
  const {
    projects,
    activeId,
    setProjects,
    setFolders,
    setClaudeUsage,
    setClaudePlanUsage,
    setActive,
    upsertTab,
    clearTab,
    clearProjectAndWorktrees,
    setTerminalStyle,
    setNotifications,
    setGitView,
    setDocsView,
    setIntegratedTerminal,
    setWebAccess,
    setAgents,
    openSettings,
    closeSettings,
    settingsModalOpen,
    sidebarOpen,
    sidebarView,
    newWorktreeProjectId,
    openNewWorktree,
    closeNewWorktree,
  } = useStore();

  const hasUnsaved = useStore((s) => Object.keys(s.dirtyFiles).length > 0);
  useEffect(() => {
    window.api.app.setUnsaved(hasUnsaved);
  }, [hasUnsaved]);

  const newWorktreeFor = newWorktreeProjectId
    ? projects.find((p) => p.id === newWorktreeProjectId) ?? null
    : null;

  const refreshProjects = useCallback(async () => {
    const [list, folders] = await Promise.all([
      window.api.projects.list(),
      window.api.folders.list(),
    ]);
    setProjects(list);
    setFolders(folders);
    return list;
  }, [setProjects, setFolders]);

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

  useEffect(() => {
    void (async () => {
      const current = await window.api.settings.getDocsView();
      setDocsView(current);
    })();
    const off = window.api.settings.onDocsViewChanged((s) => setDocsView(s));
    return () => off();
  }, [setDocsView]);

  useEffect(() => {
    void (async () => {
      const current = await window.api.settings.getIntegratedTerminal();
      setIntegratedTerminal(current);
    })();
    const off = window.api.settings.onIntegratedTerminalChanged((s) => setIntegratedTerminal(s));
    return () => off();
  }, [setIntegratedTerminal]);

  useEffect(() => {
    void (async () => {
      const current = await window.api.settings.getWebAccess();
      setWebAccess(current);
    })();
    const off = window.api.settings.onWebAccessChanged((s) => setWebAccess(s));
    return () => off();
  }, [setWebAccess]);

  useEffect(() => {
    let cancelled = false;

    const refreshAgentsAndUsage = async () => {
      const current = (await window.api.settings.getAgents()) as Awaited<
        ReturnType<typeof window.api.settings.getAgents>
      > & {
        claudeUsage?: ClaudeUsageSummary;
        claudePlanUsage?: ClaudePlanUsage;
      };
      if (cancelled) return;
      setAgents(current.agents);
      setClaudeUsage(current.claudeUsage ?? null);
      setClaudePlanUsage(current.claudePlanUsage ?? null);
    };

    void refreshAgentsAndUsage();
    const timer = window.setInterval(() => {
      void refreshAgentsAndUsage();
    }, 60_000);
    const off = window.api.settings.onAgentsChanged((s) => setAgents(s.agents));
    return () => {
      cancelled = true;
      off();
      window.clearInterval(timer);
    };
  }, [setAgents, setClaudeUsage, setClaudePlanUsage]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;
      if (!modifier || e.key !== '`') return;
      e.preventDefault();
      const cur = useStore.getState().integratedTerminal;
      if (!cur.enabled) return;
      if (e.shiftKey) {
        // New tab in the active selection; also expand if collapsed.
        const active = useStore.getState().activeId;
        if (!active) return;
        void window.api.settings.setIntegratedTerminal({ expanded: true });
        const tabId = crypto.randomUUID();
        void window.api.shell
          .open({
            projectId: active.projectId,
            worktreeId: active.worktreeId,
            tabId,
            cols: 80,
            rows: 24,
          })
          .then((r) => {
            if (r.ok) {
              const selectionKey = compositeKey(active.projectId, active.worktreeId);
              useStore.getState().addShellTab(selectionKey, r.tab);
            }
          });
      } else {
        void window.api.settings.setIntegratedTerminal({ expanded: !cur.expanded });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // PTY events.
  useEffect(() => {
    const offData = window.api.pty.onData(() => {
      // xterm components handle their own data; nothing to do here.
    });
    const offExit = window.api.pty.onExit(({ projectId, worktreeId, agentId, exitCode }) => {
      upsertTab(agentKey(projectId, worktreeId ?? null, agentId), { status: 'exited', exitCode });
    });
    const offErr = window.api.pty.onError(({ projectId, worktreeId, agentId, error }) => {
      upsertTab(agentKey(projectId, worktreeId ?? null, agentId), { status: 'exited', error });
    });
    // Reliable state from Claude Code hooks (main → renderer). Mirrors the
    // bell/regex heuristic in TerminalPane but driven by real hook events.
    const offHook = window.api.claude.onHookState(({ projectId, worktreeId, projectName, state }) => {
      const key = compositeKey(projectId, worktreeId ?? null);
      const st = useStore.getState();
      if (state === 'busy') {
        if (st.tabs[key]?.needsAttention) {
          st.upsertTab(key, { needsAttention: false });
          window.api.notify.attentionClear(key);
        }
        return;
      }
      // 'done' or 'input' → flag the tab. Skip the sidebar dot only for the tab
      // you're actively looking at (active tab + focused window); otherwise show
      // it. The dock badge / OS notification is gated on window focus in main, so
      // always report — that's what drives the "N Claudes need you" badge.
      const cur = st.activeId;
      const isActiveTab =
        !!cur && cur.projectId === projectId && (cur.worktreeId ?? null) === (worktreeId ?? null);
      if (!(isActiveTab && document.hasFocus())) {
        st.upsertTab(key, { needsAttention: true });
      }
      window.api.notify.attention({
        projectId,
        worktreeId,
        projectName,
        kind: state === 'done' ? 'done' : 'input',
      });
    });
    return () => {
      offData();
      offExit();
      offErr();
      offHook();
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
      <UpdateBanner />
      <div className="app-body">
        <ActivityBar />
        <div className="app-main">
          {sidebarOpen && sidebarView !== 'git' && sidebarView !== 'board' && (
            <Sidebar
              activeId={activeId}
              onActivate={activate}
              onAddProject={addProject}
              onRefresh={refreshProjects}
              onNewWorktree={(projectId) => openNewWorktree(projectId)}
            />
          )}
          {/* Workspace stays mounted under the git overlay so PTY/xterm state
              survives a trip through Source Control. */}
          <Workspace activeId={activeId} />
          {sidebarOpen && sidebarView === 'git' && (
            <GitClient active={activeId} isWorktreeTab={!!activeId?.worktreeId} />
          )}
        </div>
      </div>
      <StatusBar />
      <ToastHost />
      {settingsModalOpen && <SettingsModal onClose={closeSettings} />}
      {newWorktreeFor && (
        <NewWorktreeModal
          projectId={newWorktreeFor.id}
          projectPath={newWorktreeFor.path}
          worktreesRoot={newWorktreeFor.worktreesRoot}
          recentBranches={newWorktreeFor.recentBranches}
          existingWorktreeBranches={newWorktreeFor.worktrees.map((w) => w.branch)}
          onClose={closeNewWorktree}
          onCreated={(wt) => {
            const projectId = newWorktreeFor.id;
            closeNewWorktree();
            void (async () => {
              await refreshProjects();
              await activate({ projectId, worktreeId: wt.id });
              toast({
                message: 'Workspace created',
                tone: 'success',
                action: { label: 'New workspace', onClick: () => openNewWorktree(projectId) },
              });
            })();
          }}
        />
      )}
    </div>
  );
}
