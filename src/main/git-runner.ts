import { execFile } from 'node:child_process';
import type { GitError, GitErrorCode } from '@shared/git';

export interface RunGitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Populated when the run could not complete (spawn failure, timeout, missing binary). */
  failure?: GitErrorCode;
}

interface RunOptions {
  /** Hard timeout in ms. Default 15s. */
  timeoutMs?: number;
  /** Max stdout/stderr buffer size. Default 16 MiB. */
  maxBuffer?: number;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024;

// Per-cwd FIFO mutex. Serializes runWriteGit calls for the same working
// directory so two commits/pushes/checkouts can't race. Read calls bypass
// this — they're idempotent and ordering doesn't matter.
const writeLocks = new Map<string, Promise<unknown>>();

async function withWriteLock<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(cwd) ?? Promise.resolve();
  let resolveOurs!: () => void;
  const ours = new Promise<void>((r) => {
    resolveOurs = r;
  });
  writeLocks.set(cwd, ours);
  try {
    await prev;
    return await fn();
  } finally {
    resolveOurs();
    // If nothing queued behind us, drop the entry so the map doesn't grow unbounded.
    if (writeLocks.get(cwd) === ours) writeLocks.delete(cwd);
  }
}

// Cached result of the git-availability probe. `undefined` = not yet probed.
let gitAvailable: boolean | undefined;

export async function isGitAvailable(): Promise<boolean> {
  if (gitAvailable !== undefined) return gitAvailable;
  const r = await spawnGit(['--version'], undefined, { timeoutMs: 5_000 });
  gitAvailable = r.ok;
  return gitAvailable;
}

/** Test-only: reset the cached availability so the next call re-probes. */
export function _resetGitAvailabilityCache(): void {
  gitAvailable = undefined;
}

export async function runGit(
  cwd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunGitResult> {
  if (!(await isGitAvailable())) {
    return { ok: false, stdout: '', stderr: '', exitCode: null, failure: 'git-missing' };
  }
  return spawnGit(['-C', cwd, ...args], cwd, opts);
}

export async function runWriteGit(
  cwd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunGitResult> {
  return withWriteLock(cwd, () => runGit(cwd, args, opts));
}

function spawnGit(args: string[], cwd: string | undefined, opts: RunOptions): Promise<RunGitResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER;
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      args,
      { cwd, maxBuffer, timeout: timeoutMs, killSignal: 'SIGKILL' },
      (err, stdout, stderr) => {
        const stdoutStr = typeof stdout === 'string' ? stdout : String(stdout ?? '');
        const stderrStr = typeof stderr === 'string' ? stderr : String(stderr ?? '');
        // execFile sets err.killed when it aborted due to `timeout`.
        if (err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed) {
          resolve({
            ok: false,
            stdout: stdoutStr,
            stderr: stderrStr,
            exitCode: null,
            failure: 'timeout',
          });
          return;
        }
        // Spawn-level failures (no exit code, couldn't start the process).
        // ENOENT in `git --version` is handled separately via isGitAvailable;
        // other spawn errors bubble up as a generic non-ok result with
        // exitCode=null so callers surface stderr.
        const exitCode =
          child.exitCode ?? (err ? ((err as { code?: number }).code ?? 1) : 0);
        resolve({
          ok: !err,
          stdout: stdoutStr,
          stderr: stderrStr,
          exitCode: typeof exitCode === 'number' ? exitCode : null,
        });
      },
    );
  });
}

export function toGitError(result: RunGitResult, fallbackMessage: string): GitError {
  const code: GitErrorCode =
    result.failure ?? (result.stderr.match(/no upstream/i) ? 'no-upstream' : 'unknown');
  const message =
    result.failure === 'git-missing'
      ? 'git binary not found on PATH'
      : result.failure === 'timeout'
        ? 'git command timed out'
        : fallbackMessage;
  return { code, message, stderr: result.stderr };
}
