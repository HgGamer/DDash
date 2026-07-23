import { useEffect, useRef, useState } from 'react';
import type { ActiveSelection } from '@shared/types';
import { compositeKey, parseCompositeKey } from '@shared/ipc';
import { useStore } from '../store';
import { TerminalPane } from './TerminalPane';
import { FileView } from './MarkdownViewer';
import { IntegratedTerminalDock, useWorkspaceHeight } from './IntegratedTerminalDock';
import { useShellTabs } from '../hooks/useShellTabs';

interface Props {
  activeId: ActiveSelection | null;
}

export function Workspace({ activeId }: Props) {
  const mountedKeys = useStore((s) => s.mountedKeys);
  const projects = useStore((s) => s.projects);
  const integratedTerminal = useStore((s) => s.integratedTerminal);
  const activeDocByKey = useStore((s) => s.activeDocByKey);
  const agents = useStore((s) => s.agents);
  const openAgentsByKey = useStore((s) => s.openAgentsByKey);
  const activeAgentByKey = useStore((s) => s.activeAgentByKey);
  const sidebarView = useStore((s) => s.sidebarView);
  const board = useStore((s) => s.board);
  const boardSizes = useStore((s) => s.boardSizes);
  const boardLayout = useStore((s) => s.boardLayout);
  const boardColumns = useStore((s) => s.boardColumns);
  const ensureMounted = useStore((s) => s.ensureMounted);
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceHeight = useWorkspaceHeight(workspaceRef);

  const boardMode = sidebarView === 'board';

  // Restored-from-localStorage board keys must be mounted so their pane renders.
  useEffect(() => {
    for (const k of board) ensureMounted(k);
  }, [board, ensureMounted]);

  const showIntegratedTerminal =
    !boardMode && integratedTerminal.enabled && integratedTerminal.expanded && !!activeId;
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

  // In board mode, render pinned panes in board order (drag-reorder); others
  // trail behind (hidden). Keyed by `key`, so reordering moves DOM nodes
  // without remounting the terminals.
  const ordered = boardMode
    ? [...resolved].sort((a, b) => {
        const ia = board.indexOf(a.key);
        const ib = board.indexOf(b.key);
        return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
      })
    : resolved;

  const tileMode = boardMode && boardLayout === 'tile';
  const pinnedCount = boardMode ? ordered.filter((r) => board.includes(r.key)).length : 0;
  const tileCols = boardColumns > 0 ? boardColumns : Math.max(1, Math.ceil(Math.sqrt(pinnedCount)));

  const activeKey = activeId ? compositeKey(activeId.projectId, activeId.worktreeId) : null;
  const activeDocRel = activeKey ? activeDocByKey[activeKey] ?? null : null;
  const activeProjectRoot = activeId
    ? projects.find((p) => p.id === activeId.projectId)?.path ?? ''
    : '';

  if (!boardMode && !activeKey && resolved.length === 0) {
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
        {boardMode && <BoardToolbar />}
        {!boardMode && activeId && <WorkspaceContentTabs activeId={activeId} />}
        {boardMode && board.filter((k) => resolved.some((r) => r.key === k)).length === 0 && (
          <div className="empty-state">
            <div>
              <h2 style={{ marginTop: 0 }}>Board is empty</h2>
              <p>Use “Add window” above to pin terminals from any project here.</p>
            </div>
          </div>
        )}
        <div
          className={`workspace-terminals${
            boardMode ? ` board-grid ${tileMode ? 'board-tile' : 'board-free'}` : ''
          }`}
          style={tileMode ? ({ ['--board-cols' as string]: tileCols } as React.CSSProperties) : undefined}
        >
          {ordered.map(({ key, proj, worktree }) => {
            const active = key === activeKey;
            const inBoard = board.includes(key);
            const activeAgent = activeAgentByKey[key] ?? null;
            const openAgents = openAgentsByKey[key] ?? [];
            const displayName = worktree ? `${proj.name} · ${worktree.branch}` : proj.name;
            const size = boardSizes[key];
            // Board: pinned panes become visible resizable tiles; others stay
            // mounted but out of flow. Normal: one absolute stacked pane visible.
            const wrapperStyle: React.CSSProperties = boardMode
              ? inBoard
                ? {
                    display: 'flex',
                    flexDirection: 'column',
                    // Manual size applies only in free layout; tile fills its track.
                    ...(!tileMode && size ? { width: size.w, height: size.h } : {}),
                  }
                : { display: 'none' }
              : { position: 'absolute', inset: 0, pointerEvents: 'none' };
            const claudeVisible = boardMode ? inBoard : active && !activeAgent;
            const claudeStyle: React.CSSProperties = boardMode
              ? { position: 'relative', flex: 1, minHeight: 0 }
              : {
                  position: 'absolute',
                  inset: 0,
                  visibility: claudeVisible ? 'visible' : 'hidden',
                  pointerEvents: claudeVisible ? 'auto' : 'none',
                };
            return (
              // pointerEvents: 'none' so inactive projects' wrappers (stacked later in
              // DOM order) don't swallow clicks meant for the active terminal below;
              // the active child pane re-enables pointer events itself.
              <div
                key={key}
                className={boardMode && inBoard ? 'board-cell' : undefined}
                style={wrapperStyle}
                onDragOver={
                  boardMode && inBoard
                    ? (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }
                    : undefined
                }
                onDrop={
                  boardMode && inBoard
                    ? (e) => {
                        e.preventDefault();
                        const from = e.dataTransfer.getData('text/plain');
                        if (from) useStore.getState().reorderBoard(from, key);
                      }
                    : undefined
                }
                onMouseUp={
                  boardMode && inBoard && !tileMode
                    ? (e) => {
                        // CSS `resize` writes the tile's live size; persist it.
                        const el = e.currentTarget;
                        useStore.getState().setBoardSize(key, el.offsetWidth, el.offsetHeight);
                      }
                    : undefined
                }
              >
                <div
                  className="board-cell-head"
                  style={{ display: boardMode && inBoard ? 'flex' : 'none' }}
                  draggable={boardMode && inBoard}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', key);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <button
                    type="button"
                    className="board-cell-title"
                    title={`Open ${displayName}`}
                    onClick={() => {
                      useStore.getState().setActive({
                        projectId: proj.id,
                        worktreeId: worktree?.id ?? null,
                      });
                      useStore.getState().selectSidebarView('projects');
                    }}
                  >
                    {displayName}
                  </button>
                  <button
                    type="button"
                    className="board-cell-unpin"
                    aria-label={`Remove ${displayName} from board`}
                    title="Remove from board"
                    onClick={() => useStore.getState().toggleBoard(key)}
                  >
                    ✕
                  </button>
                </div>
                <div style={claudeStyle}>
                  <TerminalPane project={proj} worktree={worktree} active={claudeVisible} />
                </div>
                {openAgents.map((agentId) => {
                  const def = agents.find((a) => a.id === agentId);
                  if (!def) return null;
                  const agentActive = !boardMode && active && activeAgent === agentId;
                  return (
                    <div
                      key={`${key}::${agentId}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        visibility: agentActive ? 'visible' : 'hidden',
                        pointerEvents: agentActive ? 'auto' : 'none',
                      }}
                    >
                      <TerminalPane
                        project={proj}
                        worktree={worktree}
                        active={agentActive}
                        agentId={agentId}
                        agentLabel={def.name}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
          {!boardMode && activeDocRel && activeId && (
            <div className="workspace-doc-overlay">
              <FileView
                key={`${activeKey}:${activeDocRel}`}
                projectId={activeId.projectId}
                projectRoot={activeProjectRoot}
                relPath={activeDocRel}
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
    </main>
  );
}

function BoardToolbar() {
  const projects = useStore((s) => s.projects);
  const board = useStore((s) => s.board);
  const tabs = useStore((s) => s.tabs);
  const toggleBoard = useStore((s) => s.toggleBoard);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Flatten every project + worktree into pinnable selections.
  const selections: { key: string; label: string }[] = [];
  for (const p of projects) {
    selections.push({ key: compositeKey(p.id, null), label: p.name });
    for (const w of p.worktrees) {
      selections.push({ key: compositeKey(p.id, w.id), label: `${p.name} · ${w.branch}` });
    }
  }

  return (
    <header className="ws-header board-toolbar">
      <div className="board-toolbar-title">Board</div>
      <div className="ws-agent-launcher" ref={ref}>
        <button
          type="button"
          className="ws-tab ws-tab-add"
          aria-label="Add a window to the board"
          title="Add a window"
          onClick={() => setOpen((v) => !v)}
        >
          + Add window
        </button>
        {open && (
          <div className="ws-agent-menu" role="menu">
            {selections.length === 0 ? (
              <div className="ws-agent-menu-item ws-agent-menu-empty">No projects yet</div>
            ) : (
              selections.map((s) => {
                const status = tabs[s.key]?.status;
                // Dot: green = running window, red = closed/exited, gray = not started.
                const dotClass =
                  status === 'running'
                    ? 'board-dot board-dot-running'
                    : status === 'exited'
                      ? 'board-dot board-dot-exited'
                      : 'board-dot';
                return (
                  <button
                    key={s.key}
                    type="button"
                    className="ws-agent-menu-item"
                    onClick={() => toggleBoard(s.key)}
                  >
                    <span className={dotClass} aria-hidden="true" />
                    <span className="ws-agent-menu-name">{s.label}</span>
                    {board.includes(s.key) && <span className="ws-agent-menu-hint">on board</span>}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function WorkspaceContentTabs({ activeId }: { activeId: ActiveSelection }) {
  const docTabsByKey = useStore((s) => s.docTabs);
  const activeDocByKey = useStore((s) => s.activeDocByKey);
  const closeDoc = useStore((s) => s.closeDoc);
  const setActiveDoc = useStore((s) => s.setActiveDoc);
  const agents = useStore((s) => s.agents);
  const openAgentsByKey = useStore((s) => s.openAgentsByKey);
  const activeAgentByKey = useStore((s) => s.activeAgentByKey);
  const openAgent = useStore((s) => s.openAgent);
  const closeAgent = useStore((s) => s.closeAgent);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const dirtyFiles = useStore((s) => s.dirtyFiles);

  const key = compositeKey(activeId.projectId, activeId.worktreeId);
  const docTabs = docTabsByKey[key] ?? [];
  const activeDoc = activeDocByKey[key] ?? null;
  const openAgents = openAgentsByKey[key] ?? [];
  const activeAgent = activeAgentByKey[key] ?? null;

  const basename = (p: string) => p.split('/').pop() ?? p;
  const claudeActive = activeDoc === null && activeAgent === null;

  return (
    <header className="ws-header">
      <div className="ws-tabs">
        <button
          type="button"
          className={`ws-tab ${claudeActive ? 'active' : ''}`}
          onClick={() => setActiveDoc(key, null)}
        >
          Claude Code
        </button>
        {openAgents.map((agentId) => {
          const def = agents.find((a) => a.id === agentId);
          if (!def) return null;
          return (
            <span
              key={agentId}
              className={`ws-tab ws-tab-doc ${activeAgent === agentId ? 'active' : ''}`}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  closeAgent(key, agentId);
                }
              }}
            >
              <button
                type="button"
                className="ws-tab-label"
                title={def.command}
                onClick={() => setActiveAgent(key, agentId)}
              >
                {def.name}
              </button>
              <button
                type="button"
                className="ws-tab-close"
                aria-label={`Close ${def.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeAgent(key, agentId);
                }}
              >
                ✕
              </button>
            </span>
          );
        })}
        {docTabs.map((relPath) => {
          const isDirty = !!dirtyFiles[`${activeId.projectId}::${relPath}`];
          return (
            <span
              key={relPath}
              className={`ws-tab ws-tab-doc ${activeDoc === relPath ? 'active' : ''} ${isDirty ? 'dirty' : ''}`}
              onAuxClick={(e) => {
                // Middle-click closes the tab.
                if (e.button === 1) {
                  e.preventDefault();
                  closeDoc(key, relPath);
                }
              }}
            >
              <button
                type="button"
                className="ws-tab-label"
                title={relPath}
                onClick={() => setActiveDoc(key, relPath)}
              >
                {basename(relPath)}
              </button>
              {isDirty && <span className="ws-tab-dot" aria-hidden="true" />}
              <button
                type="button"
                className="ws-tab-close"
                aria-label={`Close ${basename(relPath)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeDoc(key, relPath);
                }}
              >
                ✕
              </button>
            </span>
          );
        })}
      </div>
      <div className="ws-header-actions">
        <AgentLauncher
          agents={agents}
          openAgentIds={openAgents}
          onOpen={(agentId) => openAgent(key, agentId)}
        />
      </div>
    </header>
  );
}

function AgentLauncher({
  agents,
  openAgentIds,
  onOpen,
}: {
  agents: { id: string; name: string; command: string }[];
  openAgentIds: string[];
  onOpen: (agentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openSettings = useStore((s) => s.openSettings);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="ws-agent-launcher" ref={ref}>
      <button
        type="button"
        className="ws-tab ws-tab-add"
        aria-label="Open an agent"
        title="Open an agent"
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      {open && (
        <div className="ws-agent-menu" role="menu">
          {agents.length === 0 ? (
            <button
              type="button"
              className="ws-agent-menu-item ws-agent-menu-empty"
              onClick={() => {
                setOpen(false);
                openSettings('agents');
              }}
            >
              No agents configured — add one in Settings…
            </button>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                type="button"
                className="ws-agent-menu-item"
                title={a.command}
                onClick={() => {
                  setOpen(false);
                  onOpen(a.id);
                }}
              >
                <span className="ws-agent-menu-name">{a.name}</span>
                {openAgentIds.includes(a.id) && <span className="ws-agent-menu-hint">open</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
