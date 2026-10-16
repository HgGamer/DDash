import path from 'node:path';
import { ipcMain, type BrowserWindow } from 'electron';
import {
  IPC,
  type GitBranchesResult,
  type GitChangedEvent,
  type GitCheckoutArgs,
  type GitCommitArgs,
  type GitCommitFile,
  type GitCreateBranchArgs,
  type GitDeleteBranchArgs,
  type GitMergeArgs,
  type GitDiffArgs,
  type GitDiffResult,
  type GitDiscardArgs,
  type GitIsRepoResult,
  type GitLsFilesResult,
  type GitListReposResult,
  type GitLogArgs,
  type GitLogResult,
  type GitOperationResult,
  type GitShowCommitArgs,
  type GitShowCommitResult,
  type GitStagePathsArgs,
  type GitStashListResult,
  type GitStashPushArgs,
  type GitStashShowFilesArgs,
  type GitStashShowFilesResult,
  type GitStashWriteArgs,
  type GitStatusResult,
  type GitTabRef,
} from '@shared/ipc';
import type { ProjectRegistry } from './registry';
import {
  BRANCHES_ARGS,
  logArgs,
  parseBranches,
  parseLog,
  parsePorcelainV2,
  parseStashFiles,
  parseStashList,
  STASH_FILES_ARGS,
  STASH_LIST_ARGS,
  STATUS_ARGS,
} from './git-parsers';
import { isGitAvailable, runGit, runWriteGit, toGitError } from './git-runner';
import { GitWatcher } from './git-watcher';
import { listSubRepos } from './git';

const DEFAULT_LOG_LIMIT = 500;

/**
 * Build `git commit` argv. Amend with an empty subject keeps the previous
 * message (`--amend --no-edit`); otherwise the subject is set via `-m` and an
 * optional description as a second `-m`. Pure so the amend branching is tested.
 */
export function buildCommitArgs(
  subject: string,
  description: string | undefined,
  amend: boolean,
): string[] {
  if (amend && !subject) return ['commit', '--amend', '--no-edit'];
  const args = ['commit', ...(amend ? ['--amend'] : []), '-m', subject];
  if (description && description.trim().length > 0) args.push('-m', description);
  return args;
}

// Generated/dependency dirs to keep out of the fuzzy file list (the ignored
// pass). Matched at any depth via glob pathspec so monorepo nesting is covered.
const LS_FILES_EXCLUDES = [
  'node_modules', '.git', 'dist', 'out', 'release', '.stage', '.cache', '.worktrees',
].map((d) => `:(glob,exclude)**/${d}/**`);

function resolveCwd(
  registry: ProjectRegistry,
  ref: GitTabRef,
): { ok: true; cwd: string } | { ok: false } {
  const proj = registry.getById(ref.projectId);
  if (!proj) return { ok: false };
  const base = ref.worktreeId
    ? proj.worktrees.find((w) => w.id === ref.worktreeId)?.path
    : proj.path;
  if (!base) return { ok: false };
  // Multi-repo: an explicit sub-repo path must resolve to somewhere inside the
  // project folder, guarding against path traversal from a compromised renderer.
  if (ref.repoPath) {
    const resolved = path.resolve(ref.repoPath);
    const root = path.resolve(proj.path);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return { ok: false };
    return { ok: true, cwd: resolved };
  }
  return { ok: true, cwd: base };
}

export function registerGitIpc(args: {
  registry: ProjectRegistry;
  getWindow: () => BrowserWindow | null;
}): { dispose: () => void } {
  const { registry, getWindow } = args;
  const watcher = new GitWatcher();

  watcher.on('changed', (ev: GitChangedEvent) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(IPC.GitChanged, ev);
  });

  ipcMain.handle(IPC.GitLsFiles, async (_e, ref: GitTabRef): Promise<GitLsFilesResult> => {
    if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, reason: 'tab-missing' };
    const split = (out: string) => out.split('\0').filter((f) => f.length > 0);

    // List one repo. `prefix` is the repo's path relative to the project root,
    // so files stay resolvable via docs.read (which is project-root scoped).
    // Returns null when `cwd` isn't a git repo.
    const listRepo = async (cwd: string, prefix: string): Promise<string[] | null> => {
      // Pass 1: tracked + untracked-not-ignored. -z keeps spaces/unicode intact.
      const tracked = await runGit(cwd, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
      if (!tracked.ok) return null;
      // Pass 2: gitignored files too (e.g. .env), minus generated/dep dirs.
      const ignored = await runGit(cwd, [
        'ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...LS_FILES_EXCLUDES,
      ]);
      const rel = [...split(tracked.stdout), ...(ignored.ok ? split(ignored.stdout) : [])];
      return prefix ? rel.map((f) => `${prefix}/${f}`) : rel;
    };

    let all = await listRepo(r.cwd, '');
    if (all === null) {
      // Not a repo itself — a multi-repo folder: aggregate its child repos.
      const subs = await listSubRepos(r.cwd);
      if (subs.length === 0) return { ok: false, reason: 'not-a-repo' };
      const parts = await Promise.all(subs.map((s) => listRepo(s.path, s.name)));
      all = parts.filter((p): p is string[] => p !== null).flat();
    }
    // ponytail: dir denylist is a heuristic; a project that ignores some other
    // huge dir will leak it — add it to LS_FILES_EXCLUDES if that ever bites.
    return { ok: true, files: [...new Set(all)] };
  });

  ipcMain.handle(IPC.GitIsRepo, async (_e, ref: GitTabRef): Promise<GitIsRepoResult> => {
    if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, reason: 'tab-missing' };
    const probe = await runGit(r.cwd, ['rev-parse', '--git-dir']);
    if (!probe.ok) {
      if (probe.failure === 'git-missing') return { ok: false, reason: 'git-missing' };
      return { ok: false, reason: 'not-a-repo' };
    }
    return { ok: true, cwd: r.cwd };
  });

  ipcMain.handle(IPC.GitListRepos, async (_e, ref: GitTabRef): Promise<GitListReposResult> => {
    if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
    const proj = registry.getById(ref.projectId);
    if (!proj) return { ok: false, reason: 'tab-missing' };
    return { ok: true, repos: await listSubRepos(proj.path) };
  });

  ipcMain.handle(IPC.GitStatus, async (_e, ref: GitTabRef): Promise<GitStatusResult> => {
    if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, reason: 'tab-missing' };
    const res = await runGit(r.cwd, STATUS_ARGS);
    if (!res.ok) {
      if (res.failure === 'git-missing') return { ok: false, reason: 'git-missing' };
      return { ok: false, reason: 'not-a-repo', stderr: res.stderr };
    }
    return { ok: true, status: parsePorcelainV2(res.stdout, r.cwd) };
  });

  ipcMain.handle(IPC.GitLog, async (_e, a: GitLogArgs): Promise<GitLogResult> => {
    if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, reason: 'tab-missing' };
    const res = await runGit(r.cwd, logArgs(a.limit ?? DEFAULT_LOG_LIMIT));
    if (!res.ok) {
      if (res.failure === 'git-missing') return { ok: false, reason: 'git-missing' };
      return { ok: false, reason: 'not-a-repo', stderr: res.stderr };
    }
    return { ok: true, commits: parseLog(res.stdout) };
  });

  ipcMain.handle(IPC.GitBranches, async (_e, ref: GitTabRef): Promise<GitBranchesResult> => {
    if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, reason: 'tab-missing' };
    const res = await runGit(r.cwd, BRANCHES_ARGS);
    if (!res.ok) {
      if (res.failure === 'git-missing') return { ok: false, reason: 'git-missing' };
      return { ok: false, reason: 'not-a-repo', stderr: res.stderr };
    }
    return { ok: true, branches: parseBranches(res.stdout) };
  });

  ipcMain.handle(IPC.GitStage, async (_e, a: GitStagePathsArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    if (a.paths.length === 0) return { ok: true };
    const res = await runWriteGit(r.cwd, ['add', '--', ...a.paths]);
    if (!res.ok) return { ok: false, error: toGitError(res, 'git add failed') };
    return { ok: true };
  });

  ipcMain.handle(IPC.GitUnstage, async (_e, a: GitStagePathsArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    if (a.paths.length === 0) return { ok: true };
    const res = await runWriteGit(r.cwd, ['restore', '--staged', '--', ...a.paths]);
    if (!res.ok) return { ok: false, error: toGitError(res, 'git restore --staged failed') };
    return { ok: true };
  });

  ipcMain.handle(IPC.GitCommit, async (_e, a: GitCommitArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const subject = a.subject.trim();
    const amend = a.amend === true;
    // Amend with no new subject keeps the previous message; otherwise a subject
    // is required (for both new commits and reword-amends).
    if (!subject && !amend) {
      return {
        ok: false,
        error: { code: 'unknown', message: 'commit subject is empty', stderr: '' },
      };
    }
    const res = await runWriteGit(r.cwd, buildCommitArgs(subject, a.description, amend));
    if (!res.ok) return { ok: false, error: toGitError(res, 'git commit failed') };
    return { ok: true };
  });

  ipcMain.handle(IPC.GitPush, async (_e, ref: GitTabRef): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    // 60s timeout — pushes can take longer than reads, especially over slow links.
    const res = await runWriteGit(r.cwd, ['push'], { timeoutMs: 60_000 });
    if (!res.ok) {
      const err = toGitError(res, 'git push failed');
      // Detect the "no upstream configured" case and surface a cleaner code.
      if (/no upstream branch/i.test(res.stderr) || /has no upstream/i.test(res.stderr)) {
        return { ok: false, error: { ...err, code: 'no-upstream' } };
      }
      return { ok: false, error: err };
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.GitPushForce, async (_e, ref: GitTabRef): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    // --force-with-lease refuses to clobber remote commits we haven't seen, so
    // it won't overwrite a teammate's push the way a bare --force would.
    const res = await runWriteGit(r.cwd, ['push', '--force-with-lease'], { timeoutMs: 60_000 });
    if (!res.ok) {
      const err = toGitError(res, 'git push --force-with-lease failed');
      if (/no upstream branch/i.test(res.stderr) || /has no upstream/i.test(res.stderr)) {
        return { ok: false, error: { ...err, code: 'no-upstream' } };
      }
      return { ok: false, error: err };
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.GitFetch, async (_e, ref: GitTabRef): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const res = await runWriteGit(r.cwd, ['fetch', '--all', '--prune'], { timeoutMs: 60_000 });
    if (!res.ok) return { ok: false, error: toGitError(res, 'git fetch failed') };
    return { ok: true };
  });

  ipcMain.handle(IPC.GitPull, async (_e, ref: GitTabRef): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const res = await runWriteGit(r.cwd, ['pull', '--ff'], { timeoutMs: 60_000 });
    if (!res.ok) {
      const err = toGitError(res, 'git pull failed');
      if (/no tracking information|no upstream/i.test(res.stderr)) {
        return { ok: false, error: { ...err, code: 'no-upstream' } };
      }
      return { ok: false, error: err };
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.GitMerge, async (_e, a: GitMergeArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const res = await runWriteGit(r.cwd, ['merge', '--no-edit', a.branch]);
    if (!res.ok) return { ok: false, error: toGitError(res, 'git merge failed') };
    return { ok: true };
  });

  ipcMain.handle(IPC.GitCheckout, async (_e, a: GitCheckoutArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const res = await runWriteGit(r.cwd, ['checkout', a.branch]);
    if (!res.ok) return { ok: false, error: toGitError(res, 'git checkout failed') };
    return { ok: true };
  });

  ipcMain.handle(
    IPC.GitCreateBranch,
    async (_e, a: GitCreateBranchArgs): Promise<GitOperationResult> => {
      const r = resolveCwd(registry, a);
      if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
      const res = await runWriteGit(r.cwd, ['checkout', '-b', a.name]);
      if (!res.ok) return { ok: false, error: toGitError(res, 'git checkout -b failed') };
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.GitDeleteBranch,
    async (_e, a: GitDeleteBranchArgs): Promise<GitOperationResult> => {
      const r = resolveCwd(registry, a);
      if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
      const res = await runWriteGit(r.cwd, ['branch', a.force ? '-D' : '-d', a.name]);
      if (!res.ok) {
        const err = toGitError(res, 'git branch -d failed');
        // Surface the "not fully merged" case so the UI can offer force-delete.
        if (/not fully merged/i.test(res.stderr)) {
          return { ok: false, error: { ...err, code: 'unmerged' } };
        }
        return { ok: false, error: err };
      }
      return { ok: true };
    },
  );

  ipcMain.handle(IPC.GitDiff, async (_e, a: GitDiffArgs): Promise<GitDiffResult> => {
    if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, reason: 'tab-missing' };
    let args: string[];
    if (a.stash) {
      // Per-file diff captured by a stash. `stash show -p <ref> -- <path>`
      // emits a unified diff that includes the staged + worktree + untracked
      // pieces consistently, regardless of how the stash was created.
      args = ['stash', 'show', '-p', '--no-color', a.stash, '--', a.path];
    } else if (a.commit) {
      // Per-file diff introduced by a specific commit. `show` emits the full
      // commit header otherwise; `--format=` suppresses it. For the root
      // commit (no parent) `show` with `--root` emits the initial contents as
      // an addition.
      args = ['show', '--no-color', '--format=', '--root', a.commit, '--', a.path];
    } else if (a.stage === 'untracked') {
      // `diff --no-index` treats the file as all-new. It exits with 1 when
      // there are differences (which is the expected case) — we accept that
      // as success and only treat other failures as errors.
      args = ['diff', '--no-index', '--no-color', '--', '/dev/null', a.path];
    } else {
      args = ['diff', '--no-color'];
      if (a.stage === 'staged') args.push('--cached');
      args.push('--', a.path);
    }
    const res = await runGit(r.cwd, args);
    const acceptableExit = !a.commit && a.stage === 'untracked' && res.exitCode === 1;
    if (!res.ok && !acceptableExit) {
      if (res.failure === 'git-missing') return { ok: false, reason: 'git-missing' };
      return { ok: false, reason: 'not-a-repo', stderr: res.stderr };
    }
    // git emits "Binary files ... differ" for binaries in `--no-color` mode.
    const binary = /^Binary files .* differ$/m.test(res.stdout);
    return { ok: true, diff: res.stdout, binary };
  });

  ipcMain.handle(
    IPC.GitShowCommit,
    async (_e, a: GitShowCommitArgs): Promise<GitShowCommitResult> => {
      if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
      const r = resolveCwd(registry, a);
      if (!r.ok) return { ok: false, reason: 'tab-missing' };
      // ASCII unit separator + record separator as field/record delimiters,
      // so commit messages containing any printable text survive parsing.
      const FS = '\x1f';
      const RS = '\x1e';
      const format = ['%H', '%an', '%ae', '%aI', '%B'].join(FS) + RS;
      const res = await runGit(r.cwd, [
        'show',
        '--no-color',
        '--name-status',
        '--root',
        `--format=${format}`,
        a.commit,
      ]);
      if (!res.ok) {
        if (res.failure === 'git-missing') return { ok: false, reason: 'git-missing' };
        if (/unknown revision|bad revision|ambiguous argument/i.test(res.stderr)) {
          return { ok: false, reason: 'unknown-commit', stderr: res.stderr };
        }
        return { ok: false, reason: 'not-a-repo', stderr: res.stderr };
      }
      const rsIdx = res.stdout.indexOf(RS);
      if (rsIdx < 0) {
        return { ok: false, reason: 'unknown-commit', stderr: 'unparseable git show output' };
      }
      const header = res.stdout.slice(0, rsIdx);
      const rest = res.stdout.slice(rsIdx + 1);
      const [hash, authorName, authorEmail, authorDate, message] = header.split(FS);
      const files: GitCommitFile[] = [];
      for (const rawLine of rest.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        if (!line) continue;
        // Lines: "M\tpath", "A\tpath", "D\tpath", "R<score>\told\tnew", "C<score>\told\tnew"
        const parts = line.split('\t');
        const code = parts[0] ?? '';
        if (!code) continue;
        const first = code[0];
        if (first === 'R' && parts.length >= 3) {
          files.push({ kind: 'renamed', oldPath: parts[1]!, path: parts[2]! });
        } else if (first === 'C' && parts.length >= 3) {
          // Copies render as additions of the new path (old path preserved for reference).
          files.push({ kind: 'added', oldPath: parts[1]!, path: parts[2]! });
        } else if (first === 'A' && parts.length >= 2) {
          files.push({ kind: 'added', path: parts[1]! });
        } else if (first === 'D' && parts.length >= 2) {
          files.push({ kind: 'deleted', path: parts[1]! });
        } else if (first === 'M' && parts.length >= 2) {
          files.push({ kind: 'modified', path: parts[1]! });
        } else if (first === 'T' && parts.length >= 2) {
          files.push({ kind: 'modified', path: parts[1]! });
        }
      }
      return {
        ok: true,
        commit: {
          hash: hash ?? '',
          authorName: authorName ?? '',
          authorEmail: authorEmail ?? '',
          authorDate: authorDate ?? '',
          message: (message ?? '').replace(/\n+$/, ''),
        },
        files,
      };
    },
  );

  ipcMain.handle(IPC.GitDiscard, async (_e, a: GitDiscardArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    if (a.paths.length === 0) return { ok: true };
    const args =
      a.kind === 'untracked'
        ? ['clean', '-f', '--', ...a.paths]
        : ['checkout', 'HEAD', '--', ...a.paths];
    const res = await runWriteGit(r.cwd, args);
    if (!res.ok) {
      return {
        ok: false,
        error: toGitError(res, a.kind === 'untracked' ? 'git clean failed' : 'git checkout failed'),
      };
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.GitStashList, async (_e, ref: GitTabRef): Promise<GitStashListResult> => {
    if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
    const r = resolveCwd(registry, ref);
    if (!r.ok) return { ok: false, reason: 'tab-missing' };
    const res = await runGit(r.cwd, STASH_LIST_ARGS);
    if (!res.ok) {
      if (res.failure === 'git-missing') return { ok: false, reason: 'git-missing' };
      return { ok: false, reason: 'not-a-repo', stderr: res.stderr };
    }
    return { ok: true, stashes: parseStashList(res.stdout) };
  });

  ipcMain.handle(IPC.GitStashPush, async (_e, a: GitStashPushArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const args = ['stash', 'push'];
    if (a.includeUntracked) args.push('--include-untracked');
    const message = a.message?.trim();
    if (message) args.push('-m', message);
    const res = await runWriteGit(r.cwd, args);
    if (!res.ok) {
      const err = toGitError(res, 'git stash push failed');
      // git prints this on stdout, not stderr, when there's nothing to stash.
      if (
        /no local changes to save/i.test(res.stderr) ||
        /no local changes to save/i.test(res.stdout)
      ) {
        return {
          ok: false,
          error: {
            code: 'nothing-to-stash',
            message: 'No local changes to stash.',
            stderr: res.stderr || res.stdout,
          },
        };
      }
      return { ok: false, error: err };
    }
    // Even on exit-zero, `stash push` prints "No local changes to save" and
    // does nothing when the tree is clean — surface that as a typed failure
    // so the renderer can keep its UI consistent.
    if (/no local changes to save/i.test(res.stdout)) {
      return {
        ok: false,
        error: {
          code: 'nothing-to-stash',
          message: 'No local changes to stash.',
          stderr: res.stdout,
        },
      };
    }
    return { ok: true };
  });

  // SHA-guard helper. Re-resolves `ref` to its current SHA and compares against
  // what the renderer thought it was. Bails with `stash-mismatch` on disagreement
  // so apply/pop/drop never act on the wrong entry after an external reshuffle.
  async function checkStashSha(
    cwd: string,
    ref: string,
    expectedSha: string,
  ): Promise<GitOperationResult | null> {
    const probe = await runGit(cwd, ['rev-parse', '--verify', ref]);
    if (!probe.ok) {
      if (probe.failure === 'git-missing') {
        return { ok: false, error: toGitError(probe, 'git rev-parse failed') };
      }
      return {
        ok: false,
        error: {
          code: 'stash-mismatch',
          message: 'Stash entry no longer exists — refresh and retry.',
          stderr: probe.stderr,
        },
      };
    }
    const sha = probe.stdout.trim();
    if (sha !== expectedSha) {
      return {
        ok: false,
        error: {
          code: 'stash-mismatch',
          message: 'Stash entry changed — refresh and retry.',
          stderr: '',
        },
      };
    }
    return null;
  }

  ipcMain.handle(IPC.GitStashApply, async (_e, a: GitStashWriteArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const guard = await checkStashSha(r.cwd, a.ref, a.expectedSha);
    if (guard) return guard;
    const res = await runWriteGit(r.cwd, ['stash', 'apply', a.ref]);
    if (!res.ok) return { ok: false, error: toGitError(res, 'git stash apply failed') };
    return { ok: true };
  });

  ipcMain.handle(IPC.GitStashPop, async (_e, a: GitStashWriteArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const guard = await checkStashSha(r.cwd, a.ref, a.expectedSha);
    if (guard) return guard;
    const res = await runWriteGit(r.cwd, ['stash', 'pop', a.ref]);
    if (!res.ok) return { ok: false, error: toGitError(res, 'git stash pop failed') };
    return { ok: true };
  });

  ipcMain.handle(IPC.GitStashDrop, async (_e, a: GitStashWriteArgs): Promise<GitOperationResult> => {
    const r = resolveCwd(registry, a);
    if (!r.ok) return { ok: false, error: { code: 'unknown', message: 'tab not found', stderr: '' } };
    const guard = await checkStashSha(r.cwd, a.ref, a.expectedSha);
    if (guard) return guard;
    const res = await runWriteGit(r.cwd, ['stash', 'drop', a.ref]);
    if (!res.ok) return { ok: false, error: toGitError(res, 'git stash drop failed') };
    return { ok: true };
  });

  ipcMain.handle(
    IPC.GitStashShowFiles,
    async (_e, a: GitStashShowFilesArgs): Promise<GitStashShowFilesResult> => {
      if (!(await isGitAvailable())) return { ok: false, reason: 'git-missing' };
      const r = resolveCwd(registry, a);
      if (!r.ok) return { ok: false, reason: 'tab-missing' };
      const res = await runGit(r.cwd, STASH_FILES_ARGS(a.ref));
      if (!res.ok) {
        if (res.failure === 'git-missing') return { ok: false, reason: 'git-missing' };
        if (/is not a stash-like commit|unknown revision|bad revision|ambiguous argument/i.test(res.stderr)) {
          return { ok: false, reason: 'unknown-stash', stderr: res.stderr };
        }
        return { ok: false, reason: 'not-a-repo', stderr: res.stderr };
      }
      return { ok: true, files: parseStashFiles(res.stdout) };
    },
  );

  ipcMain.handle(IPC.GitSubscribe, async (_e, ref: GitTabRef): Promise<void> => {
    const r = resolveCwd(registry, ref);
    if (!r.ok) return;
    watcher.subscribe(r.cwd);
  });

  ipcMain.handle(IPC.GitUnsubscribe, async (_e, ref: GitTabRef): Promise<void> => {
    const r = resolveCwd(registry, ref);
    if (!r.ok) return;
    watcher.unsubscribe(r.cwd);
  });

  return {
    dispose: () => {
      watcher.dispose();
      for (const channel of [
        IPC.GitIsRepo,
        IPC.GitListRepos,
        IPC.GitStatus,
        IPC.GitLog,
        IPC.GitBranches,
        IPC.GitStage,
        IPC.GitUnstage,
        IPC.GitCommit,
        IPC.GitPush,
        IPC.GitPushForce,
        IPC.GitFetch,
        IPC.GitPull,
        IPC.GitMerge,
        IPC.GitCheckout,
        IPC.GitCreateBranch,
        IPC.GitDeleteBranch,
        IPC.GitDiff,
        IPC.GitShowCommit,
        IPC.GitDiscard,
        IPC.GitStashList,
        IPC.GitStashPush,
        IPC.GitStashApply,
        IPC.GitStashPop,
        IPC.GitStashDrop,
        IPC.GitStashShowFiles,
        IPC.GitSubscribe,
        IPC.GitUnsubscribe,
      ]) {
        ipcMain.removeHandler(channel);
      }
    },
  };
}

