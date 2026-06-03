import { useStore } from '../store';

/**
 * Bottom status bar: shows the active project on the left and the integrated
 * terminal toggle on the right.
 */
export function StatusBar() {
  const activeId = useStore((s) => s.activeId);
  const projects = useStore((s) => s.projects);
  const integratedTerminal = useStore((s) => s.integratedTerminal);

  const proj = activeId ? projects.find((p) => p.id === activeId.projectId) ?? null : null;
  const worktree =
    activeId?.worktreeId && proj
      ? proj.worktrees.find((w) => w.id === activeId.worktreeId) ?? null
      : null;

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        {proj && (
          <span className="statusbar-project" title={worktree?.path ?? proj.path}>
            <span className="statusbar-project-name">{proj.name}</span>
            {worktree && <span className="statusbar-project-branch">⎇ {worktree.branch}</span>}
          </span>
        )}
      </div>
      <div className="statusbar-right">
        {integratedTerminal.enabled && (
          <button
            type="button"
            className={`statusbar-button ${integratedTerminal.expanded ? 'active' : ''}`}
            title="Toggle integrated terminal (Cmd/Ctrl+`)"
            onClick={() =>
              void window.api.settings.setIntegratedTerminal({
                expanded: !integratedTerminal.expanded,
              })
            }
          >
            {'>_'} {integratedTerminal.expanded ? 'Hide terminal' : 'Terminal'}
          </button>
        )}
      </div>
    </footer>
  );
}
