import type {
  GitBranch,
  GitChangeKind,
  GitCommit,
  GitStashEntry,
  GitStashFile,
  GitStatus,
} from '@shared/git';

// ---------------------------------------------------------------------------
// status --porcelain=v2 --branch --untracked-files=all -z
// ---------------------------------------------------------------------------

const XY_TO_CHANGE: Record<string, GitChangeKind> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange',
  U: 'conflicted',
};

function xyToChange(code: string): GitChangeKind {
  return XY_TO_CHANGE[code] ?? 'modified';
}

/**
 * Parse porcelain v2 output (NUL-separated).
 *
 * Reference: `git help status` > PORCELAIN FORMAT VERSION 2. Each record
 * starts with a 1-char type prefix:
 *   `# ` — branch header line (not NUL-terminated itself but separated by NUL)
 *   `1 ` — ordinary changed entry
 *   `2 ` — renamed/copied entry (followed by an extra NUL + origPath)
 *   `u ` — unmerged
 *   `? ` — untracked
 *   `! ` — ignored
 */
export function parsePorcelainV2(stdout: string, cwd: string): GitStatus {
  const status: GitStatus = {
    cwd,
    branch: null,
    head: null,
    upstream: null,
    ahead: null,
    behind: null,
    detached: false,
    files: [],
  };

  // Split on NUL. `2 ` records consume an extra NUL-terminated field, so we
  // walk the array with an index rather than iterating cleanly.
  const records = stdout.split('\0');
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec) continue;

    if (rec.startsWith('# ')) {
      parseBranchHeader(rec.slice(2), status);
      continue;
    }

    const type = rec[0];
    if (type === '1') {
      // "1 XY sub mH mI mW hH hI path" — 8 fields total, path at index 7.
      const rest = rec.slice(2);
      const parts = rest.split(' ');
      const xy = parts[0] ?? '..';
      const path = parts.slice(7).join(' ');
      const stagedCode = xy[0];
      const unstagedCode = xy[1];
      if (stagedCode && stagedCode !== '.') {
        status.files.push({ path, stage: 'staged', change: xyToChange(stagedCode) });
      }
      if (unstagedCode && unstagedCode !== '.') {
        status.files.push({ path, stage: 'unstaged', change: xyToChange(unstagedCode) });
      }
    } else if (type === '2') {
      // "2 XY sub mH mI mW hH hI Rscore path"  — 9 fields, path at index 8.
      // The NUL-terminated origPath follows as the next record.
      const rest = rec.slice(2);
      const parts = rest.split(' ');
      const xy = parts[0] ?? '..';
      const path = parts.slice(8).join(' ');
      const orig = records[++i] ?? '';
      const stagedCode = xy[0];
      const unstagedCode = xy[1];
      if (stagedCode && stagedCode !== '.') {
        status.files.push({
          path,
          origPath: orig,
          stage: 'staged',
          change: xyToChange(stagedCode),
        });
      }
      if (unstagedCode && unstagedCode !== '.') {
        status.files.push({
          path,
          origPath: orig,
          stage: 'unstaged',
          change: xyToChange(unstagedCode),
        });
      }
    } else if (type === 'u') {
      // Unmerged: "u XY sub m1 m2 m3 mW h1 h2 h3 path" — 10 fields, path at index 9.
      const rest = rec.slice(2);
      const parts = rest.split(' ');
      const path = parts.slice(9).join(' ');
      status.files.push({ path, stage: 'unstaged', change: 'conflicted' });
    } else if (type === '?') {
      status.files.push({ path: rec.slice(2), stage: 'untracked', change: 'untracked' });
    } else if (type === '!') {
      status.files.push({ path: rec.slice(2), stage: 'untracked', change: 'ignored' });
    }
  }

  return status;
}

function parseBranchHeader(line: string, status: GitStatus): void {
  // Lines look like:
  //   branch.oid <sha> | "(initial)"
  //   branch.head <name> | "(detached)"
  //   branch.upstream <ref>
  //   branch.ab +<ahead> -<behind>
  const space = line.indexOf(' ');
  const key = space < 0 ? line : line.slice(0, space);
  const val = space < 0 ? '' : line.slice(space + 1);
  switch (key) {
    case 'branch.oid':
      status.head = val === '(initial)' ? null : val.slice(0, 7);
      break;
    case 'branch.head':
      if (val === '(detached)') {
        status.detached = true;
        status.branch = null;
      } else {
        status.branch = val;
      }
      break;
    case 'branch.upstream':
      status.upstream = val;
      break;
    case 'branch.ab': {
      const m = val.match(/^\+(\d+)\s+-(\d+)$/);
      if (m) {
        status.ahead = Number(m[1]);
        status.behind = Number(m[2]);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// log --format="%H%x00%P%x00%an%x00%at%x00%s%x00%D" -z
// ---------------------------------------------------------------------------

const LOG_FORMAT = '%H%x00%P%x00%an%x00%at%x00%s%x00%D';

export { LOG_FORMAT as GIT_LOG_FORMAT };

export function parseLog(stdout: string): GitCommit[] {
  // `-z` makes git use NUL as the record separator. Our format itself uses
  // NUL between fields, so we split the stream with a small state machine: 5
  // NULs per record means we've collected all fields but the last (refs),
  // then wait for the record-terminating NUL (or end of input).
  const out: GitCommit[] = [];
  const tokens = stdout.split('\0');
  // Each commit produces 6 fields; `-z` then emits a final NUL, which yields
  // an extra empty token between commits. Consume in groups of 6, skipping
  // any trailing empties.
  let i = 0;
  while (i + 5 < tokens.length) {
    const hash = tokens[i];
    if (!hash) {
      i++;
      continue;
    }
    const parents = tokens[i + 1];
    const authorName = tokens[i + 2];
    const authorTimeStr = tokens[i + 3];
    const subject = tokens[i + 4];
    const refsRaw = tokens[i + 5];
    out.push({
      hash,
      shortHash: hash.slice(0, 7),
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      authorName,
      authorTime: Number(authorTimeStr) || 0,
      subject,
      refs: parseRefsField(refsRaw),
    });
    i += 6;
  }
  return out;
}

function parseRefsField(raw: string): string[] {
  if (!raw) return [];
  // `%D` emits ref names as a comma-separated list, e.g. "HEAD -> main, origin/main, tag: v1".
  return raw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      if (r.startsWith('HEAD -> ')) return r.slice('HEAD -> '.length);
      if (r === 'HEAD') return 'HEAD';
      if (r.startsWith('tag: ')) return r;
      return r;
    });
}

// ---------------------------------------------------------------------------
// for-each-ref refs/heads refs/remotes --format=...
// ---------------------------------------------------------------------------

export const BRANCH_FORMAT = '%(refname)%00%(objectname)%00%(upstream:short)%00%(HEAD)';

export function parseBranches(stdout: string): GitBranch[] {
  const out: GitBranch[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const [ref, head, upstream, headMarker] = line.split('\0');
    if (!ref) continue;
    const remote = ref.startsWith('refs/remotes/');
    const name = remote
      ? ref.slice('refs/remotes/'.length)
      : ref.startsWith('refs/heads/')
        ? ref.slice('refs/heads/'.length)
        : ref;
    // Skip the `origin/HEAD` symbolic pointer — it's noise for the UI.
    if (remote && name.endsWith('/HEAD')) continue;
    out.push({
      name,
      remote,
      head: head ?? '',
      upstream: upstream || null,
      isCurrent: headMarker === '*',
    });
  }
  return out;
}

// Canonical argv builders — kept alongside the parsers so tests can assert
// we invoked git with the exact flags the parser expects.
export const STATUS_ARGS = [
  'status',
  '--porcelain=v2',
  '--branch',
  '--untracked-files=all',
  '-z',
];

export function logArgs(limit: number): string[] {
  return ['log', '--all', `--format=${LOG_FORMAT}`, '-z', `-n${limit}`];
}

export const BRANCHES_ARGS = [
  'for-each-ref',
  `--format=${BRANCH_FORMAT}`,
  'refs/heads/',
  'refs/remotes/',
];

// ---------------------------------------------------------------------------
// stash list -z --format=%gd%x00%H%x00%gs%x00%ct
// ---------------------------------------------------------------------------

const STASH_LIST_FORMAT = '%gd%x00%H%x00%gs%x00%ct';

export const STASH_LIST_ARGS = ['stash', 'list', '-z', `--format=${STASH_LIST_FORMAT}`];

/**
 * Parse `git stash list -z --format=%gd%x00%H%x00%gs%x00%ct`.
 *
 * `-z` makes git use NUL as the *record* separator and our format itself uses
 * NUL between fields, so a stream of N stashes contains N×4 + (N-1) NULs.
 * We walk the token array in groups of 4 and skip empty trailing tokens that
 * git appends after the last record.
 *
 * The reflog subject (%gs) takes one of two forms:
 *   - "WIP on <branch>: <hash> <subject>"  — git's default message
 *   - "On <branch>: <user message>"        — when the user passed `-m`
 * We extract the branch from either form. When neither matches (e.g. stashed
 * from a detached HEAD), we leave `branch` null and return the message as-is.
 */
export function parseStashList(stdout: string): GitStashEntry[] {
  const tokens = stdout.split('\0');
  const out: GitStashEntry[] = [];
  let i = 0;
  while (i + 3 < tokens.length) {
    const ref = tokens[i];
    if (!ref) {
      i++;
      continue;
    }
    const sha = tokens[i + 1] ?? '';
    const reflogSubject = tokens[i + 2] ?? '';
    const timeStr = tokens[i + 3] ?? '';
    const { branch, message } = parseStashReflogSubject(reflogSubject);
    out.push({
      ref,
      sha,
      branch,
      message,
      time: Number(timeStr) || 0,
    });
    i += 4;
  }
  return out;
}

function parseStashReflogSubject(raw: string): { branch: string | null; message: string } {
  // Default message: "WIP on <branch>: <hash> <subject>"
  let m = raw.match(/^WIP on ([^:]+): (.*)$/s);
  if (m) return { branch: m[1] ?? null, message: raw };
  // User-supplied message: "On <branch>: <message>"
  m = raw.match(/^On ([^:]+): (.*)$/s);
  if (m) return { branch: m[1] ?? null, message: m[2] ?? '' };
  return { branch: null, message: raw };
}

// ---------------------------------------------------------------------------
// stash show --name-status -z
// ---------------------------------------------------------------------------

/**
 * Parse `git stash show --name-status -z <ref>` output. With `-z`, fields and
 * records are NUL-separated rather than tab/newline. Each entry is two
 * tokens: a status code (`A`/`M`/`D`/`T`/...) and a path.
 *
 * We only emit the kinds spec'd in `GitStashFile`; `T` (typechange) is
 * normalized to `modified` to match how the UI renders it.
 */
export function parseStashFiles(stdout: string): GitStashFile[] {
  const tokens = stdout.split('\0').filter((t) => t.length > 0);
  const out: GitStashFile[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const code = tokens[i]!;
    if (code.length !== 1) continue;
    const path = tokens[++i]!;
    let kind: GitStashFile['kind'];
    if (code === 'A') kind = 'added';
    else if (code === 'D') kind = 'deleted';
    else if (code === 'M' || code === 'T') kind = 'modified';
    else continue;
    out.push({ kind, path });
  }
  return out;
}

export const STASH_FILES_ARGS = (ref: string) => ['stash', 'show', '--name-status', '-z', ref];
