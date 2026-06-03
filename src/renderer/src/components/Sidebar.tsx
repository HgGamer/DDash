import { useEffect, useRef, useState } from 'react';
import type { ActiveSelection, Project } from '@shared/types';
import { compositeKey } from '@shared/ipc';
import { useStore } from '../store';
import { removeWorktreeWithConfirm } from '../lib/removeWorktree';
import { monogramFor } from '../lib/monogram';
import { FileExplorer } from './FileExplorer';
import { GitView } from './GitView';
import { TodoView } from './TodoView';

interface Props {
  activeId: ActiveSelection | null;
  onActivate: (active: ActiveSelection) => void;
  onAddProject: () => void;
  onRefresh: () => Promise<Project[]>;
  onNewWorktree: (projectId: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  projectId: string;
  worktreeId: string | null;
}

const WIDTH_KEY = 'dash.sidebar.width';
const MIN_WIDTH = 220;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 260;

function loadWidth(): number {
  const raw = Number(localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH ? raw : DEFAULT_WIDTH;
}

export function Sidebar({ activeId, onActivate, onAddProject, onRefresh, onNewWorktree }: Props) {
  const projects = useStore((s) => s.projects);
  const tabs = useStore((s) => s.tabs);
  const clearTab = useStore((s) => s.clearTab);
  const clearProjectAndWorktrees = useStore((s) => s.clearProjectAndWorktrees);
  const sidebarView = useStore((s) => s.sidebarView);
  const openDoc = useStore((s) => s.openDoc);
  const activeDocByKey = useStore((s) => s.activeDocByKey);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [width, setWidth] = useState(loadWidth);
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const onResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev: MouseEvent) => {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      } catch {
        /* ignore quota / disabled storage */
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  // Optimistic per-project collapse overrides so the chevron feels instant; the
  // persisted source of truth is `project.worktreesCollapsed` in the store.
  const [collapseOverride, setCollapseOverride] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const isCollapsed = (proj: Project): boolean =>
    collapseOverride[proj.id] ?? proj.worktreesCollapsed ?? false;

  const setCollapsed = (projectId: string, collapsed: boolean) => {
    setCollapseOverride((s) => ({ ...s, [projectId]: collapsed }));
    void window.api.projects.setWorktreesCollapsed({ id: projectId, collapsed });
  };

  /** Count of a project's tabs (primary + worktrees) flagged needsAttention. */
  const attentionCount = (proj: Project): number => {
    let n = tabs[compositeKey(proj.id, null)]?.needsAttention ? 1 : 0;
    for (const wt of proj.worktrees) {
      if (tabs[compositeKey(proj.id, wt.id)]?.needsAttention) n++;
    }
    return n;
  };

  const commitRename = async (id: string) => {
    const name = renameValue.trim();
    if (name) await window.api.projects.rename({ id, name });
    setRenamingId(null);
    setRenameValue('');
    await onRefresh();
  };

  const handleRemove = async (id: string) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    const wtCount = proj.worktrees.length;
    const extra = wtCount > 0 ? `\n\nThis will also remove ${wtCount} worktree(s) via git.` : '';
    const ok = window.confirm(`Remove project "${proj.name}"?\n\nThis does not delete any files.${extra}`);
    if (!ok) return;
    const result = await window.api.projects.remove(id);
    if (!result.ok) {
      const lines = result.errors.map((e) => {
        const wt = proj.worktrees.find((w) => w.id === e.worktreeId);
        return `• ${wt?.branch ?? e.worktreeId}: ${e.message}`;
      });
      window.alert(`Some worktrees could not be removed:\n\n${lines.join('\n')}`);
      await onRefresh();
      return;
    }
    clearProjectAndWorktrees(id);
    const list = await onRefresh();
    if (activeId?.projectId === id) {
      const next = list[0];
      if (next) onActivate({ projectId: next.id, worktreeId: null });
    }
  };

  const handleRemoveWorktree = async (projectId: string, worktreeId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    const wt = proj?.worktrees.find((w) => w.id === worktreeId);
    if (!proj || !wt) return;
    const r = await removeWorktreeWithConfirm({
      projectId,
      worktreeId,
      branch: wt.branch,
      path: wt.path,
    });
    if (!r.ok) {
      if (r.canceled) return;
      window.alert(`Failed to remove worktree:\n\n${r.error}`);
      return;
    }
    clearTab(compositeKey(projectId, worktreeId));
    const list = await onRefresh();
    if (activeId?.projectId === projectId && activeId.worktreeId === worktreeId) {
      const proj2 = list.find((p) => p.id === projectId);
      onActivate({ projectId, worktreeId: proj2?.worktrees[0]?.id ?? null });
    }
  };

  const handleCloseSession = async (projectId: string, worktreeId: string | null) => {
    await window.api.pty.close({ projectId, worktreeId });
    clearTab(compositeKey(projectId, worktreeId));
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const onDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const sourceIndex = projects.findIndex((p) => p.id === dragId);
    const targetIndexOriginal = projects.findIndex((p) => p.id === targetId);
    const ordered = projects.map((p) => p.id).filter((id) => id !== dragId);
    const insertAt =
      sourceIndex < targetIndexOriginal
        ? ordered.indexOf(targetId) + 1
        : ordered.indexOf(targetId);
    ordered.splice(insertAt, 0, dragId);
    setDragId(null);
    await window.api.projects.reorder({ orderedIds: ordered });
    await onRefresh();
  };

  const key = activeId ? compositeKey(activeId.projectId, activeId.worktreeId) : null;
  const activeDocRel = key ? activeDocByKey[key] ?? null : null;

  return (
    <aside className="sidebar" style={{ width }}>
      {(sidebarView === 'projects' || sidebarView === 'files') && (
        <div className="sidebar-header">
          <h1>{sidebarView === 'files' ? 'Files' : 'Projects'}</h1>
          {sidebarView === 'projects' && (
            <button
              type="button"
              className="header-add"
              onClick={onAddProject}
              title="Add project"
              aria-label="Add project"
            >
              +
            </button>
          )}
        </div>
      )}
      {sidebarView === 'git' ? (
        <GitView active={activeId} isWorktreeTab={!!activeId?.worktreeId} />
      ) : sidebarView === 'todos' ? (
        <TodoView active={activeId} />
      ) : sidebarView === 'files' ? (
        activeId ? (
          <FileExplorer
            projectId={activeId.projectId}
            activeRelPath={activeDocRel}
            onOpenFile={(relPath) => {
              if (key) openDoc(key, relPath);
            }}
          />
        ) : (
          <div className="sidebar-empty">
            <div className="sidebar-empty-card">
              <p className="sidebar-empty-text">Select a project to browse its files.</p>
            </div>
          </div>
        )
      ) : projects.length === 0 ? (
        <div className="sidebar-empty">
          <div className="sidebar-empty-card">
            <div className="sidebar-empty-title">No projects yet</div>
            <p className="sidebar-empty-text">
              Add a project folder to start a Claude session in it.
            </p>
            <button type="button" className="btn-primary" onClick={onAddProject}>
              Add project
            </button>
          </div>
        </div>
      ) : (
        <div className="project-list">
          {projects.map((proj) => {
            const projKey = compositeKey(proj.id, null);
            const tab = tabs[projKey];
            const status = tab?.status ?? 'not-started';
            const isActive = activeId?.projectId === proj.id && activeId.worktreeId == null;
            const isRenaming = renamingId === proj.id;
            const hasWorktrees = proj.worktrees.length > 0;
            const collapsed = isCollapsed(proj);
            const mono = monogramFor(proj.id, proj.name);
            const attention = attentionCount(proj);
            return (
              <div key={proj.id}>
                <div
                  className={[
                    'sb-row',
                    isActive ? 'active' : '',
                    dragOverId === proj.id ? 'drag-over' : '',
                    tab?.needsAttention ? 'needs-attention' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable={!isRenaming}
                  onDragStart={(e) => onDragStart(e, proj.id)}
                  onDragOver={(e) => onDragOver(e, proj.id)}
                  onDragLeave={() => setDragOverId((cur) => (cur === proj.id ? null : cur))}
                  onDrop={(e) => onDrop(e, proj.id)}
                  onClick={() => {
                    if (!isRenaming) onActivate({ projectId: proj.id, worktreeId: null });
                  }}
                  onDoubleClick={() => {
                    setRenamingId(proj.id);
                    setRenameValue(proj.name);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, projectId: proj.id, worktreeId: null });
                  }}
                  title={proj.path}
                >
                  <button
                    type="button"
                    className={`sb-chevron ${hasWorktrees ? '' : 'invisible'}`}
                    aria-label={collapsed ? 'Expand' : 'Collapse'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed(proj.id, !collapsed);
                    }}
                  >
                    {hasWorktrees ? (collapsed ? '▸' : '▾') : ''}
                  </button>
                  <span
                    className={`sb-avatar status-${status}`}
                    style={{ background: mono.tint }}
                    aria-hidden="true"
                  >
                    {mono.initials}
                  </span>
                  <div className="sb-text">
                    {isRenaming ? (
                      <input
                        className="sb-rename-input"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void commitRename(proj.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename(proj.id);
                          if (e.key === 'Escape') {
                            setRenamingId(null);
                            setRenameValue('');
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <div className="sb-name">{proj.name}</div>
                        <div className="sb-secondary">{proj.path}</div>
                      </>
                    )}
                  </div>
                  {!isRenaming && (
                    <div className="sb-meta">
                      {attention > 0 && (
                        <span className="sb-chip sb-chip-attention" title="Tabs needing attention">
                          {attention}
                        </span>
                      )}
                      {hasWorktrees && (
                        <span className="sb-chip" title="Worktrees">
                          {proj.worktrees.length}
                        </span>
                      )}
                      {proj.isGitRepo && (
                        <button
                          type="button"
                          className="sb-action"
                          title="New workspace"
                          aria-label="New workspace"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNewWorktree(proj.id);
                            setCollapsed(proj.id, false);
                          }}
                        >
                          +
                        </button>
                      )}
                      <span className="sb-drag-handle" aria-hidden="true">
                        ⠿
                      </span>
                    </div>
                  )}
                </div>
                {hasWorktrees &&
                  !collapsed &&
                  proj.worktrees.map((wt) => {
                    const wtKey = compositeKey(proj.id, wt.id);
                    const wtTab = tabs[wtKey];
                    const wtStatus = wtTab?.status ?? 'not-started';
                    const wtActive =
                      activeId?.projectId === proj.id && activeId.worktreeId === wt.id;
                    return (
                      <div
                        key={wt.id}
                        className={[
                          'sb-row',
                          'sb-worktree',
                          wtActive ? 'active' : '',
                          wtTab?.needsAttention ? 'needs-attention' : '',
                          wt.status === 'missing' ? 'missing' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => onActivate({ projectId: proj.id, worktreeId: wt.id })}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({
                            x: e.clientX,
                            y: e.clientY,
                            projectId: proj.id,
                            worktreeId: wt.id,
                          });
                        }}
                        title={wt.path}
                      >
                        <span className={`sb-branch-dot status-${wtStatus}`} aria-hidden="true" />
                        <div className="sb-text">
                          <div className="sb-name sb-branch">{wt.branch}</div>
                          {wt.status === 'missing' && (
                            <div className="sb-secondary warn">missing on disk</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          isWorktree={menu.worktreeId != null}
          hasSession={
            !!tabs[compositeKey(menu.projectId, menu.worktreeId)] &&
            tabs[compositeKey(menu.projectId, menu.worktreeId)].status === 'running'
          }
          onRename={() => {
            if (menu.worktreeId == null) {
              const proj = projects.find((p) => p.id === menu.projectId);
              if (proj) {
                setRenamingId(proj.id);
                setRenameValue(proj.name);
              }
            }
            setMenu(null);
          }}
          onCloseSession={() => {
            void handleCloseSession(menu.projectId, menu.worktreeId);
            setMenu(null);
          }}
          onRemove={() => {
            if (menu.worktreeId != null) {
              void handleRemoveWorktree(menu.projectId, menu.worktreeId);
            } else {
              void handleRemove(menu.projectId);
            }
            setMenu(null);
          }}
        />
      )}
      <div
        className="sidebar-resize-handle"
        onMouseDown={onResizeDown}
        title="Drag to resize"
      />
    </aside>
  );
}

function ContextMenu(props: {
  x: number;
  y: number;
  isWorktree: boolean;
  onRename: () => void;
  onRemove: () => void;
  onCloseSession: () => void;
  hasSession: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: props.x, top: props.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {!props.isWorktree && <button onClick={props.onRename}>Rename…</button>}
      <button onClick={props.onCloseSession} disabled={!props.hasSession}>
        Close session
      </button>
      <button className="danger" onClick={props.onRemove}>
        {props.isWorktree ? 'Remove worktree' : 'Remove project'}
      </button>
    </div>
  );
}
