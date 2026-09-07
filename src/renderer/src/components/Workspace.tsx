import { useEffect, useRef, useState } from 'react';
import type { ActiveSelection } from '@shared/types';
import {
  agentKey,
  compositeKey,
  parseCompositeKey,
  isClaudeAgentId,
  newClaudeAgentId,
} from '@shared/ipc';
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
  const windowLabels = useStore((s) => s.windowLabels);
  const primaryClosed = useStore((s) => s.primaryClosed);
  const ensureMounted = useStore((s) => s.ensureMounted);
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceHeight = useWorkspaceHeight(workspaceRef);

  const boardMode = sidebarView === 'board';

  // Restored-from-localStorage board keys (session keys) must have their
  // selection mounted so the pane renders.
  useEffect(() => {
    for (const k of board) {
      const i = k.indexOf('::agent:');
      ensureMounted(i < 0 ? k : k.slice(0, i));
    }
  }, [board, ensureMounted]);

  // Selections with restored extra Claude windows must be mounted so those
  // windows' panes render (and respawn) after a reload.
  useEffect(() => {
    for (const [k, ids] of Object.entries(openAgentsByKey)) {
      if (ids.length) ensureMounted(k);
    }
  }, [openAgentsByKey, ensureMounted]);

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

  // Flatten every mounted selection into its windows: the primary Claude tab
  // plus each open agent / extra Claude window. Each window is one pane, keyed
  // by session key and rendered at a stable tree position — so switching
  // board↔normal only flips CSS and never remounts a live terminal.
  type PaneVM = {
    sessionKey: string;
    selectionKey: string;
    proj: (typeof projects)[number];
    worktree: (typeof projects)[number]['worktrees'][number] | null;
    agentId: string | null;
    displayName: string;
    windowName: string;
    terminalLabel?: string;
  };
  const panes: PaneVM[] = [];
  for (const { key: selKey, proj, worktree } of resolved) {
    const displayName = worktree ? `${proj.name} · ${worktree.branch}` : proj.name;
    const open = openAgentsByKey[selKey] ?? [];
    const claudeIds = open.filter(isClaudeAgentId);
    if (!primaryClosed[selKey]) {
      panes.push({
        sessionKey: selKey,
        selectionKey: selKey,
        proj,
        worktree,
        agentId: null,
        displayName,
        windowName: windowLabels[selKey] ?? 'Claude Code',
      });
    }
    for (const agentId of open) {
      const isClaude = isClaudeAgentId(agentId);
      const def = isClaude ? null : agents.find((a) => a.id === agentId);
      if (!isClaude && !def) continue;
      const sk = agentKey(proj.id, worktree?.id ?? null, agentId);
      const fallback = isClaude ? `Claude ${claudeIds.indexOf(agentId) + 2}` : def!.name;
      panes.push({
        sessionKey: sk,
        selectionKey: selKey,
        proj,
        worktree,
        agentId,
        displayName,
        windowName: windowLabels[sk] ?? fallback,
        terminalLabel: isClaude ? 'Claude' : def!.name,
      });
    }
  }

  // Board mode renders pinned panes in board order (drag-reorder); the rest stay
  // mounted but out of flow.
  const orderedPanes = boardMode
    ? [...panes].sort((a, b) => {
        const ia = board.indexOf(a.sessionKey);
        const ib = board.indexOf(b.sessionKey);
        return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
      })
    : panes;

  const tileMode = boardMode && boardLayout === 'tile';
  const mainMode = boardMode && boardLayout === 'main';
  // Only 'free' tiles carry a persisted size and a resize handle; the other two
  // layouts divide the workspace between them.
  const freeMode = boardMode && boardLayout === 'free';
  const pinnedCount = boardMode ? panes.filter((p) => board.includes(p.sessionKey)).length : 0;
  const tileCols = boardColumns > 0 ? boardColumns : Math.max(1, Math.ceil(Math.sqrt(pinnedCount)));
  // 'main' layout: the first pinned window (in board order) takes a full-height
  // column, the rest stack in the column beside it. The main cell needs an
  // explicit class — DOM order here also holds the hidden, unpinned panes, so
  // `:first-child` would pick the wrong one.
  const mainKey = mainMode
    ? orderedPanes.find((p) => board.includes(p.sessionKey))?.sessionKey ?? null
    : null;
  const boardGridStyle: React.CSSProperties | undefined = tileMode
    ? ({ ['--board-cols' as string]: tileCols } as React.CSSProperties)
    : mainMode
      ? ({
          // One row per stacked window, and no second column when the main
          // window is the only one pinned.
          ['--board-rows' as string]: Math.max(1, pinnedCount - 1),
          ['--board-main-cols' as string]: pinnedCount > 1 ? '1fr 1fr' : '1fr',
        } as React.CSSProperties)
      : undefined;
  const layoutClass = tileMode ? 'board-tile' : mainMode ? 'board-main' : 'board-free';

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
        {boardMode && !panes.some((p) => board.includes(p.sessionKey)) && (
          <div className="empty-state">
            <div>
              <h2 style={{ marginTop: 0 }}>Board is empty</h2>
              <p>Use “Add window” above to pin terminals from any project here.</p>
            </div>
          </div>
        )}
        <div
          className={`workspace-terminals${boardMode ? ` board-grid ${layoutClass}` : ''}`}
          style={boardGridStyle}
        >
          {orderedPanes.map((pane) => {
            const { sessionKey, selectionKey, proj, worktree, agentId } = pane;
            const inBoard = board.includes(sessionKey);
            const selActive = selectionKey === activeKey;
            const activeAgentForSel = activeAgentByKey[selectionKey] ?? null;
            const isActivePane =
              selActive &&
              (agentId === null ? activeAgentForSel === null : activeAgentForSel === agentId);
            const visible = boardMode ? inBoard : isActivePane;
            const size = boardSizes[sessionKey];
            // Board: pinned windows become visible tiles; others stay mounted but
            // out of flow. Normal: absolute-stacked, only the active pane visible.
            const wrapperStyle: React.CSSProperties = boardMode
              ? inBoard
                ? {
                    display: 'flex',
                    flexDirection: 'column',
                    ...(freeMode && size ? { width: size.w, height: size.h } : {}),
                  }
                : { display: 'none' }
              : {
                  position: 'absolute',
                  inset: 0,
                  visibility: visible ? 'visible' : 'hidden',
                  pointerEvents: visible ? 'auto' : 'none',
                };
            const innerStyle: React.CSSProperties = boardMode
              ? { position: 'relative', flex: 1, minHeight: 0 }
              : { position: 'absolute', inset: 0 };
            return (
              <div
                key={sessionKey}
                className={
                  boardMode && inBoard
                    ? `board-cell${sessionKey === mainKey ? ' board-cell-main' : ''}`
                    : undefined
                }
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
                        if (from) useStore.getState().reorderBoard(from, sessionKey);
                      }
                    : undefined
                }
                onMouseUp={
                  freeMode && inBoard
                    ? (e) => {
                        // CSS `resize` writes the tile's live size; persist it.
                        const el = e.currentTarget;
                        useStore.getState().setBoardSize(sessionKey, el.offsetWidth, el.offsetHeight);
                      }
                    : undefined
                }
              >
                <BoardCellHead
                  sessionKey={sessionKey}
                  windowName={pane.windowName}
                  displayName={pane.displayName}
                  visible={boardMode && inBoard}
                  onOpen={() => {
                    const st = useStore.getState();
                    st.setActive({ projectId: proj.id, worktreeId: worktree?.id ?? null });
                    if (agentId) st.setActiveAgent(selectionKey, agentId);
                    else st.setActiveDoc(selectionKey, null);
                    st.selectSidebarView('projects');
                  }}
                />
                <div style={innerStyle}>
                  <TerminalPane
                    project={proj}
                    worktree={worktree}
                    active={visible}
                    agentId={agentId ?? undefined}
                    agentLabel={pane.terminalLabel}
                  />
                </div>
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

/** A board tile's header: drag handle for reordering, click-to-open title, and
 *  inline rename. Renaming needs its own button because a single click on the
 *  title already leaves the board for the project view, so a double-click
 *  gesture (as in the workspace tab bar) would never be reachable here. */
function BoardCellHead({
  sessionKey,
  windowName,
  displayName,
  visible,
  onOpen,
}: {
  sessionKey: string;
  windowName: string;
  displayName: string;
  visible: boolean;
  onOpen: () => void;
}) {
  const setWindowLabel = useStore((s) => s.setWindowLabel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(windowName);

  const commit = () => {
    // An empty name clears the custom label and restores the default one.
    setWindowLabel(sessionKey, draft);
    setEditing(false);
  };

  return (
    <div
      className="board-cell-head"
      style={{ display: visible ? 'flex' : 'none' }}
      // Suspend the reorder drag while renaming, or the input can't be
      // click-positioned or text-selected.
      draggable={visible && !editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', sessionKey);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      {editing ? (
        <input
          className="board-cell-rename"
          autoFocus
          value={draft}
          placeholder={windowName}
          aria-label={`Rename ${windowName}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') {
              setDraft(windowName);
              setEditing(false);
            }
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className="board-cell-title"
            title={`Open ${displayName} — ${windowName}`}
            onClick={onOpen}
          >
            <span className="board-cell-window">{windowName}</span>
            <span className="board-cell-project">{displayName}</span>
          </button>
          <button
            type="button"
            className="board-cell-edit"
            aria-label={`Rename ${windowName}`}
            title="Rename window"
            onClick={() => {
              setDraft(windowName);
              setEditing(true);
            }}
          >
            ✎
          </button>
        </>
      )}
      <button
        type="button"
        className="board-cell-unpin"
        aria-label={`Remove ${windowName} from board`}
        title="Remove from board"
        onClick={() => useStore.getState().toggleBoard(sessionKey)}
      >
        ✕
      </button>
    </div>
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

/** A workspace tab for a live window (Claude / extra Claude / agent), with
 *  double-click rename (Claude only), pin-to-board, and optional close. */
function WindowTab({
  sessionKey,
  label,
  active,
  isClaude,
  onActivate,
  onClose,
}: {
  sessionKey: string;
  label: string;
  active: boolean;
  isClaude: boolean;
  onActivate: () => void;
  onClose?: () => void;
}) {
  const pinned = useStore((s) => s.board.includes(sessionKey));
  const toggleBoard = useStore((s) => s.toggleBoard);
  const setWindowLabel = useStore((s) => s.setWindowLabel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const commit = () => {
    setWindowLabel(sessionKey, draft);
    setEditing(false);
  };

  return (
    <span
      className={`ws-tab ws-tab-doc ${active ? 'active' : ''}`}
      onAuxClick={
        onClose
          ? (e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose();
              }
            }
          : undefined
      }
    >
      {editing ? (
        <input
          className="ws-tab-rename"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') {
              setDraft(label);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="ws-tab-label"
          title={isClaude ? 'Double-click to rename' : undefined}
          onClick={onActivate}
          onDoubleClick={
            isClaude
              ? () => {
                  setDraft(label);
                  setEditing(true);
                }
              : undefined
          }
        >
          {label}
        </button>
      )}
      <button
        type="button"
        className={`ws-tab-pin ${pinned ? 'pinned' : ''}`}
        aria-label={pinned ? 'Unpin from board' : 'Pin to board'}
        title={pinned ? 'Unpin from board' : 'Pin to board'}
        onClick={(e) => {
          e.stopPropagation();
          toggleBoard(sessionKey);
        }}
      >
        {pinned ? '★' : '☆'}
      </button>
      {onClose && (
        <button
          type="button"
          className="ws-tab-close"
          aria-label={`Close ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ✕
        </button>
      )}
    </span>
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

  const windowLabels = useStore((s) => s.windowLabels);
  const primaryClosed = useStore((s) => s.primaryClosed);
  const closePrimaryWindow = useStore((s) => s.closePrimaryWindow);
  const key = compositeKey(activeId.projectId, activeId.worktreeId);
  const docTabs = docTabsByKey[key] ?? [];
  const activeDoc = activeDocByKey[key] ?? null;
  const openAgents = openAgentsByKey[key] ?? [];
  const activeAgent = activeAgentByKey[key] ?? null;
  const claudeIds = openAgents.filter(isClaudeAgentId);

  const basename = (p: string) => p.split('/').pop() ?? p;
  const claudeActive = activeDoc === null && activeAgent === null;

  return (
    <header className="ws-header">
      <div className="ws-tabs">
        {!primaryClosed[key] && (
          <WindowTab
            sessionKey={key}
            label={windowLabels[key] ?? 'Claude Code'}
            active={claudeActive}
            isClaude
            onActivate={() => setActiveDoc(key, null)}
            // Closable only while another window would be left behind.
            onClose={openAgents.length ? () => closePrimaryWindow(key) : undefined}
          />
        )}
        {openAgents.map((agentId) => {
          const isClaude = isClaudeAgentId(agentId);
          const def = isClaude ? null : agents.find((a) => a.id === agentId);
          if (!isClaude && !def) return null;
          const sk = agentKey(activeId.projectId, activeId.worktreeId, agentId);
          // Extra Claude windows are numbered after the built-in "Claude Code".
          const label = isClaude
            ? windowLabels[sk] ?? `Claude ${claudeIds.indexOf(agentId) + 2}`
            : def!.name;
          return (
            <WindowTab
              key={agentId}
              sessionKey={sk}
              label={label}
              active={activeAgent === agentId}
              isClaude={isClaude}
              onActivate={() => setActiveAgent(key, agentId)}
              onClose={() => closeAgent(key, agentId)}
            />
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
          onNewClaude={() => openAgent(key, newClaudeAgentId())}
        />
      </div>
    </header>
  );
}

function AgentLauncher({
  agents,
  openAgentIds,
  onOpen,
  onNewClaude,
}: {
  agents: { id: string; name: string; command: string }[];
  openAgentIds: string[];
  onOpen: (agentId: string) => void;
  onNewClaude: () => void;
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
        aria-label="Open a window"
        title="Open a window"
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      {open && (
        <div className="ws-agent-menu" role="menu">
          <button
            type="button"
            className="ws-agent-menu-item"
            onClick={() => {
              setOpen(false);
              onNewClaude();
            }}
          >
            <span className="ws-agent-menu-name">New Claude window</span>
          </button>
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
