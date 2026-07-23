import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ActiveSelection } from '@shared/types';
import type { GitBranch, GitError, GitStashEntry } from '@shared/git';
import type { GitRepoEntry, GitTabRef } from '@shared/ipc';
import { useGitView, type GitViewState } from '../hooks/useGitView';
import { useStore } from '../store';
import { WorktreeList } from './WorktreeList';
import {
  CommitBox,
  CommitList,
  CommitView,
  DiffView,
  StashesSection,
  StashView,
  StatusSection,
} from './GitView';

interface Props {
  active: ActiveSelection | null;
  /** True when the active tab is a worktree — its branch is pinned. */
  isWorktreeTab: boolean;
}

/** What the center graph / right detail pane is focused on. */
type Selection =
  | { t: 'working' }
  | { t: 'commit'; hash: string }
  | { t: 'stash'; entry: GitStashEntry };

/**
 * Full-page, GitKraken-style git client. Three panes: a left rail (branches,
 * remotes, stashes, worktrees), a center commit graph, and a right detail pane
 * whose content follows the current selection (staging area, commit detail, or
 * stash detail).
 */
export function GitClient({ active, isWorktreeTab }: Props) {
  // Git errors surface as native popup dialogs rather than an inline banner —
  // they hold the full stderr and stay until dismissed. The signature matches
  // the `setError` prop the shared sub-views already expect.
  const setError = (e: GitError | null) => {
    if (e) window.alert(e.stderr ? `${e.message}\n\n${e.stderr.trim()}` : e.message);
  };

  // Multi-repo: a folder that isn't itself a repo but groups sibling repos.
  const [repos, setRepos] = useState<GitRepoEntry[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  useEffect(() => {
    if (!active) {
      setRepos([]);
      setSelectedRepo(null);
      return;
    }
    let cancelled = false;
    setSelectedRepo(null); // default to the overview when a folder has repos
    void window.api.git.listRepos(active).then((r) => {
      if (!cancelled) setRepos(r.ok ? r.repos : []);
    });
    return () => {
      cancelled = true;
    };
  }, [active?.projectId, active?.worktreeId, active]);

  const multiRepo = repos.length > 0;
  const overview = multiRepo && !selectedRepo;
  // Memoize so the ref keeps a stable identity across renders — useGitView's
  // effect keys on it, and a fresh object every render would loop forever.
  const ref = useMemo<GitTabRef | null>(
    () =>
      active
        ? { ...active, repoPath: multiRepo ? (selectedRepo ?? undefined) : undefined }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active?.projectId, active?.worktreeId, multiRepo, selectedRepo],
  );

  // In overview mode there's no single repo to load — skip the scoped fetch.
  const { state, refresh, loadMoreCommits, commitLimit } = useGitView(overview ? null : ref);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection>({ t: 'working' });
  const [wipFile, setWipFile] = useState<
    { path: string; stage: 'staged' | 'unstaged' | 'untracked' } | null
  >(null);

  const [worktreeRefreshKey, bumpWorktreeRefresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    bumpWorktreeRefresh();
  }, [state]);

  // Reset transient state when the target repo/tab changes.
  useEffect(() => {
    setBusy(null);
    setSel({ t: 'working' });
    setWipFile(null);
  }, [active?.projectId, active?.worktreeId, selectedRepo]);

  // If the selected commit / stash disappears after a refresh, fall back to the
  // working tree so the right pane never dangles on a dead ref.
  const ready = state.kind === 'ready' ? state : null;
  useEffect(() => {
    if (!ready) return;
    if (sel.t === 'commit' && !ready.commits.some((c) => c.hash === sel.hash)) {
      setSel({ t: 'working' });
    } else if (sel.t === 'stash' && !ready.stashes.some((s) => s.sha === sel.entry.sha)) {
      setSel({ t: 'working' });
    }
  }, [ready, sel]);

  if (!active || !ref) {
    return <div className="git-client git-client-empty">No project selected.</div>;
  }

  const runOp = async (label: string, fn: () => Promise<{ ok: boolean; error?: GitError }>) => {
    setBusy(label);
    const r = await fn();
    setBusy(null);
    if (!r.ok && r.error) setError(r.error);
  };

  const repoName = selectedRepo ? repos.find((r) => r.path === selectedRepo)?.name ?? null : null;
  const repoSwitcher = multiRepo ? (
    <RepoSwitcher repos={repos} selected={selectedRepo} onSelect={setSelectedRepo} />
  ) : null;

  return (
    <div className="git-client">
      <div className="git-client-titlebar" />
      <Toolbar
        state={state}
        active={ref}
        isWorktreeTab={isWorktreeTab}
        busy={busy}
        onRefresh={refresh}
        runOp={runOp}
        overview={overview}
        repoName={repoName}
        repoCount={repos.length}
      />
      {overview ? (
        <div className="git-client-panes">
          <div className="git-rail">{repoSwitcher}</div>
          <Overview repos={repos} projectId={active.projectId} onSelectRepo={setSelectedRepo} />
        </div>
      ) : state.kind !== 'ready' ? (
        <div className="git-client-panes">
          {repoSwitcher && <div className="git-rail">{repoSwitcher}</div>}
          <NonReady state={state} />
        </div>
      ) : (
        <div className="git-client-panes">
          <LeftRail
            state={state}
            active={ref}
            worktreeActive={active}
            isWorktreeTab={isWorktreeTab}
            showWorktrees={!multiRepo}
            header={repoSwitcher}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            runOp={runOp}
            sel={sel}
            onPreviewBranch={(b) => {
              // Preview a branch's history without checking it out: jump to its
              // tip commit in the graph. `--all` means every branch tip is
              // already loaded, so we just locate and select it.
              const tip = state.commits.find((c) => c.refs.includes(b.name));
              if (tip) {
                setWipFile(null);
                setSel({ t: 'commit', hash: tip.hash });
              }
            }}
            onSelectStash={(entry) => {
              setWipFile(null);
              setSel((cur) =>
                cur.t === 'stash' && cur.entry.sha === entry.sha ? { t: 'working' } : { t: 'stash', entry },
              );
            }}
            worktreeRefreshKey={worktreeRefreshKey}
          />
          <CenterGraph
            state={state}
            sel={sel}
            onSelectWorking={() => {
              setWipFile(null);
              setSel({ t: 'working' });
            }}
            onSelectCommit={(hash) => {
              setWipFile(null);
              setSel((cur) =>
                cur.t === 'commit' && cur.hash === hash ? { t: 'working' } : { t: 'commit', hash },
              );
            }}
            commitLimit={commitLimit}
            onLoadMore={loadMoreCommits}
          />
          <RightPane
            active={ref}
            state={state}
            sel={sel}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            wipFile={wipFile}
            setWipFile={setWipFile}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Repo switcher (multi-repo folders)
// ---------------------------------------------------------------------------

function RepoSwitcher({
  repos,
  selected,
  onSelect,
}: {
  repos: GitRepoEntry[];
  selected: string | null;
  onSelect: (path: string | null) => void;
}) {
  return (
    <div className="git-rail-section git-repo-switcher">
      <div className="git-rail-head">
        <span className="git-rail-title">Repositories</span>
        <span className="git-rail-count">{repos.length}</span>
      </div>
      <ul className="git-rail-list">
        <li
          className={`git-rail-item git-repo-item${selected === null ? ' current' : ''}`}
          onClick={() => onSelect(null)}
        >
          <span className="git-branch-glyph">▤</span>
          <span className="git-branch-name">All repos</span>
        </li>
        {repos.map((r) => (
          <li
            key={r.path}
            className={`git-rail-item git-repo-item${selected === r.path ? ' current' : ''}`}
            title={r.path}
            onClick={() => onSelect(r.path)}
          >
            <span className="git-branch-glyph">◆</span>
            <span className="git-branch-name">{r.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// All-repos overview
// ---------------------------------------------------------------------------

interface RepoRow {
  branch: string | null;
  detached: boolean;
  dirty: number;
  ahead: number;
  behind: number;
}

function Overview({
  repos,
  projectId,
  onSelectRepo,
}: {
  repos: GitRepoEntry[];
  projectId: string;
  onSelectRepo: (path: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, RepoRow | null>>({});
  const [busyAll, setBusyAll] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [target, setTarget] = useState('');

  const load = useCallback(async () => {
    const entries = await Promise.all(
      repos.map(async (r) => {
        const s = await window.api.git.status({ projectId, repoPath: r.path });
        const row: RepoRow | null = s.ok
          ? {
              branch: s.status.branch,
              detached: s.status.detached,
              dirty: s.status.files.length,
              ahead: s.status.ahead ?? 0,
              behind: s.status.behind ?? 0,
            }
          : null;
        return [r.path, row] as const;
      }),
    );
    setRows(Object.fromEntries(entries));
  }, [repos, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const branches = repos.map((r) => rows[r.path]?.branch).filter((b): b is string => !!b);
  const uniformBranch =
    branches.length === repos.length && new Set(branches).size === 1 ? branches[0] : null;

  const forEach = async (label: string, fn: (r: GitRepoEntry) => Promise<{ ok: boolean; error?: GitError }>) => {
    setBusyAll(label);
    const failures: string[] = [];
    for (const r of repos) {
      const res = await fn(r);
      if (!res.ok && res.error) failures.push(`${r.name}: ${res.error.message}`);
    }
    setBusyAll(null);
    void load();
    if (failures.length) window.alert(`Some repos failed:\n\n${failures.join('\n')}`);
  };

  const submitSwitch = async () => {
    const branch = target.trim();
    if (!branch) return;
    setSwitching(false);
    await forEach('switch', (r) => window.api.git.checkout({ projectId, repoPath: r.path, branch }));
  };

  return (
    <div className="git-overview">
      <div className="git-overview-bar">
        <button
          className="gct-btn"
          disabled={busyAll !== null}
          onClick={() => void forEach('fetch', (r) => window.api.git.fetch({ projectId, repoPath: r.path }))}
        >
          {busyAll === 'fetch' ? 'Fetching…' : 'Fetch all'}
        </button>
        <button
          className="gct-btn"
          disabled={busyAll !== null}
          onClick={() => void forEach('pull', (r) => window.api.git.pull({ projectId, repoPath: r.path }))}
        >
          {busyAll === 'pull' ? 'Pulling…' : 'Pull all'}
        </button>
        {!switching ? (
          <button
            className="gct-btn"
            disabled={busyAll !== null}
            onClick={() => {
              setTarget(uniformBranch ?? '');
              setSwitching(true);
            }}
          >
            {busyAll === 'switch' ? 'Switching…' : 'Switch all…'}
          </button>
        ) : (
          <span className="git-overview-switch">
            <input
              autoFocus
              className="field-input"
              placeholder="branch name"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitSwitch();
                if (e.key === 'Escape') setSwitching(false);
              }}
            />
            <button className="gct-btn gct-btn-primary" onClick={() => void submitSwitch()}>
              Switch
            </button>
            <button className="gct-btn" onClick={() => setSwitching(false)}>
              cancel
            </button>
          </span>
        )}
        {uniformBranch && <span className="fg-muted git-overview-uniform">all on {uniformBranch}</span>}
      </div>
      <div className="git-overview-list">
        {repos.map((r) => {
          const s = rows[r.path];
          const loaded = r.path in rows;
          return (
            <button className="git-overview-row" key={r.path} onClick={() => onSelectRepo(r.path)}>
              <span className="gor-name">{r.name}</span>
              <span className="gor-branch">
                {!loaded ? '…' : !s ? 'not a repo' : s.detached ? 'detached' : s.branch ?? '—'}
              </span>
              <span className={`gor-state ${s && s.dirty > 0 ? 'dirty' : 'clean'}`}>
                {!s ? '' : s.dirty > 0 ? `● ${s.dirty} change${s.dirty > 1 ? 's' : ''}` : '✓ clean'}
              </span>
              <span className="gor-track">
                {s && s.ahead > 0 ? `↑${s.ahead}` : ''}
                {s && s.behind > 0 ? ` ↓${s.behind}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NonReady({ state }: { state: GitViewState }) {
  if (state.kind === 'git-missing') {
    return (
      <div className="git-client-notice">
        <strong>git binary not found on PATH.</strong>
        <p>Install git and relaunch Dash to enable Source Control.</p>
      </div>
    );
  }
  if (state.kind === 'not-a-repo') {
    return <div className="git-client-notice fg-muted">This directory is not a git repository.</div>;
  }
  if (state.kind === 'error') {
    return <div className="git-client-notice fg-muted">Error: {state.message}</div>;
  }
  return <div className="git-client-notice fg-muted">Loading…</div>;
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface ToolbarProps {
  state: GitViewState;
  active: GitTabRef;
  isWorktreeTab: boolean;
  busy: string | null;
  onRefresh: () => void;
  runOp: (label: string, fn: () => Promise<{ ok: boolean; error?: GitError }>) => Promise<void>;
  overview: boolean;
  repoName: string | null;
  repoCount: number;
}

function Toolbar({ state, active, busy, onRefresh, runOp, overview, repoName, repoCount }: ToolbarProps) {
  const projectName = useStore(
    (s) => s.projects.find((p) => p.id === active.projectId)?.name ?? '',
  );
  if (overview) {
    return (
      <div className="git-client-toolbar">
        <div className="gct-identity">
          <span className="gct-repo">{projectName}</span>
          <span className="gct-branch">
            {repoCount} {repoCount === 1 ? 'repository' : 'repositories'}
          </span>
        </div>
      </div>
    );
  }
  const status = state.kind === 'ready' ? state.status : null;
  const branchLabel = status
    ? status.detached
      ? `detached @ ${status.head ?? '—'}`
      : (status.branch ?? '—')
    : state.kind === 'loading'
      ? '…'
      : state.kind === 'not-a-repo'
        ? 'not a repository'
        : state.kind === 'git-missing'
          ? 'git not found'
          : 'git';
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const disabled = state.kind !== 'ready' || busy !== null;

  return (
    <div className="git-client-toolbar">
      <div className="gct-identity">
        <span className="gct-repo">{repoName ? `${projectName} / ${repoName}` : projectName}</span>
        <span className="gct-branch" title="Current branch">
          <span className="gct-branch-icon">⎇</span>
          {branchLabel}
        </span>
        {status && (ahead > 0 || behind > 0) && (
          <span className="gct-tracking" title={`${ahead} ahead, ${behind} behind upstream`}>
            {ahead > 0 && <span className="gct-ahead">↑{ahead}</span>}
            {behind > 0 && <span className="gct-behind">↓{behind}</span>}
          </span>
        )}
      </div>
      <div className="gct-actions">
        <button
          className="gct-btn"
          disabled={disabled}
          title="git fetch --all --prune"
          onClick={() => void runOp('fetch', () => window.api.git.fetch(active))}
        >
          {busy === 'fetch' ? 'Fetching…' : 'Fetch'}
        </button>
        <button
          className="gct-btn"
          disabled={disabled || !status?.upstream}
          title={status?.upstream ? `Pull from ${status.upstream}` : 'No upstream configured'}
          onClick={() => void runOp('pull', () => window.api.git.pull(active))}
        >
          {busy === 'pull' ? 'Pulling…' : `Pull${behind > 0 ? ` ↓${behind}` : ''}`}
        </button>
        <button
          className="gct-btn gct-btn-primary"
          disabled={disabled}
          title={status?.upstream ? `Push to ${status.upstream}` : 'Push (sets upstream)'}
          onClick={() =>
            void runOp('push', async () => {
              const r = await window.api.git.push(active);
              return r;
            })
          }
        >
          {busy === 'push' ? 'Pushing…' : `Push${ahead > 0 ? ` ↑${ahead}` : ''}`}
        </button>
        {ahead > 0 && behind > 0 && (
          <button
            className="gct-btn"
            disabled={disabled}
            title="Force push with lease (won't clobber others' commits)"
            onClick={() => {
              if (!window.confirm(`Force-push ${status?.upstream ?? 'upstream'} with lease? This rewrites remote history.`)) return;
              void runOp('push', () => window.api.git.pushForce(active));
            }}
          >
            {busy === 'push' ? 'Pushing…' : 'Force ↑'}
          </button>
        )}
        <button
          className="gct-btn gct-btn-icon"
          title="Refresh"
          disabled={state.kind !== 'ready'}
          onClick={onRefresh}
        >
          ↻
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left rail — branches, remotes, stashes, worktrees
// ---------------------------------------------------------------------------

interface RailProps {
  state: Extract<GitViewState, { kind: 'ready' }>;
  active: GitTabRef;
  /** The tab selection (no repoPath) — worktrees are a project/tab concept. */
  worktreeActive: ActiveSelection;
  isWorktreeTab: boolean;
  /** Hidden in multi-repo folders, where the project itself isn't a repo. */
  showWorktrees: boolean;
  /** Optional node rendered at the top of the rail (the repo switcher). */
  header?: ReactNode;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
  runOp: (label: string, fn: () => Promise<{ ok: boolean; error?: GitError }>) => Promise<void>;
  sel: Selection;
  onPreviewBranch: (b: GitBranch) => void;
  onSelectStash: (entry: GitStashEntry) => void;
  worktreeRefreshKey: number;
}

interface BranchMenu {
  x: number;
  y: number;
  branch: GitBranch;
}

function LeftRail({
  state,
  active,
  worktreeActive,
  isWorktreeTab,
  showWorktrees,
  header,
  busy,
  setBusy,
  setError,
  runOp,
  sel,
  onPreviewBranch,
  onSelectStash,
  worktreeRefreshKey,
}: RailProps) {
  const { status, branches, stashes } = state;
  const [menu, setMenu] = useState<BranchMenu | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const locals = branches.filter((b) => !b.remote);
  const remotes = branches.filter((b) => b.remote);
  const currentName = status.branch ?? '';

  const checkout = (ref: string) =>
    runOp('checkout', () => window.api.git.checkout({ ...active, branch: ref }));
  const merge = (ref: string) =>
    runOp('merge', () => window.api.git.merge({ ...active, branch: ref }));
  const del = (name: string, force: boolean) =>
    runOp('deleteBranch', () => window.api.git.deleteBranch({ ...active, name, force }));

  const onDelete = async (b: GitBranch) => {
    if (!window.confirm(`Delete branch "${b.name}"?`)) return;
    setBusy('deleteBranch');
    const r = await window.api.git.deleteBranch({ ...active, name: b.name, force: false });
    setBusy(null);
    if (!r.ok) {
      if (r.error.code === 'unmerged') {
        if (window.confirm(`"${b.name}" is not fully merged. Force-delete anyway?`)) {
          void del(b.name, true);
        }
        return;
      }
      setError(r.error);
    }
  };

  return (
    <div className="git-rail">
      {header}
      {/* Branches */}
      <div className="git-rail-section">
        <div className="git-rail-head">
          <span className="git-rail-title">Branches</span>
          {!creating && (
            <button
              className="git-rail-add"
              title="New branch from HEAD"
              disabled={busy !== null}
              onClick={() => setCreating(true)}
            >
              +
            </button>
          )}
        </div>
        {creating && (
          <div className="git-rail-newbranch">
            <input
              autoFocus
              className="field-input"
              placeholder="new-branch-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                }
                if (e.key === 'Enter' && newName.trim()) {
                  const name = newName.trim();
                  setBusy('createBranch');
                  const r = await window.api.git.createBranch({ ...active, name });
                  setBusy(null);
                  if (r.ok) {
                    setCreating(false);
                    setNewName('');
                  } else setError(r.error);
                }
              }}
            />
          </div>
        )}
        <ul className="git-rail-list">
          {locals.map((b) => (
            <li
              key={b.name}
              className={`git-rail-item git-branch-item${b.isCurrent ? ' current' : ''}`}
              title={`Click to preview ${b.name}`}
              onClick={() => onPreviewBranch(b)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, branch: b });
              }}
            >
              <span className="git-branch-glyph">⎇</span>
              <span className="git-branch-name">{b.name}</span>
              {b.isCurrent ? (
                <span className="git-branch-badge">HEAD</span>
              ) : (
                <span className="git-branch-actions">
                  {!isWorktreeTab && (
                    <button
                      className="git-branch-btn"
                      title={`Checkout ${b.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void checkout(b.name);
                      }}
                    >
                      checkout
                    </button>
                  )}
                  <button
                    className="git-branch-btn"
                    title={`Merge ${b.name} into ${currentName || 'HEAD'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void merge(b.name);
                    }}
                  >
                    merge
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Remotes */}
      {remotes.length > 0 && (
        <div className="git-rail-section">
          <div className="git-rail-head">
            <span className="git-rail-title">Remotes</span>
            <span className="git-rail-count">{remotes.length}</span>
          </div>
          <ul className="git-rail-list">
            {remotes.map((b) => (
              <li
                key={b.name}
                className="git-rail-item git-branch-item remote"
                title={`Click to preview ${b.name}`}
                onClick={() => onPreviewBranch(b)}
              >
                <span className="git-branch-glyph">☁</span>
                <span className="git-branch-name">{b.name}</span>
                {!isWorktreeTab && (
                  <span className="git-branch-actions">
                    <button
                      className="git-branch-btn"
                      title={`Checkout ${b.name} (creates a tracking branch)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void checkout(b.name);
                      }}
                    >
                      checkout
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stashes — reuse the existing section, but drive selection into the
          right pane instead of the store overlay. */}
      <StashesSection
        stashes={stashes}
        active={active}
        hasChanges={status.files.length > 0}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        selectedStash={sel.t === 'stash' ? { ref: sel.entry.ref, sha: sel.entry.sha } : null}
        onToggleStash={onSelectStash}
      />

      {/* Worktrees — a project/tab concept; hidden for multi-repo folders. */}
      {showWorktrees && (
        <div className="git-rail-section">
          <div className="git-rail-head">
            <span className="git-rail-title">Worktrees</span>
          </div>
          <WorktreeList
            projectId={worktreeActive.projectId}
            active={worktreeActive}
            refreshKey={worktreeRefreshKey}
          />
        </div>
      )}

      {menu &&
        createPortal(
          <div
            className="context-menu"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {!menu.branch.isCurrent && !isWorktreeTab && (
              <button
                onClick={() => {
                  void checkout(menu.branch.name);
                  setMenu(null);
                }}
              >
                Checkout
              </button>
            )}
            {!menu.branch.isCurrent && (
              <button
                onClick={() => {
                  void merge(menu.branch.name);
                  setMenu(null);
                }}
              >
                Merge into {currentName || 'HEAD'}
              </button>
            )}
            {!menu.branch.isCurrent && (
              <button
                className="danger"
                onClick={() => {
                  void onDelete(menu.branch);
                  setMenu(null);
                }}
              >
                Delete branch
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Center — commit graph with a working-tree row on top
// ---------------------------------------------------------------------------

function CenterGraph({
  state,
  sel,
  onSelectWorking,
  onSelectCommit,
  commitLimit,
  onLoadMore,
}: {
  state: Extract<GitViewState, { kind: 'ready' }>;
  sel: Selection;
  onSelectWorking: () => void;
  onSelectCommit: (hash: string) => void;
  commitLimit: number;
  onLoadMore: () => void;
}) {
  const { status, commits } = state;
  const changeCount = status.files.length;
  return (
    <div className="git-center">
      <div
        className={`git-wip-row${sel.t === 'working' ? ' selected' : ''}`}
        onClick={onSelectWorking}
      >
        <span className="git-wip-node" aria-hidden="true" />
        <span className="git-wip-title">Uncommitted changes</span>
        {changeCount > 0 ? (
          <span className="git-wip-count">{changeCount}</span>
        ) : (
          <span className="git-wip-clean fg-muted">clean</span>
        )}
      </div>
      <CommitList
        commits={commits}
        head={status.head}
        commitLimit={commitLimit}
        onLoadMore={onLoadMore}
        selectedCommit={sel.t === 'commit' ? sel.hash : null}
        onToggleCommit={onSelectCommit}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right — contextual detail pane
// ---------------------------------------------------------------------------

interface RightProps {
  active: GitTabRef;
  state: Extract<GitViewState, { kind: 'ready' }>;
  sel: Selection;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
  wipFile: { path: string; stage: 'staged' | 'unstaged' | 'untracked' } | null;
  setWipFile: (
    f: { path: string; stage: 'staged' | 'unstaged' | 'untracked' } | null,
  ) => void;
}

function RightPane({ active, state, sel, busy, setBusy, setError, wipFile, setWipFile }: RightProps) {
  if (sel.t === 'commit') {
    return (
      <div className="git-detail">
        <CommitView active={active} commit={sel.hash} />
      </div>
    );
  }
  if (sel.t === 'stash') {
    return (
      <div className="git-detail">
        <StashView
          active={active}
          ref={sel.entry.ref}
          sha={sel.entry.sha}
          branch={sel.entry.branch}
          message={sel.entry.message}
          time={sel.entry.time}
        />
      </div>
    );
  }
  return (
    <StagingPane
      active={active}
      state={state}
      busy={busy}
      setBusy={setBusy}
      setError={setError}
      wipFile={wipFile}
      setWipFile={setWipFile}
    />
  );
}

function StagingPane({
  active,
  state,
  busy,
  setBusy,
  setError,
  wipFile,
  setWipFile,
}: Omit<RightProps, 'sel'>) {
  const { status } = state;
  const staged = status.files.filter((f) => f.stage === 'staged');
  const unstaged = status.files.filter((f) => f.stage === 'unstaged');
  const untracked = status.files.filter((f) => f.stage === 'untracked');
  const clean = status.files.length === 0;

  const toggleFile = (path: string, stage: 'staged' | 'unstaged' | 'untracked') => {
    setWipFile(wipFile && wipFile.path === path && wipFile.stage === stage ? null : { path, stage });
  };

  return (
    <div className="git-detail git-staging">
      <div className="git-detail-header">
        <span className="git-detail-title">Changes</span>
        <span className="git-detail-sub fg-muted">{status.files.length} file(s)</span>
      </div>
      <div className="git-staging-scroll">
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
          selectedFile={wipFile}
          setSelectedFile={(path) => toggleFile(path, 'staged')}
        />
        <CommitBox
          active={active}
          hasStaged={staged.length > 0}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
        />
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
          selectedFile={wipFile}
          setSelectedFile={(path) => toggleFile(path, 'unstaged')}
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
          selectedFile={wipFile}
          setSelectedFile={(path) => toggleFile(path, 'untracked')}
        />
        {clean && <div className="git-view-clean fg-muted">Working tree clean.</div>}
      </div>
      {wipFile && (
        <div className="git-staging-diff">
          <DiffView active={active} file={wipFile} onClose={() => setWipFile(null)} />
        </div>
      )}
    </div>
  );
}
