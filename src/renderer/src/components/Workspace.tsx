import { useEffect, useRef, useState } from 'react';
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
  const agents = useStore((s) => s.agents);
  const openAgentsByKey = useStore((s) => s.openAgentsByKey);
  const activeAgentByKey = useStore((s) => s.activeAgentByKey);
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
            const activeAgent = activeAgentByKey[key] ?? null;
            const openAgents = openAgentsByKey[key] ?? [];
            return (
              <div key={key} style={{ position: 'absolute', inset: 0 }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    visibility: active && !activeAgent ? 'visible' : 'hidden',
                    pointerEvents: active && !activeAgent ? 'auto' : 'none',
                  }}
                >
                  <TerminalPane project={proj} worktree={worktree} active={active && !activeAgent} />
                </div>
                {openAgents.map((agentId) => {
                  const def = agents.find((a) => a.id === agentId);
                  if (!def) return null;
                  const agentActive = active && activeAgent === agentId;
                  return (
                    <div
                      key={`${key}::${agentId}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        visibility: agentActive ? 'visible' : 'hidden',
                        pointerEvents: agentActive ? 'auto' : 'none',
                      }}
                    >
                      <TerminalPane
                        project={proj}
                        worktree={worktree}
                        active={agentActive}
                        agentId={agentId}
                        agentLabel={def.name}
                      />
                    </div>
                  );
                })}
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
  const agents = useStore((s) => s.agents);
  const openAgentsByKey = useStore((s) => s.openAgentsByKey);
  const activeAgentByKey = useStore((s) => s.activeAgentByKey);
  const openAgent = useStore((s) => s.openAgent);
  const closeAgent = useStore((s) => s.closeAgent);
  const setActiveAgent = useStore((s) => s.setActiveAgent);

  const key = compositeKey(activeId.projectId, activeId.worktreeId);
  const docTabs = docTabsByKey[key] ?? [];
  const activeDoc = activeDocByKey[key] ?? null;
  const openAgents = openAgentsByKey[key] ?? [];
  const activeAgent = activeAgentByKey[key] ?? null;

  const basename = (p: string) => p.split('/').pop() ?? p;
  const claudeActive = activeDoc === null && activeAgent === null;

  return (
    <header className="ws-header">
      <div className="ws-tabs">
        <button
          type="button"
          className={`ws-tab ${claudeActive ? 'active' : ''}`}
          onClick={() => setActiveDoc(key, null)}
        >
          Claude Code
        </button>
        {openAgents.map((agentId) => {
          const def = agents.find((a) => a.id === agentId);
          if (!def) return null;
          return (
            <span
              key={agentId}
              className={`ws-tab ws-tab-doc ${activeAgent === agentId ? 'active' : ''}`}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  closeAgent(key, agentId);
                }
              }}
            >
              <button
                type="button"
                className="ws-tab-label"
                title={def.command}
                onClick={() => setActiveAgent(key, agentId)}
              >
                {def.name}
              </button>
              <button
                type="button"
                className="ws-tab-close"
                aria-label={`Close ${def.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeAgent(key, agentId);
                }}
              >
                ✕
              </button>
            </span>
          );
        })}
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
      <div className="ws-header-actions">
        <AgentLauncher
          agents={agents}
          openAgentIds={openAgents}
          onOpen={(agentId) => openAgent(key, agentId)}
        />
      </div>
    </header>
  );
}

function AgentLauncher({
  agents,
  openAgentIds,
  onOpen,
}: {
  agents: { id: string; name: string; command: string }[];
  openAgentIds: string[];
  onOpen: (agentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openSettings = useStore((s) => s.openSettings);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="ws-agent-launcher" ref={ref}>
      <button
        type="button"
        className="ws-tab ws-tab-add"
        aria-label="Open an agent"
        title="Open an agent"
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      {open && (
        <div className="ws-agent-menu" role="menu">
          {agents.length === 0 ? (
            <button
              type="button"
              className="ws-agent-menu-item ws-agent-menu-empty"
              onClick={() => {
                setOpen(false);
                openSettings('agents');
              }}
            >
              No agents configured — add one in Settings…
            </button>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                type="button"
                className="ws-agent-menu-item"
                title={a.command}
                onClick={() => {
                  setOpen(false);
                  onOpen(a.id);
                }}
              >
                <span className="ws-agent-menu-name">{a.name}</span>
                {openAgentIds.includes(a.id) && <span className="ws-agent-menu-hint">open</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
