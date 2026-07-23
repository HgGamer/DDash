import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActiveSelection, Project, ProjectFolder } from '@shared/types';
import { compositeKey } from '@shared/ipc';
import { useStore } from '../store';
import { removeWorktreeWithConfirm } from '../lib/removeWorktree';
import { monogramFor } from '../lib/monogram';
import { FileExplorer } from './FileExplorer';
import { GitView } from './GitView';

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
  const folders = useStore((s) => s.folders);
  const tabs = useStore((s) => s.tabs);
  const clearTab = useStore((s) => s.clearTab);
  const clearProjectAndWorktrees = useStore((s) => s.clearProjectAndWorktrees);
  const sidebarView = useStore((s) => s.sidebarView);
  const openDoc = useStore((s) => s.openDoc);
  const activeDocByKey = useStore((s) => s.activeDocByKey);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folderId: string } | null>(
    null,
  );
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
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
    if (!menu && !folderMenu) return;
    const close = () => {
      setMenu(null);
      setFolderMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [menu, folderMenu]);

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

  // Folders -----------------------------------------------------------------

  const createFolder = async (assignProjectId?: string) => {
    const folder = await window.api.folders.create({ name: 'New folder' });
    if (assignProjectId) {
      await window.api.projects.setFolder({ projectId: assignProjectId, folderId: folder.id });
    }
    await onRefresh();
    // Drop straight into rename so the user can name it.
    setRenamingFolderId(folder.id);
    setFolderRenameValue(folder.name);
  };

  const commitFolderRename = async (id: string) => {
    const name = folderRenameValue.trim();
    if (name) await window.api.folders.rename({ id, name });
    setRenamingFolderId(null);
    setFolderRenameValue('');
    await onRefresh();
  };

  const removeFolder = async (id: string) => {
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;
    const ok = window.confirm(
      `Delete folder "${folder.name}"?\n\nProjects inside it move back to the top level; nothing on disk is removed.`,
    );
    if (!ok) return;
    await window.api.folders.remove(id);
    await onRefresh();
  };

  const toggleFolderCollapsed = async (id: string, collapsed: boolean) => {
    await window.api.folders.setCollapsed({ id, collapsed });
    await onRefresh();
  };

  const assignToFolder = async (projectId: string, folderId: string | null) => {
    await window.api.projects.setFolder({ projectId, folderId });
    await onRefresh();
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

  const renderProject = (proj: Project) => {
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
            const wtActive = activeId?.projectId === proj.id && activeId.worktreeId === wt.id;
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
                  setMenu({ x: e.clientX, y: e.clientY, projectId: proj.id, worktreeId: wt.id });
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
  };

  // Group projects by folder for the sidebar. Unknown/blank folderId → root.
  const sortedFolders = [...folders].sort((a, b) => a.order - b.order);
  const folderIds = new Set(sortedFolders.map((f) => f.id));
  const projectsInFolder = (folderId: string) =>
    projects.filter((p) => p.folderId === folderId);
  const ungroupedProjects = projects.filter((p) => !p.folderId || !folderIds.has(p.folderId));

  return (
    <aside className="sidebar" style={{ width }}>
      {(sidebarView === 'projects' || sidebarView === 'files') && (
        <div className="sidebar-header">
          <h1>{sidebarView === 'files' ? 'Files' : 'Projects'}</h1>
          {sidebarView === 'projects' && (
            <div className="header-actions">
              <button
                type="button"
                className="header-add"
                onClick={() => void createFolder()}
                title="New folder"
                aria-label="New folder"
              >
                ▤
              </button>
              <button
                type="button"
                className="header-add"
                onClick={onAddProject}
                title="Add project"
                aria-label="Add project"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}
      {sidebarView === 'git' ? (
        <GitView active={activeId} isWorktreeTab={!!activeId?.worktreeId} />
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
          {sortedFolders.map((folder) => {
            const fCollapsed = folder.collapsed ?? false;
            const inFolder = projectsInFolder(folder.id);
            const isRenamingF = renamingFolderId === folder.id;
            return (
              <div key={folder.id}>
                <div
                  className={['sb-folder', dragOverFolderId === folder.id ? 'drag-over' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => void toggleFolderCollapsed(folder.id, !fCollapsed)}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverFolderId(folder.id);
                  }}
                  onDragLeave={() =>
                    setDragOverFolderId((cur) => (cur === folder.id ? null : cur))
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverFolderId(null);
                    const pid = dragId;
                    setDragId(null);
                    if (pid) void assignToFolder(pid, folder.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setFolderMenu({ x: e.clientX, y: e.clientY, folderId: folder.id });
                  }}
                >
                  <span className="sb-folder-chevron" aria-hidden="true">
                    {fCollapsed ? '▸' : '▾'}
                  </span>
                  <span className="sb-folder-icon" aria-hidden="true">
                    ▦
                  </span>
                  <div className="sb-text">
                    {isRenamingF ? (
                      <input
                        className="sb-rename-input"
                        autoFocus
                        value={folderRenameValue}
                        onChange={(e) => setFolderRenameValue(e.target.value)}
                        onBlur={() => void commitFolderRename(folder.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitFolderRename(folder.id);
                          if (e.key === 'Escape') {
                            setRenamingFolderId(null);
                            setFolderRenameValue('');
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="sb-folder-name">{folder.name}</div>
                    )}
                  </div>
                  {!isRenamingF && (
                    <span className="sb-chip" title="Projects in folder">
                      {inFolder.length}
                    </span>
                  )}
                </div>
                {!fCollapsed && (
                  <div className="sb-folder-children">
                    {inFolder.length > 0 ? (
                      inFolder.map(renderProject)
                    ) : (
                      <div className="sb-folder-empty">Drop a project here</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {sortedFolders.length > 0 && ungroupedProjects.length > 0 && (
            <div
              className={`sb-root-label ${dragOverFolderId === '__root__' ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverFolderId('__root__');
              }}
              onDragLeave={() => setDragOverFolderId((cur) => (cur === '__root__' ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverFolderId(null);
                const pid = dragId;
                setDragId(null);
                if (pid) void assignToFolder(pid, null);
              }}
            >
              Top level
            </div>
          )}
          {ungroupedProjects.map(renderProject)}
        </div>
      )}
      {menu &&
        createPortal(
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
          folders={sortedFolders}
          currentFolderId={projects.find((p) => p.id === menu.projectId)?.folderId ?? null}
          onMoveToFolder={(folderId) => {
            void assignToFolder(menu.projectId, folderId);
            setMenu(null);
          }}
          onNewFolder={() => {
            void createFolder(menu.projectId);
            setMenu(null);
          }}
        />,
          document.body,
        )}
      {folderMenu &&
        createPortal(
          <div
            className="context-menu"
            style={{ left: folderMenu.x, top: folderMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                const f = folders.find((x) => x.id === folderMenu.folderId);
                if (f) {
                  setRenamingFolderId(f.id);
                  setFolderRenameValue(f.name);
                }
                setFolderMenu(null);
              }}
            >
              Rename…
            </button>
            <button
              onClick={() => {
                void createFolder();
                setFolderMenu(null);
              }}
            >
              New folder…
            </button>
            <button
              className="danger"
              onClick={() => {
                void removeFolder(folderMenu.folderId);
                setFolderMenu(null);
              }}
            >
              Delete folder
            </button>
          </div>,
          document.body,
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
  folders?: ProjectFolder[];
  currentFolderId?: string | null;
  onMoveToFolder?: (folderId: string | null) => void;
  onNewFolder?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const showFolders = !props.isWorktree && !!props.onMoveToFolder;
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
      {showFolders && (
        <>
          <div className="context-menu-sep" />
          <div className="context-menu-label">Move to folder</div>
          {props.currentFolderId != null && (
            <button onClick={() => props.onMoveToFolder!(null)}>Top level</button>
          )}
          {(props.folders ?? []).map((f) => (
            <button
              key={f.id}
              disabled={f.id === props.currentFolderId}
              onClick={() => props.onMoveToFolder!(f.id)}
            >
              {f.id === props.currentFolderId ? `✓ ${f.name}` : f.name}
            </button>
          ))}
          <button onClick={props.onNewFolder}>New folder…</button>
          <div className="context-menu-sep" />
        </>
      )}
      <button className="danger" onClick={props.onRemove}>
        {props.isWorktree ? 'Remove worktree' : 'Remove project'}
      </button>
    </div>
  );
}
