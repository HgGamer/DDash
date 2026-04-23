import { useEffect, useRef, useState } from 'react';
import type { Project } from '@shared/types';
import { useStore } from '../store';

interface Props {
  activeId: string | null;
  onActivate: (id: string) => void;
  onAddProject: () => void;
  onRefresh: () => Promise<Project[]>;
}

interface ContextMenuState {
  x: number;
  y: number;
  projectId: string;
}

export function Sidebar({ activeId, onActivate, onAddProject, onRefresh }: Props) {
  const projects = useStore((s) => s.projects);
  const tabs = useStore((s) => s.tabs);
  const clearTab = useStore((s) => s.clearTab);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
    const ok = window.confirm(`Remove project "${proj.name}"?\n\nThis does not delete any files.`);
    if (!ok) return;
    await window.api.projects.remove(id);
    clearTab(id);
    const list = await onRefresh();
    if (activeId === id) {
      const next = list[0]?.id ?? null;
      if (next) onActivate(next);
    }
  };

  const handleCloseSession = async (id: string) => {
    await window.api.pty.close({ projectId: id });
    clearTab(id);
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
          const tab = tabs[proj.id];
          const status = tab?.status ?? 'not-started';
          const isActive = activeId === proj.id;
          const isRenaming = renamingId === proj.id;
          return (
            <div
              key={proj.id}
              className={[
                'project-row',
                isActive ? 'active' : '',
                dragOverId === proj.id ? 'drag-over' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={!isRenaming}
              onDragStart={(e) => onDragStart(e, proj.id)}
              onDragOver={(e) => onDragOver(e, proj.id)}
              onDragLeave={() => setDragOverId((cur) => (cur === proj.id ? null : cur))}
              onDrop={(e) => onDrop(e, proj.id)}
              onClick={() => {
                if (!isRenaming) onActivate(proj.id);
              }}
              onDoubleClick={() => {
                setRenamingId(proj.id);
                setRenameValue(proj.name);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, projectId: proj.id });
              }}
              title={proj.path}
            >
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
          onRename={() => {
            const proj = projects.find((p) => p.id === menu.projectId);
            if (proj) {
              setRenamingId(proj.id);
              setRenameValue(proj.name);
            }
            setMenu(null);
          }}
          onCloseSession={() => {
            void handleCloseSession(menu.projectId);
            setMenu(null);
          }}
          onRemove={() => {
            void handleRemove(menu.projectId);
            setMenu(null);
          }}
          hasSession={!!tabs[menu.projectId] && tabs[menu.projectId].status === 'running'}
        />
      )}
    </aside>
  );
}

function ContextMenu(props: {
  x: number;
  y: number;
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
      <button onClick={props.onRename}>Rename…</button>
      <button onClick={props.onCloseSession} disabled={!props.hasSession}>
        Close session
      </button>
      <button className="danger" onClick={props.onRemove}>
        Remove project
      </button>
    </div>
  );
}
