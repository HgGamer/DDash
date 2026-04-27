import { useEffect, useMemo, useReducer, useState } from 'react';
import type { ActiveSelection } from '@shared/types';
import { WorktreeList } from './WorktreeList';
import type {
  GitBranch,
  GitChangeKind,
  GitCommit,
  GitError,
  GitStatusFile,
} from '@shared/git';
import type { GitCommitDetail, GitCommitFile } from '@shared/ipc';
import { useGitView, type GitViewState } from '../hooks/useGitView';
import { useStore } from '../store';
import { laneColor, layoutCommitGraph, maxLane, type GraphRow } from '@shared/graph-layout';

const GRAPH_LANE_WIDTH = 14;
const GRAPH_ROW_HEIGHT = 22;
const GRAPH_NODE_RADIUS = 3;

interface Props {
  active: ActiveSelection | null;
  /** True when the active tab is a worktree — disables the branch switch. */
  isWorktreeTab: boolean;
}

export function GitView({ active, isWorktreeTab }: Props) {
  const { state, refresh, loadMoreCommits, commitLimit } = useGitView(active);
  const [error, setError] = useState<GitError | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // label of the in-flight action
  // Bumps each time `state` is replaced — covers tab change, successful
  // refresh, and `git:changed` watcher events. Used by WorktreeList to
  // re-fetch HEAD short hashes on the same triggers as the rest of the panel.
  const [worktreeRefreshKey, bumpWorktreeRefresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    bumpWorktreeRefresh();
  }, [state]);
  const gitDiff = useStore((s) => s.gitDiff);
  const openDiff = useStore((s) => s.openDiff);
  const closeDiff = useStore((s) => s.closeDiff);
  const gitCommit = useStore((s) => s.gitCommit);
  const openCommit = useStore((s) => s.openCommit);
  const closeCommit = useStore((s) => s.closeCommit);

  // Clear transient UI state when the active tab changes. The store already
  // clears `gitDiff` on active-tab change.
  useEffect(() => {
    setError(null);
    setBusy(null);
  }, [active?.projectId, active?.worktreeId]);

  const selectedFile =
    gitDiff &&
    active &&
    gitDiff.projectId === active.projectId &&
    (gitDiff.worktreeId ?? null) === (active.worktreeId ?? null)
      ? { path: gitDiff.path, stage: gitDiff.stage }
      : null;
  const setSelectedFile = (
    f: { path: string; stage: 'staged' | 'unstaged' | 'untracked' } | null,
  ) => {
    if (!f || !active) return;
    // Clicking the already-selected file toggles the diff closed.
    if (selectedFile && selectedFile.path === f.path && selectedFile.stage === f.stage) {
      closeDiff();
      return;
    }
    // openDiff clears any selected commit in the store.
    openDiff({
      projectId: active.projectId,
      worktreeId: active.worktreeId ?? null,
      path: f.path,
      stage: f.stage,
    });
  };

  const selectedCommit =
    gitCommit &&
    active &&
    gitCommit.projectId === active.projectId &&
    (gitCommit.worktreeId ?? null) === (active.worktreeId ?? null)
      ? gitCommit.hash
      : null;
  const toggleCommit = (hash: string) => {
    if (!active) return;
    if (selectedCommit === hash) {
      closeCommit();
      return;
    }
    // openCommit clears any selected working-tree file in the store.
    openCommit({
      projectId: active.projectId,
      worktreeId: active.worktreeId ?? null,
      hash,
    });
  };

  // If the commit graph refreshes and the selected commit is no longer
  // present (force-push, history rewrite), clear the selection silently.
  const commitsForCleanup = state.kind === 'ready' ? state.commits : null;
  useEffect(() => {
    if (!selectedCommit || !commitsForCleanup) return;
    if (!commitsForCleanup.some((c) => c.hash === selectedCommit)) {
      closeCommit();
    }
  }, [selectedCommit, commitsForCleanup, closeCommit]);

  if (!active) {
    return <EmptyPanel message="No tab selected." />;
  }

  return (
    <div className="git-view">
      <Header state={state} onRefresh={refresh} />
      {error && (
        <div className="git-error">
          <div className="git-error-title">{error.message}</div>
          {error.stderr && <pre className="git-error-stderr">{error.stderr.trim()}</pre>}
          <button className="link-btn" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}
      <Body
        state={state}
        active={active}
        isWorktreeTab={isWorktreeTab}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        selectedCommit={selectedCommit}
        toggleCommit={toggleCommit}
        commitLimit={commitLimit}
        onLoadMoreCommits={loadMoreCommits}
        worktreeRefreshKey={worktreeRefreshKey}
      />
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="git-view git-view-empty">{message}</div>;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ state, onRefresh }: { state: GitViewState; onRefresh: () => void }) {
  const label =
    state.kind === 'ready'
      ? state.status.detached
        ? `detached @ ${state.status.head ?? '—'}`
        : (state.status.branch ?? '—')
      : state.kind === 'loading'
        ? '…'
        : state.kind === 'not-a-repo'
          ? 'not a git repository'
          : state.kind === 'git-missing'
            ? 'git not found'
            : 'git';
  return (
    <div className="git-view-header">
      <div className="git-view-branch" title="current branch">
        <span className="git-view-branch-icon">⎇</span>
        <span>{label}</span>
      </div>
      <button
        className="git-view-refresh"
        title="Refresh"
        onClick={onRefresh}
        disabled={state.kind !== 'ready'}
      >
        ↻
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

interface BodyProps {
  state: GitViewState;
  active: ActiveSelection;
  isWorktreeTab: boolean;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
  selectedFile: { path: string; stage: 'staged' | 'unstaged' | 'untracked' } | null;
  setSelectedFile: (f: { path: string; stage: 'staged' | 'unstaged' | 'untracked' } | null) => void;
  selectedCommit: string | null;
  toggleCommit: (hash: string) => void;
  commitLimit: number;
  onLoadMoreCommits: () => void;
  worktreeRefreshKey: number;
}

function Body(props: BodyProps) {
  const { state } = props;
  if (state.kind === 'idle' || state.kind === 'loading') {
    return <div className="git-view-body fg-muted">Loading…</div>;
  }
  if (state.kind === 'git-missing') {
    return (
      <div className="git-view-body git-view-banner">
        <strong>git binary not found on PATH.</strong>
        <p>Install git and relaunch Dash to enable the Git View.</p>
      </div>
    );
  }
  if (state.kind === 'not-a-repo') {
    return (
      <div className="git-view-body fg-muted">
        This directory is not a git repository.
      </div>
    );
  }
  if (state.kind === 'error') {
    return <div className="git-view-body fg-muted">Error: {state.message}</div>;
  }
  return <ReadyBody {...props} state={state} />;
}

function ReadyBody({
  state,
  active,
  isWorktreeTab,
  busy,
  setBusy,
  setError,
  selectedFile,
  setSelectedFile,
  selectedCommit,
  toggleCommit,
  commitLimit,
  onLoadMoreCommits,
  worktreeRefreshKey,
}: BodyProps & { state: Extract<GitViewState, { kind: 'ready' }> }) {
  const { status, branches, commits } = state;
  const staged = status.files.filter((f) => f.stage === 'staged');
  const unstaged = status.files.filter((f) => f.stage === 'unstaged');
  const untracked = status.files.filter((f) => f.stage === 'untracked');

  return (
    <div className="git-view-body">
      <BranchBar
        status={status}
        branches={branches}
        active={active}
        isWorktreeTab={isWorktreeTab}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
      />
      <StatusSection
        title="Staged"
        sectionStage="staged"
        files={staged}
        emptyMessage={null}
        actionLabel="−"
        actionTitle="Unstage"
        onAction={async (paths) => {
          setBusy('unstage');
          const r = await window.api.git.unstage({ ...active, paths });
          setBusy(null);
          if (!r.ok) setError(r.error);
        }}
        selectedFile={selectedFile}
        setSelectedFile={(path) => setSelectedFile({ path, stage: 'staged' })}
      />
      <CommitBox active={active} hasStaged={staged.length > 0} busy={busy} setBusy={setBusy} setError={setError} />
      <StatusSection
        title="Unstaged"
        sectionStage="unstaged"
        files={unstaged}
        emptyMessage={null}
        actionLabel="+"
        actionTitle="Stage"
        onAction={async (paths) => {
          setBusy('stage');
          const r = await window.api.git.stage({ ...active, paths });
          setBusy(null);
          if (!r.ok) setError(r.error);
        }}
        onDiscard={async (paths) => {
          setBusy('discard');
          const r = await window.api.git.discard({ ...active, paths, kind: 'tracked' });
          setBusy(null);
          if (!r.ok) setError(r.error);
        }}
        selectedFile={selectedFile}
        setSelectedFile={(path) => setSelectedFile({ path, stage: 'unstaged' })}
      />
      <StatusSection
        title="Untracked"
        sectionStage="untracked"
        files={untracked}
        emptyMessage={null}
        actionLabel="+"
        actionTitle="Stage"
        onAction={async (paths) => {
          setBusy('stage');
          const r = await window.api.git.stage({ ...active, paths });
          setBusy(null);
          if (!r.ok) setError(r.error);
        }}
        onDiscard={async (paths) => {
          setBusy('discard');
          const r = await window.api.git.discard({ ...active, paths, kind: 'untracked' });
          setBusy(null);
          if (!r.ok) setError(r.error);
        }}
        selectedFile={selectedFile}
        setSelectedFile={(path) => setSelectedFile({ path, stage: 'untracked' })}
      />
      {staged.length + unstaged.length + untracked.length === 0 && (
        <div className="git-view-clean fg-muted">Working tree clean.</div>
      )}
      <PushRow status={status} active={active} busy={busy} setBusy={setBusy} setError={setError} />
      <CommitList
        commits={commits}
        head={status.head}
        commitLimit={commitLimit}
        onLoadMore={onLoadMoreCommits}
        selectedCommit={selectedCommit}
        onToggleCommit={toggleCommit}
      />
      <WorktreeList
        projectId={active.projectId}
        active={active}
        refreshKey={worktreeRefreshKey}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branch bar
// ---------------------------------------------------------------------------

interface BranchBarProps {
  status: Extract<GitViewState, { kind: 'ready' }>['status'];
  branches: GitBranch[];
  active: ActiveSelection;
  isWorktreeTab: boolean;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
}

function BranchBar({ status, branches, active, isWorktreeTab, busy, setBusy, setError }: BranchBarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const locals = branches.filter((b) => !b.remote);
  const currentName = status.branch ?? '';
  const disableSwitch = isWorktreeTab;
  const switchTitle = isWorktreeTab
    ? "This tab is a worktree — its branch is pinned. Switch from the project's primary tab instead."
    : 'Switch to another branch';

  return (
    <div className="git-view-branchbar">
      {!creating ? (
        <>
          <select
            className="field-input"
            value={currentName}
            disabled={disableSwitch || busy !== null}
            title={switchTitle}
            onChange={async (e) => {
              const to = e.target.value;
              if (!to || to === currentName) return;
              setBusy('checkout');
              const r = await window.api.git.checkout({ ...active, branch: to });
              setBusy(null);
              if (!r.ok) setError(r.error);
            }}
          >
            {currentName === '' && <option value="">(detached)</option>}
            {locals.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
                {b.isCurrent ? ' ★' : ''}
              </option>
            ))}
          </select>
          <button
            className="git-view-btn"
            disabled={busy !== null}
            onClick={() => setCreating(true)}
            title="Create a new branch from HEAD"
          >
            new
          </button>
        </>
      ) : (
        <>
          <input
            autoFocus
            className="field-input"
            placeholder="new-branch-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
          />
          <button
            className="git-view-btn"
            disabled={busy !== null || newName.trim().length === 0}
            onClick={async () => {
              const name = newName.trim();
              setBusy('createBranch');
              const r = await window.api.git.createBranch({ ...active, name });
              setBusy(null);
              if (r.ok) {
                setCreating(false);
                setNewName('');
              } else {
                setError(r.error);
              }
            }}
          >
            create
          </button>
          <button
            className="git-view-btn"
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
          >
            cancel
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status section
// ---------------------------------------------------------------------------

interface StatusSectionProps {
  title: string;
  sectionStage: 'staged' | 'unstaged' | 'untracked';
  files: GitStatusFile[];
  emptyMessage: string | null;
  actionLabel: string;
  actionTitle: string;
  onAction: (paths: string[]) => void | Promise<void>;
  /** If set, a second per-row "discard" button appears. */
  onDiscard?: (paths: string[]) => void | Promise<void>;
  selectedFile: { path: string; stage: 'staged' | 'unstaged' | 'untracked' } | null;
  setSelectedFile: (path: string) => void;
}

function StatusSection({
  title,
  sectionStage,
  files,
  emptyMessage,
  actionLabel,
  actionTitle,
  onAction,
  onDiscard,
  selectedFile,
  setSelectedFile,
}: StatusSectionProps) {
  if (files.length === 0 && emptyMessage === null) return null;
  return (
    <div className="git-section">
      <div className="git-section-header">
        <span className="git-section-title">{title}</span>
        <span className="git-section-count">{files.length}</span>
        {files.length > 0 && (
          <button
            className="git-section-all"
            title={`${actionTitle} all ${title.toLowerCase()}`}
            onClick={() => void onAction(files.map((f) => f.path))}
          >
            {title === 'Staged' ? 'unstage all' : 'stage all'}
          </button>
        )}
      </div>
      {files.length === 0 ? (
        <div className="git-section-empty fg-muted">{emptyMessage}</div>
      ) : (
        <ul className="git-file-list">
          {files.map((f) => {
            const key = `${f.stage}:${f.path}`;
            const selected =
              selectedFile &&
              selectedFile.path === f.path &&
              selectedFile.stage === sectionStage;
            return (
              <li
                key={key}
                className={`git-file-row${selected ? ' selected' : ''}`}
                onClick={() => setSelectedFile(f.path)}
              >
                <span className={`git-change-badge change-${f.change}`} title={f.change}>
                  {changeBadge(f.change)}
                </span>
                <span className="git-file-path">{formatFilePath(f)}</span>
                {onDiscard && (
                  <button
                    className="git-file-action git-file-discard"
                    title={
                      sectionStage === 'untracked'
                        ? 'Delete this untracked file'
                        : 'Discard changes (restore from HEAD)'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      const msg =
                        sectionStage === 'untracked'
                          ? `Delete this untracked file?\n\n${f.path}\n\nThis cannot be undone.`
                          : `Discard your changes to this file?\n\n${f.path}\n\nThis cannot be undone.`;
                      if (window.confirm(msg)) void onDiscard([f.path]);
                    }}
                  >
                    ×
                  </button>
                )}
                <button
                  className="git-file-action"
                  title={actionTitle}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onAction([f.path]);
                  }}
                >
                  {actionLabel}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatFilePath(f: GitStatusFile): string {
  if (f.origPath && f.origPath !== f.path) return `${f.origPath} → ${f.path}`;
  return f.path;
}

function changeBadge(c: GitChangeKind): string {
  switch (c) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'typechange':
      return 'T';
    case 'untracked':
      return '?';
    case 'ignored':
      return '!';
    case 'conflicted':
      return 'U';
  }
}

// ---------------------------------------------------------------------------
// Commit box
// ---------------------------------------------------------------------------

interface CommitBoxProps {
  active: ActiveSelection;
  hasStaged: boolean;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
}

export function CommitBox({ active, hasStaged, busy, setBusy, setError }: CommitBoxProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const canCommit = hasStaged && subject.trim().length > 0 && busy === null;
  return (
    <div className="git-commit-box">
      <input
        className="field-input"
        placeholder="Commit subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={!hasStaged || busy !== null}
      />
      <textarea
        className="field-input git-commit-desc"
        placeholder="Description (optional)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={!hasStaged || busy !== null}
      />
      <button
        className="git-view-btn git-commit-btn"
        disabled={!canCommit}
        onClick={async () => {
          setBusy('commit');
          const r = await window.api.git.commit({
            ...active,
            subject: subject.trim(),
            description: description.trim() || undefined,
          });
          setBusy(null);
          if (r.ok) {
            setSubject('');
            setDescription('');
          } else {
            setError(r.error);
          }
        }}
      >
        {busy === 'commit' ? 'Committing…' : 'Commit'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Push row
// ---------------------------------------------------------------------------

interface PushRowProps {
  status: Extract<GitViewState, { kind: 'ready' }>['status'];
  active: ActiveSelection;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
}

function PushRow({ status, active, busy, setBusy, setError }: PushRowProps) {
  const noUpstream = !status.upstream;
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;
  const label = noUpstream
    ? 'Push (no upstream)'
    : ahead === 0 && behind === 0
      ? 'Push'
      : `Push (↑${ahead}${behind > 0 ? ` ↓${behind}` : ''})`;
  return (
    <div className="git-push-row">
      <button
        className="git-view-btn"
        disabled={busy !== null}
        onClick={async () => {
          setBusy('push');
          const r = await window.api.git.push(active);
          setBusy(null);
          if (!r.ok) {
            if (r.error.code === 'no-upstream') {
              setError({
                code: 'no-upstream',
                message: 'No upstream configured for the current branch.',
                stderr: r.error.stderr,
              });
            } else {
              setError(r.error);
            }
          }
        }}
      >
        {busy === 'push' ? 'Pushing…' : label}
      </button>
      {status.upstream && <span className="fg-muted git-push-upstream">→ {status.upstream}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commit list
// ---------------------------------------------------------------------------

function CommitList({
  commits,
  head,
  commitLimit,
  onLoadMore,
  selectedCommit,
  onToggleCommit,
}: {
  commits: GitCommit[];
  head: string | null;
  commitLimit: number;
  onLoadMore: () => void;
  selectedCommit: string | null;
  onToggleCommit: (hash: string) => void;
}) {
  const refsByCommit = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of commits) {
      if (c.refs.length > 0) m.set(c.hash, c.refs);
    }
    return m;
  }, [commits]);

  const graphRows = useMemo(() => layoutCommitGraph(commits), [commits]);
  const graphCols = useMemo(() => maxLane(graphRows) + 1, [graphRows]);
  const graphWidth = graphCols * GRAPH_LANE_WIDTH;

  if (commits.length === 0) {
    return (
      <div className="git-section">
        <div className="git-section-header">
          <span className="git-section-title">History</span>
        </div>
        <div className="git-section-empty fg-muted">No commits.</div>
      </div>
    );
  }
  return (
    <div className="git-section">
      <div className="git-section-header">
        <span className="git-section-title">History</span>
        <span className="git-section-count">{commits.length}</span>
      </div>
      <ul className="git-commit-list">
        {commits.map((c, i) => {
          const refs = refsByCommit.get(c.hash) ?? [];
          const isHead = head !== null && c.hash.startsWith(head);
          const selected = selectedCommit === c.hash;
          return (
            <li
              key={c.hash}
              className={`git-commit-row${isHead ? ' head' : ''}${selected ? ' selected' : ''}`}
              title={c.hash}
              onClick={() => onToggleCommit(c.hash)}
            >
              <GraphCell row={graphRows[i]} width={graphWidth} isHead={isHead} />
              <span className="git-commit-hash">{c.shortHash}</span>
              {refs.map((r) => (
                <span key={r} className="git-commit-ref">
                  {r}
                </span>
              ))}
              <span className="git-commit-subject">{c.subject}</span>
              <span className="git-commit-meta">
                {c.authorName} · {relativeTime(c.authorTime)}
              </span>
            </li>
          );
        })}
        {commits.length >= commitLimit && (
          <li className="git-commit-loadmore">
            <button className="link-btn" onClick={onLoadMore}>
              Load older commits…
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function GraphCell({
  row,
  width,
  isHead,
}: {
  row: GraphRow | undefined;
  width: number;
  isHead: boolean;
}) {
  if (!row) return <span className="git-graph-cell" style={{ width }} />;
  const height = GRAPH_ROW_HEIGHT;
  const mid = height / 2;
  const laneX = (lane: number) => lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2;
  const lines: JSX.Element[] = [];
  let key = 0;

  // Pass-through lanes (not the node lane): vertical rail through the row.
  for (let i = 0; i < Math.max(row.lanesIn.length, row.lanesOut.length); i++) {
    if (i === row.nodeLane) continue;
    const hasIn = row.lanesIn[i] != null;
    const hasOut = i < row.lanesOut.length && row.lanesOut[i] != null;
    if (hasIn && hasOut) {
      lines.push(
        <line
          key={`pt-${key++}`}
          x1={laneX(i)}
          y1={0}
          x2={laneX(i)}
          y2={height}
          stroke={laneColor(i)}
          strokeWidth={1.5}
        />,
      );
    } else if (hasIn) {
      // Terminating branch — halt at the middle row.
      lines.push(
        <line
          key={`term-${key++}`}
          x1={laneX(i)}
          y1={0}
          x2={laneX(i)}
          y2={mid}
          stroke={laneColor(i)}
          strokeWidth={1.5}
        />,
      );
    } else if (hasOut) {
      // New branch originating mid-row — drawn from middle to bottom.
      lines.push(
        <line
          key={`start-${key++}`}
          x1={laneX(i)}
          y1={mid}
          x2={laneX(i)}
          y2={height}
          stroke={laneColor(i)}
          strokeWidth={1.5}
        />,
      );
    }
  }

  // Node lane: incoming from top (if any), node circle, outgoing segments to
  // each parent's lane at the bottom.
  const nodeColor = laneColor(row.nodeLane);
  if (row.lanesIn[row.nodeLane] != null) {
    lines.push(
      <line
        key={`in-${key++}`}
        x1={laneX(row.nodeLane)}
        y1={0}
        x2={laneX(row.nodeLane)}
        y2={mid}
        stroke={nodeColor}
        strokeWidth={1.5}
      />,
    );
  }
  for (const edge of row.parentEdges) {
    lines.push(
      <line
        key={`par-${key++}`}
        x1={laneX(row.nodeLane)}
        y1={mid}
        x2={laneX(edge.toLane)}
        y2={height}
        stroke={laneColor(edge.toLane)}
        strokeWidth={1.5}
      />,
    );
  }

  return (
    <svg className="git-graph-cell" width={width} height={height}>
      {lines}
      <circle
        cx={laneX(row.nodeLane)}
        cy={mid}
        r={GRAPH_NODE_RADIUS}
        fill={isHead ? 'var(--accent)' : nodeColor}
        stroke={isHead ? 'var(--fg)' : 'var(--bg-sidebar)'}
        strokeWidth={isHead ? 2 : 1}
      />
    </svg>
  );
}

function relativeTime(epochSeconds: number): string {
  const now = Date.now() / 1000;
  const d = Math.max(0, now - epochSeconds);
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  if (d < 30 * 86400) return `${Math.round(d / 86400)}d ago`;
  const dt = new Date(epochSeconds * 1000);
  return dt.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Diff pane
// ---------------------------------------------------------------------------

export function DiffView({
  active,
  file,
  commit,
  onClose,
}: {
  active: ActiveSelection;
  file: { path: string; stage: 'staged' | 'unstaged' | 'untracked' };
  /** When set, fetch the per-file diff introduced by this commit instead of
   *  the working-tree diff. The `stage` on `file` is ignored. */
  commit?: string;
  onClose?: () => void;
}) {
  const [diff, setDiff] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const projectId = active.projectId;
  const worktreeId = active.worktreeId ?? null;
  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    setBinary(false);
    setErr(null);
    void window.api.git
      .diff({ projectId, worktreeId, path: file.path, stage: file.stage, commit })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setDiff(r.diff);
          setBinary(r.binary);
        } else {
          setErr(r.stderr ?? r.reason);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreeId, file.path, file.stage, commit]);

  // Close on Escape.
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const rows = useMemo(() => (diff ? parseUnifiedDiff(diff) : []), [diff]);

  return (
    <div className="git-diff-view">
      <div className="git-diff-pane-header">
        <span className="git-diff-path">{file.path}</span>
        <span className="fg-muted">({commit ? `@ ${commit.slice(0, 7)}` : file.stage})</span>
        {onClose && (
          <button className="git-diff-close" onClick={onClose} title="Close diff (Esc)">
            ×
          </button>
        )}
      </div>
      {err ? (
        <div className="fg-muted" style={{ padding: 8 }}>
          diff unavailable: {err}
        </div>
      ) : binary ? (
        <div className="fg-muted" style={{ padding: 8 }}>
          Binary file — diff preview not available.
        </div>
      ) : diff === null ? (
        <div className="fg-muted" style={{ padding: 8 }}>
          Loading diff…
        </div>
      ) : rows.length === 0 ? (
        <div className="fg-muted" style={{ padding: 8 }}>
          No changes.
        </div>
      ) : (
        <div className="git-diff-body">
          {rows.map((r, i) => (
            <DiffRow key={i} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

interface DiffLineRow {
  kind: 'add' | 'del' | 'ctx' | 'hunk' | 'meta';
  oldLine?: number;
  newLine?: number;
  content: string;
}

function parseUnifiedDiff(diff: string): DiffLineRow[] {
  const rows: DiffLineRow[] = [];
  const lines = diff.split('\n');
  let oldLine = 0;
  let newLine = 0;
  let started = false; // only emit rows once we've seen the first @@
  for (const line of lines) {
    if (line.startsWith('@@')) {
      started = true;
      // @@ -oldStart,oldCount +newStart,newCount @@
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      rows.push({ kind: 'hunk', content: line });
      continue;
    }
    if (!started) continue;
    if (line.startsWith('+++') || line.startsWith('---')) {
      // File headers inside the hunk region (rare, but skip).
      continue;
    }
    if (line.startsWith('\\')) {
      // "\ No newline at end of file"
      rows.push({ kind: 'meta', content: line });
      continue;
    }
    if (line.startsWith('+')) {
      rows.push({ kind: 'add', newLine: newLine++, content: line.slice(1) });
    } else if (line.startsWith('-')) {
      rows.push({ kind: 'del', oldLine: oldLine++, content: line.slice(1) });
    } else {
      // Context line ( leading space ) OR the `diff --no-index` case where
      // untracked-file lines have no prefix at all after the first @@.
      const content = line.startsWith(' ') ? line.slice(1) : line;
      rows.push({ kind: 'ctx', oldLine: oldLine++, newLine: newLine++, content });
    }
  }
  return rows;
}

function DiffRow({ row }: { row: DiffLineRow }) {
  if (row.kind === 'hunk') {
    return <div className="diff-row diff-hunk-row">{row.content}</div>;
  }
  if (row.kind === 'meta') {
    return <div className="diff-row diff-meta-row">{row.content}</div>;
  }
  const sign = row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' ';
  return (
    <div className={`diff-row diff-${row.kind}-row`}>
      <span className="diff-lineno diff-lineno-old">{row.oldLine ?? ''}</span>
      <span className="diff-lineno diff-lineno-new">{row.newLine ?? ''}</span>
      <span className="diff-sign">{sign}</span>
      <span className="diff-content">{row.content || ' '}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commit view (commit detail + per-file diff)
// ---------------------------------------------------------------------------

export function CommitView({
  active,
  commit,
  onClose,
}: {
  active: ActiveSelection;
  commit: string;
  onClose?: () => void;
}) {
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);
  const [files, setFiles] = useState<GitCommitFile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const projectId = active.projectId;
  const worktreeId = active.worktreeId ?? null;

  // Reset the in-pane file selection whenever the commit or tab changes.
  useEffect(() => {
    setSelectedPath(null);
  }, [projectId, worktreeId, commit]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setFiles(null);
    setErr(null);
    void window.api.git
      .showCommit({ projectId, worktreeId, commit })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setDetail(r.commit);
          setFiles(r.files);
        } else {
          setErr(r.stderr ?? r.reason);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreeId, commit]);

  // Close on Escape.
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const selectedFile = useMemo(
    () => (selectedPath && files ? files.find((f) => f.path === selectedPath) ?? null : null),
    [selectedPath, files],
  );

  const firstLine = detail?.message.split('\n', 1)[0] ?? '';
  const bodyLines = detail?.message.split('\n').slice(1) ?? [];
  // Trim leading blank line that sits between subject and body.
  const body = bodyLines.join('\n').replace(/^\n+/, '');

  return (
    <div className="git-diff-view git-commit-view">
      <div className="git-diff-pane-header">
        <span className="git-diff-path">
          commit {detail ? detail.hash.slice(0, 7) : commit.slice(0, 7)}
        </span>
        {detail && <span className="fg-muted">· {detail.authorName}</span>}
        {onClose && (
          <button className="git-diff-close" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        )}
      </div>
      {err ? (
        <div className="fg-muted" style={{ padding: 8 }}>
          commit unavailable: {err}
        </div>
      ) : !detail || !files ? (
        <div className="fg-muted" style={{ padding: 8 }}>
          Loading commit…
        </div>
      ) : (
        <div className="git-commit-body">
          <div className="git-commit-meta-block">
            <div className="git-commit-hash-full" title={detail.hash}>
              {detail.hash}
            </div>
            <div className="git-commit-author">
              <span>{detail.authorName}</span>
              {detail.authorEmail && <span className="fg-muted"> &lt;{detail.authorEmail}&gt;</span>}
              {detail.authorDate && (
                <span className="fg-muted git-commit-date">
                  {' · '}
                  {formatCommitDate(detail.authorDate)}
                </span>
              )}
            </div>
            <div className="git-commit-subject-full">{firstLine}</div>
            {body && <pre className="git-commit-message-body">{body}</pre>}
          </div>
          <div className="git-commit-files">
            <div className="git-section-header">
              <span className="git-section-title">Files</span>
              <span className="git-section-count">{files.length}</span>
            </div>
            {files.length === 0 ? (
              <div className="git-section-empty fg-muted">No files changed.</div>
            ) : (
              <ul className="git-file-list">
                {files.map((f) => {
                  const key = f.path;
                  const sel = selectedPath === f.path;
                  return (
                    <li
                      key={key}
                      className={`git-file-row${sel ? ' selected' : ''}`}
                      onClick={() => setSelectedPath(sel ? null : f.path)}
                      title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                    >
                      <span
                        className={`git-change-badge change-${f.kind}`}
                        title={f.kind}
                      ></span>
                      <span className="git-file-path">
                        {f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selectedFile && (
            <div className="git-commit-diff-region">
              <DiffView
                active={active}
                file={{
                  path: selectedFile.path,
                  // `stage` is ignored when `commit` is set, but the type
                  // requires a value. 'staged' is a harmless placeholder.
                  stage: 'staged',
                }}
                commit={detail.hash}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatCommitDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

