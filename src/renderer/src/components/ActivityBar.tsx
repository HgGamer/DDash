import { useStore } from '../store';
import { ProjectsIcon, FilesIcon, GitIcon, TodosIcon, SettingsIcon } from './icons';

/**
 * VS Code-style activity bar: a narrow icon rail that selects which view the
 * side panel shows. Clicking the active view's icon collapses the panel.
 */
export function ActivityBar() {
  const view = useStore((s) => s.sidebarView);
  const open = useStore((s) => s.sidebarOpen);
  const select = useStore((s) => s.selectSidebarView);
  const gitEnabled = useStore((s) => s.gitView.enabled);
  const openSettings = useStore((s) => s.openSettings);

  const item = (
    v: 'projects' | 'files' | 'git' | 'todos',
    label: string,
    Icon: () => JSX.Element,
  ) => (
    <button
      type="button"
      className={`act-item ${open && view === v ? 'active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={open && view === v}
      onClick={() => select(v)}
    >
      <Icon />
    </button>
  );

  return (
    <nav className="activity-bar" aria-label="Activity bar">
      <div className="act-group">
        {item('projects', 'Projects', ProjectsIcon)}
        {item('files', 'Files', FilesIcon)}
        {gitEnabled && item('git', 'Source Control', GitIcon)}
        {item('todos', 'Todos', TodosIcon)}
      </div>
      <div className="act-group">
        <button
          type="button"
          className="act-item"
          title="Settings"
          aria-label="Settings"
          onClick={() => openSettings()}
        >
          <SettingsIcon />
        </button>
      </div>
    </nav>
  );
}
