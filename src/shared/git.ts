// Shared types for the Git View feature. These cross the IPC boundary
// between main and renderer, so they must contain only JSON-serializable
// values.

export type GitChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechange'
  | 'untracked'
  | 'ignored'
  | 'conflicted';

export type GitStage = 'staged' | 'unstaged' | 'untracked';

export interface GitStatusFile {
  /** Path relative to the repository root, using forward slashes. */
  path: string;
  /** For renames/copies, the original path. */
  origPath?: string;
  stage: GitStage;
  change: GitChangeKind;
}

export interface GitStatus {
  /** Absolute path to the working directory git reported on. */
  cwd: string;
  /** Current branch name, or null when HEAD is detached. */
  branch: string | null;
  /** Short SHA at HEAD, or null on an unborn branch. */
  head: string | null;
  /** Upstream tracking branch (e.g. `origin/main`), if any. */
  upstream: string | null;
  /** Ahead/behind counts relative to the upstream. Both null when no upstream. */
  ahead: number | null;
  behind: number | null;
  detached: boolean;
  files: GitStatusFile[];
}

export interface GitCommit {
  hash: string;
  /** Short SHA (first 7 chars) — precomputed so renderer doesn't have to slice. */
  shortHash: string;
  parents: string[];
  authorName: string;
  /** Unix epoch seconds. */
  authorTime: number;
  subject: string;
  /** Ref names pointing at this commit (e.g. `HEAD`, `main`, `origin/main`). */
  refs: string[];
}

export interface GitBranch {
  name: string;
  /** True for remote-tracking branches (e.g. `origin/main`). */
  remote: boolean;
  head: string;
  upstream: string | null;
  isCurrent: boolean;
}

export type GitErrorCode =
  | 'not-a-repo'
  | 'git-missing'
  | 'timeout'
  | 'no-upstream'
  | 'nothing-to-stash'
  | 'stash-mismatch'
  | 'unknown';

/**
 * One entry on the stash stack as listed by `git stash list`. `ref` is the
 * reflog selector (e.g. `stash@{0}`); `sha` is the stash commit SHA, used as a
 * stable identity guard against external reshuffling between list-time and
 * apply/pop/drop-time.
 */
export interface GitStashEntry {
  /** Reflog selector, e.g. `stash@{0}`. Not stable across stash mutations. */
  ref: string;
  /** Full SHA of the stash commit. Stable. */
  sha: string;
  /** Source branch the stash was created on, parsed from the reflog subject.
   *  Null when git couldn't tell us (e.g. detached HEAD at stash time). */
  branch: string | null;
  /** Human-readable stash message — either the user's `-m` text or git's
   *  default `WIP on <branch>: <hash> <subject>`. */
  message: string;
  /** Unix epoch seconds of the stash's commit time. */
  time: number;
}

/** A file changed by a stash, as reported by `git stash show --name-status`.
 *  Stashes don't track copies/renames the way commits do — they appear as
 *  added/modified/deleted. */
export interface GitStashFile {
  path: string;
  kind: 'added' | 'modified' | 'deleted';
}

export interface GitError {
  code: GitErrorCode;
  message: string;
  stderr: string;
}

export type GitOperationResult = { ok: true } | { ok: false; error: GitError };

/** Fired by the main process when files under `<cwd>/.git/` change. */
export interface GitChangedEvent {
  cwd: string;
}
