import { useStore } from '../store';

export function StatusBar() {
  const gitViewSettings = useStore((s) => s.gitView);

  return (
    <footer className="statusbar">
      <div className="statusbar-left" />
      <div className="statusbar-right">
        {gitViewSettings.enabled && (
          <button
            className="statusbar-button"
            title="Toggle git view"
            onClick={() => {
              void window.api.settings.setGitView({ expanded: !gitViewSettings.expanded });
            }}
          >
            ⎇ {gitViewSettings.expanded ? 'Hide git' : 'Git'}
          </button>
        )}
      </div>
    </footer>
  );
}
