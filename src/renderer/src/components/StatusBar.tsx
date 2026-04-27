import { useStore } from '../store';

export function StatusBar() {
  const gitViewSettings = useStore((s) => s.gitView);
  const todoViewSettings = useStore((s) => s.todoView);
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
        <button
          className="statusbar-button"
          title="Toggle todo panel"
          onClick={() => {
            void window.api.settings.setTodoView({ expanded: !todoViewSettings.expanded });
          }}
        >
          ☰ {todoViewSettings.expanded ? 'Hide todos' : 'Todos'}
        </button>
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
