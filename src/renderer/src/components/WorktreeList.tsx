import { useEffect, useState } from 'react';
import type { ActiveSelection } from '@shared/types';
import type { WorktreeHeadEntry } from '@shared/ipc';
import { compositeKey } from '@shared/ipc';
import { useStore } from '../store';
import { removeWorktreeWithConfirm } from '../lib/removeWorktree';

interface Props {
  projectId: string;
  /** Active tab — used to mark the active row and to drive the
   *  remove-fallback-to-primary behavior. */
  active: ActiveSelection | null;
  /** Bumped by the parent to retrigger the heads fetch (tab change, focus,
   *  manual refresh, .git watcher). */
  refreshKey: number;
}

interface Row {
  /** Composite-key id used by tab state. `null` denotes the project's
   *  primary tree row. */
  worktreeId: string | null;
  branch: string;
  path: string;
  /** Set by the registry; when 'missing', the worktree directory is gone. */
  missing: boolean;
}

export function WorktreeList({ projectId, active, refreshKey }: Props) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId) ?? null);
  const setActive = useStore((s) => s.setActive);
  const clearTab = useStore((s) => s.clearTab);
  const openNewWorktree = useStore((s) => s.openNewWorktree);

  const [heads, setHeads] = useState<Record<string, string | null>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [openMenu]);

  useEffect(() => {
    let cancelled = false;
    void window.api.worktrees.listWithHeads(projectId).then((entries: WorktreeHeadEntry[]) => {
      if (cancelled) return;
      const next: Record<string, string | null> = {};
      for (const e of entries) {
        next[e.worktreeId ?? ''] = e.head;
      }
      setHeads(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  if (!project) return null;

  const rows: Row[] = [
    { worktreeId: null, branch: '(primary)', path: project.path, missing: false },
    ...project.worktrees.map<Row>((w) => ({
      worktreeId: w.id,
      branch: w.branch,
      path: w.path,
      missing: w.status === 'missing',
    })),
  ];

  const activeWorktreeId = active?.projectId === projectId ? active.worktreeId ?? null : undefined;

  const activateRow = (worktreeId: string | null) => {
    if (
      active &&
      active.projectId === projectId &&
      (active.worktreeId ?? null) === worktreeId
    ) {
      // Already active — no-op.
      return;
    }
    const next: ActiveSelection = { projectId, worktreeId };
    setActive(next);
    void window.api.projects.setActive(next);
  };

  const removeRow = async (row: Row) => {
    if (row.worktreeId === null) return; // primary tree never has Remove
    // If removing the active worktree, fall back to the primary tree first so
    // the Git View doesn't briefly point at a removed tab.
    if (
      active &&
      active.projectId === projectId &&
      active.worktreeId === row.worktreeId
    ) {
      const fallback: ActiveSelection = { projectId, worktreeId: null };
      setActive(fallback);
      void window.api.projects.setActive(fallback);
    }
    const r = await removeWorktreeWithConfirm({
      projectId,
      worktreeId: row.worktreeId,
      branch: row.branch,
      path: row.path,
    });
    if (!r.ok) {
      if (r.canceled) return;
      window.alert(`Failed to remove worktree:\n\n${r.error}`);
      return;
    }
    clearTab(compositeKey(projectId, row.worktreeId));
  };

  return (
    <div className="git-section git-worktree-section">
      <div className="git-section-header">
        <span className="git-section-title">Worktrees</span>
        <span className="git-section-count">{rows.length}</span>
        <button
          className="git-section-all"
          title="New worktree"
          onClick={() => openNewWorktree(projectId)}
        >
          + new
        </button>
      </div>
      <ul className="git-worktree-list">
        {rows.map((row) => {
          const isActive =
            activeWorktreeId !== undefined && activeWorktreeId === row.worktreeId;
          const rowKey = row.worktreeId ?? '__primary__';
          const head = heads[row.worktreeId ?? ''] ?? null;
          return (
            <li
              key={rowKey}
              className={[
                'git-worktree-row',
                isActive ? 'active' : '',
                row.missing ? 'missing' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={row.path}
              onClick={() => activateRow(row.worktreeId)}
            >
              <span className="git-worktree-branch">{row.branch}</span>
              <span className="git-worktree-head fg-muted">{head ?? '—'}</span>
              <span className="git-worktree-path fg-muted">{row.path}</span>
              <button
                className="git-worktree-menu"
                title="Worktree actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu(openMenu === rowKey ? null : rowKey);
                }}
              >
                ⋯
              </button>
              {openMenu === rowKey && (
                <div className="context-menu git-worktree-menu-popup" onClick={(e) => e.stopPropagation()}>
                  {!isActive && (
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        activateRow(row.worktreeId);
                      }}
                    >
                      Activate
                    </button>
                  )}
                  {row.worktreeId !== null && (
                    <button
                      className="danger"
                      onClick={() => {
                        setOpenMenu(null);
                        void removeRow(row);
                      }}
                    >
                      Remove worktree
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
