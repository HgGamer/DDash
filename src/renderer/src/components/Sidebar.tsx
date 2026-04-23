import { useEffect, useRef, useState } from 'react';
import type { ActiveSelection, Project } from '@shared/types';
import { compositeKey } from '@shared/ipc';
import { useStore } from '../store';

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

const EXPANDED_KEY = 'dash.sidebar.expanded';

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function Sidebar({ activeId, onActivate, onAddProject, onRefresh, onNewWorktree }: Props) {
  const projects = useStore((s) => s.projects);
  const tabs = useStore((s) => s.tabs);
  const clearTab = useStore((s) => s.clearTab);
  const clearProjectAndWorktrees = useStore((s) => s.clearProjectAndWorktrees);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadExpanded());

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [expanded]);

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
    const ok = window.confirm(
      `Remove worktree "${wt.branch}"?\n\nThis runs \`git worktree remove\` and deletes the directory at ${wt.path} if clean.`,
    );
    if (!ok) return;
    let result = await window.api.worktrees.remove({ projectId, worktreeId, force: false });
    if (!result.ok) {
      const force = window.confirm(
        `git refused to remove the worktree:\n\n${result.error}\n\nForce removal? (this may discard uncommitted changes)`,
      );
      if (!force) return;
      result = await window.api.worktrees.remove({ projectId, worktreeId, force: true });
      if (!result.ok) {
        window.alert(`Failed to remove worktree:\n\n${result.error}`);
        return;
      }
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
    const ordered = [...projects].map((p) => p.id).filter((id) => id !== dragId);
    const targetIndex = ordered.indexOf(targetId);
    ordered.splice(targetIndex, 0, dragId);
    setDragId(null);
    await window.api.projects.reorder({ orderedIds: ordered });
    await onRefresh();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Projects</h1>
      </div>
      <div className="project-list">
        {projects.map((proj) => {
          const projKey = compositeKey(proj.id, null);
          const tab = tabs[projKey];
          const status = tab?.status ?? 'not-started';
          const isActive = activeId?.projectId === proj.id && activeId.worktreeId == null;
          const isRenaming = renamingId === proj.id;
          const hasWorktrees = proj.worktrees.length > 0;
          const isExpanded = expanded[proj.id] ?? false;
          return (
            <div key={proj.id}>
              <div
                className={[
                  'project-row',
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
                  className={`disclosure ${hasWorktrees ? '' : 'invisible'}`}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((s) => ({ ...s, [proj.id]: !isExpanded }));
                  }}
                >
                  {hasWorktrees ? (isExpanded ? '▼' : '▶') : ''}
                </button>
                <span className={`status-dot ${status}`} />
                <div className="name">
                  {isRenaming ? (
                    <input
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
                      <div>{proj.name}</div>
                      <div className="path">{proj.path}</div>
                    </>
                  )}
                </div>
                {proj.isGitRepo && !isRenaming && (
                  <button
                    type="button"
                    className="row-action"
                    title="New worktree"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNewWorktree(proj.id);
                      setExpanded((s) => ({ ...s, [proj.id]: true }));
                    }}
                  >
                    +
                  </button>
                )}
              </div>
              {isExpanded &&
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
                        'project-row',
                        'worktree-row',
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
                      <span className="disclosure invisible" />
                      <span className={`status-dot ${wtStatus}`} />
                      <div className="name">
                        <div className="worktree-branch">{wt.branch}</div>
                        {wt.status === 'missing' && (
                          <div className="path warn">missing on disk</div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
        <button className="btn-add" onClick={onAddProject}>
          + Add Project
        </button>
      </div>
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
