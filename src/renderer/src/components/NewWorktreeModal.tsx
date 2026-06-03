import { useEffect, useMemo, useState } from 'react';
import type { Worktree } from '@shared/types';

interface Props {
  projectId: string;
  projectPath: string;
  worktreesRoot?: string;
  /** Branches the user most recently created worktrees from (most recent first). */
  recentBranches?: string[];
  /** Branches already checked out by this project's existing worktrees. */
  existingWorktreeBranches: string[];
  onClose: () => void;
  onCreated: (wt: Worktree) => void;
}

/** Mirror of the conservative ref-name sanitisation git applies; used only for
 *  the inline preview, not for transforming the submitted value. */
function sanitizeBranchPreview(name: string): string {
  return name.trim().replace(/\s+/g, '-');
}

export function NewWorktreeModal({
  projectId,
  projectPath,
  worktreesRoot,
  recentBranches = [],
  existingWorktreeBranches,
  onClose,
  onCreated,
}: Props) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [branch, setBranch] = useState('');
  const [pathOverride, setPathOverride] = useState<string | null>(null);
  const [defaultPath, setDefaultPath] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const list = await window.api.worktrees.listLocalBranches(projectId);
      setBranches(list);
    })();
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    if (!branch.trim()) {
      setDefaultPath('');
      return;
    }
    void (async () => {
      const p = await window.api.worktrees.computeDefaultPath(projectId, branch.trim());
      if (!cancelled) setDefaultPath(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, branch]);

  const trimmed = branch.trim();
  // Inline validation: the resulting branch must not collide with an existing
  // worktree on the same project.
  const duplicate = useMemo(
    () => trimmed.length > 0 && existingWorktreeBranches.includes(trimmed),
    [trimmed, existingWorktreeBranches],
  );
  const preview = sanitizeBranchPreview(branch);
  const nameValid = trimmed.length > 0 && !duplicate;

  const submit = async () => {
    if (!nameValid) return;
    setSubmitting(true);
    setError(null);
    const finalPath = pathOverride ?? defaultPath;
    const r = await window.api.worktrees.create({
      projectId,
      branch: trimmed,
      mode,
      path: finalPath || undefined,
    });
    setSubmitting(false);
    if (!r.ok) {
      // Surface git stderr verbatim inline; keep the dialog open.
      setError(r.error);
      return;
    }
    onCreated(r.worktree);
  };

  const displayedPath = pathOverride ?? defaultPath;
  const recents = recentBranches.slice(0, 3);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wt-card" onClick={(e) => e.stopPropagation()}>
        <h3>New workspace</h3>
        <p className="modal-subtitle">
          Project at <code>{projectPath}</code>
          {worktreesRoot ? ` · worktrees root: ${worktreesRoot}` : ''}
        </p>

        {/* Section 1 — Base branch */}
        <section className="wt-section">
          <div className="wt-section-title">Base branch</div>
          {recents.length > 0 && (
            <div className="wt-recents">
              <span className="wt-recents-label">Recent</span>
              {recents.map((b) => (
                <button
                  key={b}
                  type="button"
                  className="wt-recent-chip"
                  onClick={() => {
                    setMode('existing');
                    setBranch(b);
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
          <div className="wt-mode-row">
            <label className="wt-radio">
              <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> New
              branch
            </label>
            <label className="wt-radio">
              <input
                type="radio"
                checked={mode === 'existing'}
                onChange={() => setMode('existing')}
              />{' '}
              Existing branch
            </label>
          </div>
          {mode === 'existing' && (
            <>
              <input
                className="field-input"
                list="dash-branch-list"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Search branches…"
                autoFocus
              />
              <datalist id="dash-branch-list">
                {branches.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </>
          )}
          {mode === 'new' && (
            <p className="wt-hint">A new branch is created from the current HEAD.</p>
          )}
        </section>

        {/* Section 2 — Name */}
        <section className="wt-section">
          <div className="wt-section-title">Name</div>
          <input
            className={`field-input ${duplicate ? 'invalid' : ''}`}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder={mode === 'new' ? 'feature/new-thing' : 'branch name'}
            readOnly={mode === 'existing'}
            autoFocus={mode === 'new'}
          />
          {duplicate ? (
            <p className="wt-error-text">A worktree for “{trimmed}” already exists.</p>
          ) : (
            preview && preview !== trimmed && (
              <p className="wt-hint">Will use: {preview}</p>
            )
          )}
        </section>

        {/* Section 3 — Path */}
        <section className="wt-section">
          <div className="wt-section-title">Path</div>
          {pathOverride === null ? (
            <div className="wt-path-row">
              <code className="wt-path-preview">{displayedPath || '—'}</code>
              <button
                type="button"
                className="link-btn"
                onClick={() => setPathOverride(displayedPath)}
              >
                Advanced
              </button>
            </div>
          ) : (
            <div className="wt-path-row">
              <input
                className="field-input"
                value={displayedPath}
                onChange={(e) => setPathOverride(e.target.value)}
                placeholder="path on disk for the worktree"
              />
              <button type="button" className="link-btn" onClick={() => setPathOverride(null)}>
                Use default
              </button>
            </div>
          )}
        </section>

        {error && <pre className="wt-git-error">{error}</pre>}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void submit()} disabled={submitting || !nameValid}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
