import { useStore } from '../store';

export function StatusBar() {
  const gitViewSettings = useStore((s) => s.gitView);
  const integratedTerminal = useStore((s) => s.integratedTerminal);

  return (
    <footer className="statusbar">
      <div className="statusbar-left" />
      <div className="statusbar-right">
        {integratedTerminal.enabled && (
          <button
            className="statusbar-button"
            title="Toggle integrated terminal (Cmd/Ctrl+`)"
            onClick={() => {
              void window.api.settings.setIntegratedTerminal({
                expanded: !integratedTerminal.expanded,
              });
            }}
          >
            ▯ {integratedTerminal.expanded ? 'Hide terminal' : 'Terminal'}
          </button>
        )}
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
