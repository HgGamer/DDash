import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GitChangeKind,
  GitCommit,
  GitError,
  GitStashEntry,
  GitStashFile,
  GitStatusFile,
} from '@shared/git';
import type { GitCommitDetail, GitCommitFile, GitTabRef } from '@shared/ipc';
import { laneColor, layoutCommitGraph, maxLane, type GraphRow } from '@shared/graph-layout';

const GRAPH_LANE_WIDTH = 14;
const GRAPH_ROW_HEIGHT = 22;
const GRAPH_NODE_RADIUS = 3;


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

export function StatusSection({
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
                <span className={`git-change-badge change-${f.change}`} title={f.change}>
                  {changeBadge(f.change)}
                </span>
                <span className="git-file-path">{formatFilePath(f)}</span>
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
  active: GitTabRef;
  hasStaged: boolean;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
}

export function CommitBox({ active, hasStaged, busy, setBusy, setError }: CommitBoxProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);
  // Amending can rewrite the last commit's message even with nothing staged;
  // a fresh commit needs both staged changes and a subject.
  const canCommit = (amend || (hasStaged && subject.trim().length > 0)) && busy === null;
  return (
    <div className="git-commit-box">
      <input
        className="field-input"
        placeholder={amend ? 'New subject (blank = keep existing)' : 'Commit subject'}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={busy !== null}
      />
      <textarea
        className="field-input git-commit-desc"
        placeholder="Description (optional)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={busy !== null}
      />
      <div className="git-commit-actions">
        <label className="git-commit-amend" title="Amend the previous commit">
          <input
            type="checkbox"
            checked={amend}
            disabled={busy !== null}
            onChange={(e) => setAmend(e.target.checked)}
          />
          Amend last commit
        </label>
        <button
          className="git-view-btn git-commit-btn"
          disabled={!canCommit}
          onClick={async () => {
            setBusy('commit');
            const r = await window.api.git.commit({
              ...active,
              subject: subject.trim(),
              description: description.trim() || undefined,
              amend,
            });
            setBusy(null);
            if (r.ok) {
              setSubject('');
              setDescription('');
              setAmend(false);
            } else {
              setError(r.error);
            }
          }}
        >
          {busy === 'commit' ? 'Committing…' : amend ? 'Amend' : 'Commit'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commit list
// ---------------------------------------------------------------------------

export function CommitList({
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

  // Scroll the selected commit into view — used when a branch is previewed
  // from the rail and its tip lives far down the history.
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selectedCommit && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedCommit]);

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
              ref={selected ? selectedRef : undefined}
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
        fill={isHead ? 'var(--color-accent)' : nodeColor}
        stroke={isHead ? 'var(--color-fg)' : 'var(--color-surface)'}
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
  stash,
  onClose,
}: {
  active: GitTabRef;
  file: { path: string; stage: 'staged' | 'unstaged' | 'untracked' };
  /** When set, fetch the per-file diff introduced by this commit instead of
   *  the working-tree diff. The `stage` on `file` is ignored. */
  commit?: string;
  /** When set, fetch the per-file diff captured by this stash entry instead
   *  of the working-tree diff. The `stage` on `file` and `commit` are
   *  ignored. */
  stash?: string;
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
      .diff({ projectId, worktreeId, repoPath: active.repoPath, path: file.path, stage: file.stage, commit, stash })
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
  }, [projectId, worktreeId, active.repoPath, file.path, file.stage, commit, stash]);

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
        <span className="fg-muted">
          ({stash ? `@ ${stash}` : commit ? `@ ${commit.slice(0, 7)}` : file.stage})
        </span>
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
  active: GitTabRef;
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
  }, [projectId, worktreeId, active.repoPath, commit]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setFiles(null);
    setErr(null);
    void window.api.git
      .showCommit({ projectId, worktreeId, repoPath: active.repoPath, commit })
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
  }, [projectId, worktreeId, active.repoPath, commit]);

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

// ---------------------------------------------------------------------------
// Stashes section
// ---------------------------------------------------------------------------

interface StashesSectionProps {
  stashes: GitStashEntry[];
  active: GitTabRef;
  /** Whether the working tree has anything that `git stash push` would capture.
   *  Drives the disabled state of the "Stash changes" button. */
  hasChanges: boolean;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
  selectedStash: { ref: string; sha: string } | null;
  onToggleStash: (entry: GitStashEntry) => void;
}

export function StashesSection({
  stashes,
  active,
  hasChanges,
  busy,
  setBusy,
  setError,
  selectedStash,
  onToggleStash,
}: StashesSectionProps) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="git-section">
      <div className="git-section-header">
        <span className="git-section-title">Stashes</span>
        <span className="git-section-count">{stashes.length}</span>
        {!creating && (
          <button
            className="git-section-all"
            title={
              hasChanges
                ? 'Stash the current working tree'
                : 'Working tree is clean — nothing to stash'
            }
            disabled={!hasChanges || busy !== null}
            onClick={() => setCreating(true)}
          >
            stash changes
          </button>
        )}
      </div>
      {creating && (
        <StashCreateForm
          active={active}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          onClose={() => setCreating(false)}
        />
      )}
      {stashes.length === 0 ? (
        <div className="git-section-empty fg-muted">No stashes.</div>
      ) : (
        <ul className="git-file-list">
          {stashes.map((s) => {
            const sel = selectedStash?.sha === s.sha;
            return (
              <li
                key={s.sha}
                className={`git-file-row${sel ? ' selected' : ''}`}
                onClick={() => onToggleStash(s)}
                title={s.ref}
              >
                <span className="git-commit-hash">{s.ref}</span>
                <span className="git-file-path">{s.message}</span>
                <span className="git-commit-meta">
                  {s.branch ? `on ${s.branch} · ` : ''}
                  {relativeTime(s.time)}
                </span>
                <button
                  className="git-file-action"
                  title="Apply (keep on stack)"
                  disabled={busy !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runStashWrite('apply', active, s, setBusy, setError);
                  }}
                >
                  apply
                </button>
                <button
                  className="git-file-action"
                  title="Pop (apply and remove)"
                  disabled={busy !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runStashWrite('pop', active, s, setBusy, setError);
                  }}
                >
                  pop
                </button>
                <button
                  className="git-file-action git-file-discard"
                  title="Drop (delete without applying)"
                  disabled={busy !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    const msg =
                      `Drop this stash?\n\n${s.ref}: ${s.message}\n\nThis cannot be undone.`;
                    if (window.confirm(msg)) {
                      void runStashWrite('drop', active, s, setBusy, setError);
                    }
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function runStashWrite(
  op: 'apply' | 'pop' | 'drop',
  active: GitTabRef,
  entry: GitStashEntry,
  setBusy: (s: string | null) => void,
  setError: (e: GitError | null) => void,
): Promise<void> {
  setBusy(`stash:${op}`);
  const args = {
    projectId: active.projectId,
    worktreeId: active.worktreeId ?? null,
    repoPath: active.repoPath,
    ref: entry.ref,
    expectedSha: entry.sha,
  };
  const r =
    op === 'apply'
      ? await window.api.git.stashApply(args)
      : op === 'pop'
        ? await window.api.git.stashPop(args)
        : await window.api.git.stashDrop(args);
  setBusy(null);
  if (!r.ok) setError(r.error);
}

interface StashCreateFormProps {
  active: GitTabRef;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setError: (e: GitError | null) => void;
  onClose: () => void;
}

function StashCreateForm({ active, busy, setBusy, setError, onClose }: StashCreateFormProps) {
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const submit = async () => {
    setBusy('stash:push');
    const r = await window.api.git.stashPush({
      projectId: active.projectId,
      worktreeId: active.worktreeId ?? null,
      repoPath: active.repoPath,
      message: message.trim() || undefined,
      includeUntracked,
    });
    setBusy(null);
    if (r.ok) {
      onClose();
      setMessage('');
      setIncludeUntracked(false);
    } else {
      setError(r.error);
    }
  };
  return (
    <div className="git-commit-box">
      <input
        autoFocus
        className="field-input"
        placeholder="Stash message (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && busy === null) void submit();
        }}
        disabled={busy !== null}
      />
      <label className="git-stash-untracked" title="git stash push --include-untracked">
        <input
          type="checkbox"
          checked={includeUntracked}
          onChange={(e) => setIncludeUntracked(e.target.checked)}
          disabled={busy !== null}
        />
        <span>include untracked files</span>
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="git-view-btn git-commit-btn"
          disabled={busy !== null}
          onClick={() => void submit()}
        >
          {busy === 'stash:push' ? 'Stashing…' : 'Stash'}
        </button>
        <button className="git-view-btn" disabled={busy !== null} onClick={onClose}>
          cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stash view (stash detail + per-file diff)
// ---------------------------------------------------------------------------

export function StashView({
  active,
  ref,
  sha,
  branch,
  message,
  time,
  onClose,
}: {
  active: GitTabRef;
  ref: string;
  sha: string;
  branch: string | null;
  message: string;
  time: number;
  onClose?: () => void;
}) {
  const [files, setFiles] = useState<GitStashFile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const projectId = active.projectId;
  const worktreeId = active.worktreeId ?? null;

  // Reset the in-pane file selection whenever the stash or tab changes.
  useEffect(() => {
    setSelectedPath(null);
  }, [projectId, worktreeId, sha]);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setErr(null);
    void window.api.git.stashShowFiles({ projectId, worktreeId, repoPath: active.repoPath, ref }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setFiles(r.files);
      } else {
        setErr(r.stderr ?? r.reason);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreeId, active.repoPath, ref, sha]);

  // Close on Escape.
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const selected = useMemo(
    () => (selectedPath && files ? files.find((f) => f.path === selectedPath) ?? null : null),
    [selectedPath, files],
  );

  return (
    <div className="git-diff-view git-commit-view">
      <div className="git-diff-pane-header">
        <span className="git-diff-path">stash {ref}</span>
        {branch && <span className="fg-muted">· on {branch}</span>}
        {onClose && (
          <button className="git-diff-close" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        )}
      </div>
      {err ? (
        <div className="fg-muted" style={{ padding: 8 }}>
          stash unavailable: {err}
        </div>
      ) : !files ? (
        <div className="fg-muted" style={{ padding: 8 }}>
          Loading stash…
        </div>
      ) : (
        <div className="git-commit-body">
          <div className="git-commit-meta-block">
            <div className="git-commit-hash-full" title={sha}>
              {sha}
            </div>
            <div className="git-commit-author">
              <span>{branch ? `on ${branch}` : '(detached)'}</span>
              <span className="fg-muted git-commit-date">
                {' · '}
                {relativeTime(time)}
              </span>
            </div>
            <div className="git-commit-subject-full">{message}</div>
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
                  const isSel = selectedPath === f.path;
                  return (
                    <li
                      key={f.path}
                      className={`git-file-row${isSel ? ' selected' : ''}`}
                      onClick={() => setSelectedPath(isSel ? null : f.path)}
                    >
                      <span
                        className={`git-change-badge change-${f.kind}`}
                        title={f.kind}
                      ></span>
                      <span className="git-file-path">{f.path}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selected && (
            <div className="git-commit-diff-region">
              <DiffView
                active={active}
                file={{
                  path: selected.path,
                  // `stage` is ignored when `stash` is set, but the type
                  // requires a value. 'staged' is a harmless placeholder.
                  stage: 'staged',
                }}
                stash={ref}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

