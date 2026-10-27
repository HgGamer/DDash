import { useStore } from '../store';
import {
  ProjectsIcon,
  FilesIcon,
  GitIcon,
  BoardIcon,
  TasksIcon,
  SettingsIcon,
  HooksIcon,
} from './icons';

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
  const claudeOpen = useStore((s) => s.claudePanelOpen);
  const toggleClaude = useStore((s) => s.toggleClaudePanel);
  const waiting = useStore((s) => s.taskCounts?.waiting ?? 0);

  const item = (
    v: 'projects' | 'files' | 'git' | 'board' | 'tasks',
    label: string,
    Icon: () => JSX.Element,
    badge?: number,
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
      {!!badge && (
        <span className="act-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <nav className="activity-bar" aria-label="Activity bar">
      <div className="act-group">
        {item('projects', 'Projects', ProjectsIcon)}
        {item('files', 'Files', FilesIcon)}
        {gitEnabled && item('git', 'Source Control', GitIcon)}
        {item('board', 'Board', BoardIcon)}
        {item(
          'tasks',
          waiting > 0 ? `Tasks: ${waiting} waiting for you` : 'Tasks',
          TasksIcon,
          waiting,
        )}
      </div>
      <div className="act-group">
        <button
          type="button"
          className={`act-item ${claudeOpen ? 'active' : ''}`}
          title="Claude hooks & plugins"
          aria-label="Claude hooks and plugins"
          aria-pressed={claudeOpen}
          onClick={toggleClaude}
        >
          <HooksIcon />
        </button>
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
