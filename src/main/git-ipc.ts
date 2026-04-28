import { ipcMain, type BrowserWindow } from 'electron';
import {
  IPC,
  type GitBranchesResult,
  type GitChangedEvent,
  type GitCheckoutArgs,
  type GitCommitArgs,
  type GitCommitFile,
  type GitCreateBranchArgs,
  type GitDiffArgs,
  type GitDiffResult,
  type GitDiscardArgs,
  type GitIsRepoResult,
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

const DEFAULT_LOG_LIMIT = 500;

function resolveCwd(
  registry: ProjectRegistry,
  ref: GitTabRef,
): { ok: true; cwd: string } | { ok: false } {
  const proj = registry.getById(ref.projectId);
  if (!proj) return { ok: false };
  if (!ref.worktreeId) return { ok: true, cwd: proj.path };
  const wt = proj.worktrees.find((w) => w.id === ref.worktreeId);
  if (!wt) return { ok: false };
  return { ok: true, cwd: wt.path };
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
    if (!subject) {
      return {
        ok: false,
        error: { code: 'unknown', message: 'commit subject is empty', stderr: '' },
      };
    }
    const args = ['commit', '-m', subject];
    if (a.description && a.description.trim().length > 0) {
      args.push('-m', a.description);
    }
    const res = await runWriteGit(r.cwd, args);
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
        IPC.GitStatus,
        IPC.GitLog,
        IPC.GitBranches,
        IPC.GitStage,
        IPC.GitUnstage,
        IPC.GitCommit,
        IPC.GitPush,
        IPC.GitCheckout,
        IPC.GitCreateBranch,
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

