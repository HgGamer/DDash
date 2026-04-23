import type { Project } from '@shared/types';
import { useStore } from '../store';
import { TerminalPane } from './TerminalPane';

interface Props {
  project: Project | null;
}

export function Workspace({ project }: Props) {
  const mountedIds = useStore((s) => s.mountedIds);
  const projects = useStore((s) => s.projects);

  const validMounted = mountedIds.filter((id) => projects.some((p) => p.id === id));

  if (!project && validMounted.length === 0) {
    return (
      <main className="workspace">
        <div className="empty-state">
          <div>
            <h2 style={{ marginTop: 0 }}>No project selected</h2>
            <p>Add a project from the sidebar to start a Claude session.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace">
      {validMounted.map((id) => {
        const proj = projects.find((p) => p.id === id)!;
        const active = project?.id === id;
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              inset: 0,
              visibility: active ? 'visible' : 'hidden',
              pointerEvents: active ? 'auto' : 'none',
            }}
          >
            <TerminalPane project={proj} active={active} />
          </div>
        );
      })}
    </main>
  );
}
