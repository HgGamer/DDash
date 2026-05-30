import { useRef } from 'react';
import type { ActiveSelection } from '@shared/types';
import { compositeKey, parseCompositeKey } from '@shared/ipc';
import { useStore } from '../store';
import { TerminalPane } from './TerminalPane';
import { CommitView, DiffView, StashView } from './GitView';
import { FileView } from './MarkdownViewer';
import { IntegratedTerminalDock, useWorkspaceHeight } from './IntegratedTerminalDock';
import { useShellTabs } from '../hooks/useShellTabs';

interface Props {
  activeId: ActiveSelection | null;
}

export function Workspace({ activeId }: Props) {
  const mountedKeys = useStore((s) => s.mountedKeys);
  const projects = useStore((s) => s.projects);
  const integratedTerminal = useStore((s) => s.integratedTerminal);
  const gitDiff = useStore((s) => s.gitDiff);
  const closeDiff = useStore((s) => s.closeDiff);
  const gitCommit = useStore((s) => s.gitCommit);
  const closeCommit = useStore((s) => s.closeCommit);
  const gitStash = useStore((s) => s.gitStash);
  const closeStash = useStore((s) => s.closeStash);
  const activeDocByKey = useStore((s) => s.activeDocByKey);
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceHeight = useWorkspaceHeight(workspaceRef);

  const showIntegratedTerminal =
    integratedTerminal.enabled && integratedTerminal.expanded && !!activeId;
  useShellTabs(activeId, integratedTerminal.enabled);

  const resolved = mountedKeys
    .map((k) => {
      const { projectId, worktreeId } = parseCompositeKey(k);
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) return null;
      const worktree = worktreeId ? proj.worktrees.find((w) => w.id === worktreeId) ?? null : null;
      if (worktreeId && !worktree) return null;
      return { key: k, proj, worktree };
    })
    .filter((x): x is { key: string; proj: typeof projects[number]; worktree: typeof projects[number]['worktrees'][number] | null } => x !== null);

  const activeKey = activeId ? compositeKey(activeId.projectId, activeId.worktreeId) : null;
  const activeDocRel = activeKey ? activeDocByKey[activeKey] ?? null : null;
  const activeProjectRoot = activeId
    ? projects.find((p) => p.id === activeId.projectId)?.path ?? ''
    : '';

  if (!activeKey && resolved.length === 0) {
    return (
      <main className="workspace" ref={workspaceRef}>
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
    <main className="workspace workspace-split" ref={workspaceRef}>
      <div className="workspace-left">
        {activeId && <WorkspaceContentTabs activeId={activeId} />}
        <div className="workspace-terminals">
          {resolved.map(({ key, proj, worktree }) => {
            const active = key === activeKey;
            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  inset: 0,
                  visibility: active ? 'visible' : 'hidden',
                  pointerEvents: active ? 'auto' : 'none',
                }}
              >
                <TerminalPane project={proj} worktree={worktree} active={active} />
              </div>
            );
          })}
          {activeDocRel && activeId && (
            <div className="workspace-doc-overlay">
              <FileView
                key={`${activeKey}:${activeDocRel}`}
                projectId={activeId.projectId}
                projectRoot={activeProjectRoot}
                relPath={activeDocRel}
              />
            </div>
          )}
          {gitDiff && activeId && gitDiff.projectId === activeId.projectId && (
            <div className="workspace-diff-overlay">
              <DiffView
                active={activeId}
                file={{ path: gitDiff.path, stage: gitDiff.stage }}
                onClose={closeDiff}
              />
            </div>
          )}
          {gitCommit && activeId && gitCommit.projectId === activeId.projectId && (
            <div className="workspace-diff-overlay">
              <CommitView active={activeId} commit={gitCommit.hash} onClose={closeCommit} />
            </div>
          )}
          {gitStash && activeId && gitStash.projectId === activeId.projectId && (
            <div className="workspace-diff-overlay">
              <StashView
                active={activeId}
                ref={gitStash.ref}
                sha={gitStash.sha}
                branch={gitStash.branch}
                message={gitStash.message}
                time={gitStash.time}
                onClose={closeStash}
              />
            </div>
          )}
        </div>
        {showIntegratedTerminal && activeId && (
          <IntegratedTerminalDock
            active={activeId}
            height={integratedTerminal.height}
            workspaceHeight={workspaceHeight}
          />
        )}
      </div>
    </main>
  );
}

function WorkspaceContentTabs({ activeId }: { activeId: ActiveSelection }) {
  const docTabsByKey = useStore((s) => s.docTabs);
  const activeDocByKey = useStore((s) => s.activeDocByKey);
  const closeDoc = useStore((s) => s.closeDoc);
  const setActiveDoc = useStore((s) => s.setActiveDoc);

  const key = compositeKey(activeId.projectId, activeId.worktreeId);
  const docTabs = docTabsByKey[key] ?? [];
  const activeDoc = activeDocByKey[key] ?? null;

  const basename = (p: string) => p.split('/').pop() ?? p;

  return (
    <header className="ws-header">
      <div className="ws-tabs">
        <button
          type="button"
          className={`ws-tab ${activeDoc === null ? 'active' : ''}`}
          onClick={() => setActiveDoc(key, null)}
        >
          Claude Code
        </button>
        {docTabs.map((relPath) => (
          <span
            key={relPath}
            className={`ws-tab ws-tab-doc ${activeDoc === relPath ? 'active' : ''}`}
            onAuxClick={(e) => {
              // Middle-click closes the tab.
              if (e.button === 1) {
                e.preventDefault();
                closeDoc(key, relPath);
              }
            }}
          >
            <button
              type="button"
              className="ws-tab-label"
              title={relPath}
              onClick={() => setActiveDoc(key, relPath)}
            >
              {basename(relPath)}
            </button>
            <button
              type="button"
              className="ws-tab-close"
              aria-label={`Close ${basename(relPath)}`}
              onClick={(e) => {
                e.stopPropagation();
                closeDoc(key, relPath);
              }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </header>
  );
}
