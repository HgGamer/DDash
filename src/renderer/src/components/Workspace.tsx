import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveSelection } from '@shared/types';
import {
  GIT_VIEW_MAX_WIDTH,
  GIT_VIEW_MIN_WIDTH,
  TODO_VIEW_MAX_WIDTH,
  TODO_VIEW_MIN_WIDTH,
} from '@shared/types';
import { compositeKey, parseCompositeKey } from '@shared/ipc';
import { useStore } from '../store';
import { TerminalPane } from './TerminalPane';
import { CommitView, DiffView, GitView, StashView } from './GitView';
import { TodoView } from './TodoView';
import { IntegratedTerminalDock, useWorkspaceHeight } from './IntegratedTerminalDock';
import { useShellTabs } from '../hooks/useShellTabs';

interface Props {
  activeId: ActiveSelection | null;
}

export function Workspace({ activeId }: Props) {
  const mountedKeys = useStore((s) => s.mountedKeys);
  const projects = useStore((s) => s.projects);
  const gitViewSettings = useStore((s) => s.gitView);
  const todoViewSettings = useStore((s) => s.todoView);
  const integratedTerminal = useStore((s) => s.integratedTerminal);
  const gitDiff = useStore((s) => s.gitDiff);
  const closeDiff = useStore((s) => s.closeDiff);
  const gitCommit = useStore((s) => s.gitCommit);
  const closeCommit = useStore((s) => s.closeCommit);
  const gitStash = useStore((s) => s.gitStash);
  const closeStash = useStore((s) => s.closeStash);
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceHeight = useWorkspaceHeight(workspaceRef);

  const showIntegratedTerminal =
    integratedTerminal.enabled && integratedTerminal.expanded && !!activeId;
  useShellTabs(activeId, integratedTerminal.enabled);

  const resolved = mountedKeys
    .map((k) => {
      const { projectId, worktreeId } = parseCompositeKey(k);
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) return null;
      const worktree = worktreeId ? proj.worktrees.find((w) => w.id === worktreeId) ?? null : null;
      if (worktreeId && !worktree) return null;
      return { key: k, proj, worktree };
    })
    .filter((x): x is { key: string; proj: typeof projects[number]; worktree: typeof projects[number]['worktrees'][number] | null } => x !== null);

  const activeKey = activeId ? compositeKey(activeId.projectId, activeId.worktreeId) : null;
  const showGitView = gitViewSettings.enabled && gitViewSettings.expanded;
  const showTodoView = todoViewSettings.expanded;

  if (!activeKey && resolved.length === 0) {
    return (
      <main className="workspace" ref={workspaceRef}>
        <div className="empty-state">
          <div>
            <h2 style={{ marginTop: 0 }}>No project selected</h2>
            <p>Add a project from the sidebar to start a Claude session.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace workspace-split" ref={workspaceRef}>
      <div className="workspace-left">
        <div className="workspace-terminals">
          {resolved.map(({ key, proj, worktree }) => {
            const active = key === activeKey;
            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  inset: 0,
                  visibility: active ? 'visible' : 'hidden',
                  pointerEvents: active ? 'auto' : 'none',
                }}
              >
                <TerminalPane project={proj} worktree={worktree} active={active} />
              </div>
            );
          })}
          {gitDiff && activeId && gitDiff.projectId === activeId.projectId && (
            <div className="workspace-diff-overlay">
              <DiffView
                active={activeId}
                file={{ path: gitDiff.path, stage: gitDiff.stage }}
                onClose={closeDiff}
              />
            </div>
          )}
          {gitCommit && activeId && gitCommit.projectId === activeId.projectId && (
            <div className="workspace-diff-overlay">
              <CommitView active={activeId} commit={gitCommit.hash} onClose={closeCommit} />
            </div>
          )}
          {gitStash && activeId && gitStash.projectId === activeId.projectId && (
            <div className="workspace-diff-overlay">
              <StashView
                active={activeId}
                ref={gitStash.ref}
                sha={gitStash.sha}
                branch={gitStash.branch}
                message={gitStash.message}
                time={gitStash.time}
                onClose={closeStash}
              />
            </div>
          )}
        </div>
        {showIntegratedTerminal && activeId && (
          <IntegratedTerminalDock
            active={activeId}
            height={integratedTerminal.height}
            workspaceHeight={workspaceHeight}
          />
        )}
      </div>
      {showTodoView && (
        <TodoViewDock width={todoViewSettings.panelWidth} active={activeId} />
      )}
      {showGitView && (
        <GitViewDock
          width={gitViewSettings.panelWidth}
          active={activeId}
          isWorktreeTab={!!activeId?.worktreeId}
        />
      )}
    </main>
  );
}

function TodoViewDock({
  width,
  active,
}: {
  width: number;
  active: ActiveSelection | null;
}) {
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [liveWidth, setLiveWidth] = useState(width);

  useEffect(() => {
    setLiveWidth(width);
  }, [width]);

  const liveWidthRef = useRef(liveWidth);
  useEffect(() => {
    liveWidthRef.current = liveWidth;
  }, [liveWidth]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: liveWidth };
      const onMove = (ev: MouseEvent) => {
        const s = dragStateRef.current;
        if (!s) return;
        const delta = s.startX - ev.clientX;
        const next = clamp(s.startWidth + delta, TODO_VIEW_MIN_WIDTH, TODO_VIEW_MAX_WIDTH);
        setLiveWidth(next);
      };
      const onUp = () => {
        const s = dragStateRef.current;
        dragStateRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (s) {
          void window.api.settings.setTodoView({ panelWidth: liveWidthRef.current });
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [liveWidth],
  );

  return (
    <div className="todo-view-dock" style={{ width: liveWidth }}>
      <div
        className="todo-view-resize-handle"
        onMouseDown={onMouseDown}
        title="Drag to resize"
      />
      <TodoView active={active} />
    </div>
  );
}

function GitViewDock({
  width,
  active,
  isWorktreeTab,
}: {
  width: number;
  active: ActiveSelection | null;
  isWorktreeTab: boolean;
}) {
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [liveWidth, setLiveWidth] = useState(width);

  useEffect(() => {
    setLiveWidth(width);
  }, [width]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startWidth: liveWidth };
    const onMove = (ev: MouseEvent) => {
      const s = dragStateRef.current;
      if (!s) return;
      const delta = s.startX - ev.clientX; // dragging left grows the panel
      const next = clamp(s.startWidth + delta, GIT_VIEW_MIN_WIDTH, GIT_VIEW_MAX_WIDTH);
      setLiveWidth(next);
    };
    const onUp = () => {
      const s = dragStateRef.current;
      dragStateRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (s) {
        // Persist the final width.
        void window.api.settings.setGitView({ panelWidth: liveWidthRef.current });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [liveWidth]);

  // Track liveWidth in a ref so the mouseup handler reads the latest value.
  const liveWidthRef = useRef(liveWidth);
  useEffect(() => {
    liveWidthRef.current = liveWidth;
  }, [liveWidth]);

  return (
    <div className="git-view-dock" style={{ width: liveWidth }}>
      <div
        className="git-view-resize-handle"
        onMouseDown={onMouseDown}
        title="Drag to resize"
      />
      <GitView active={active} isWorktreeTab={isWorktreeTab} />
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
