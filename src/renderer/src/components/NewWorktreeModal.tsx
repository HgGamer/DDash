import { useEffect, useState } from 'react';
import type { Worktree } from '@shared/types';

interface Props {
  projectId: string;
  projectPath: string;
  worktreesRoot?: string;
  onClose: () => void;
  onCreated: (wt: Worktree) => void;
}

export function NewWorktreeModal({ projectId, projectPath, worktreesRoot, onClose, onCreated }: Props) {
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

  const submit = async () => {
    if (!branch.trim()) {
      setError('Branch name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const finalPath = pathOverride ?? defaultPath;
    const r = await window.api.worktrees.create({
      projectId,
      branch: branch.trim(),
      mode,
      path: finalPath || undefined,
    });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCreated(r.worktree);
  };

  const displayedPath = pathOverride ?? defaultPath;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>New worktree</h3>
        <p className="fg-muted">
          Project at <code>{projectPath}</code>
          {worktreesRoot ? ` (worktrees root: ${worktreesRoot})` : ''}
        </p>

        <div className="field-row">
          <label className="field-label">
            <input
              type="radio"
              checked={mode === 'new'}
              onChange={() => setMode('new')}
            />{' '}
            New branch
          </label>
          <label className="field-label">
            <input
              type="radio"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
            />{' '}
            Existing branch
          </label>
        </div>

        <div className="field-row">
          <span className="field-label">Branch</span>
          {mode === 'existing' && branches.length > 0 ? (
            <input
              className="field-input"
              list="dash-branch-list"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="branch name"
              autoFocus
            />
          ) : (
            <input
              className="field-input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={mode === 'new' ? 'feature/new-thing' : 'existing-branch'}
              autoFocus
            />
          )}
          <datalist id="dash-branch-list">
            {branches.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>

        <div className="field-row">
          <span className="field-label">Path</span>
          <input
            className="field-input"
            value={displayedPath}
            onChange={(e) => setPathOverride(e.target.value)}
            placeholder="path on disk for the worktree"
          />
        </div>
        {pathOverride !== null && (
          <div className="field-row">
            <span className="field-label" />
            <button
              type="button"
              className="link-btn"
              onClick={() => setPathOverride(null)}
            >
              Use default path
            </button>
          </div>
        )}

        {error && <div className="preset-error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={submitting || !branch.trim()}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
