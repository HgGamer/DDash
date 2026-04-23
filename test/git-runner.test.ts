import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  _resetGitAvailabilityCache,
  isGitAvailable,
  runGit,
  runWriteGit,
} from '../src/main/git-runner';

// Create a tmpdir and drop a fake `git` script that echoes its argv + writes
// to stdout/stderr on demand. Tests manipulate PATH to force spawnGit to
// pick up the fake instead of the system binary.

interface Fixture {
  dir: string;
  originalPath: string | undefined;
}

let fixture: Fixture | undefined;

const FAKE_GIT = `#!/usr/bin/env bash
# A tiny fake git for runner tests. Behavior is keyed on argv:
#   --version        → print "git version 0.0-fake" and exit 0
#   sleep <s>        → sleep <s> seconds (used to exercise the timeout path)
#   fail <code>      → print "boom" to stderr and exit <code>
#   echo <text...>   → print <text> to stdout
#   * anything else  → print argv as JSON and exit 0
set -u
case "\${1-}" in
  --version)
    echo "git version 0.0-fake"
    exit 0
    ;;
esac
# When invoked with "-C <cwd> ..." the real git strips those first two args;
# our callers always pass -C <cwd>, so skip them here too.
if [[ "\${1-}" == "-C" ]]; then shift 2; fi
case "\${1-}" in
  sleep) sleep "\$2"; exit 0 ;;
  fail) echo "boom" >&2; exit "\$2" ;;
  echo) shift; echo "$*"; exit 0 ;;
  *) printf '%s' "[\"\$@\"]"; exit 0 ;;
esac
`;

function installFakeGit(): Fixture {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dash-git-runner-'));
  const script = path.join(dir, 'git');
  writeFileSync(script, FAKE_GIT);
  chmodSync(script, 0o755);
  const originalPath = process.env.PATH;
  // Prepend our dir so `git` resolves to the fake.
  process.env.PATH = `${dir}:${originalPath ?? ''}`;
  _resetGitAvailabilityCache();
  return { dir, originalPath };
}

function restore(fx: Fixture) {
  if (fx.originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = fx.originalPath;
  rmSync(fx.dir, { recursive: true, force: true });
  _resetGitAvailabilityCache();
}

describe('git-runner', () => {
  beforeEach(() => {
    fixture = installFakeGit();
  });
  afterEach(() => {
    if (fixture) restore(fixture);
    fixture = undefined;
  });

  it('detects git availability', async () => {
    expect(await isGitAvailable()).toBe(true);
  });

  it('returns git-missing when the binary cannot be found', async () => {
    if (fixture) restore(fixture);
    fixture = undefined;
    // Point PATH at an empty directory so `git` can't be resolved.
    const empty = mkdtempSync(path.join(os.tmpdir(), 'dash-no-git-'));
    const prev = process.env.PATH;
    process.env.PATH = empty;
    _resetGitAvailabilityCache();
    try {
      const r = await runGit('/tmp', ['status']);
      expect(r.ok).toBe(false);
      expect(r.failure).toBe('git-missing');
    } finally {
      process.env.PATH = prev;
      rmSync(empty, { recursive: true, force: true });
      _resetGitAvailabilityCache();
    }
  });

  it('surfaces non-zero exit codes without throwing', async () => {
    const r = await runGit('/tmp', ['fail', '5']);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(5);
    expect(r.stderr).toContain('boom');
  });

  it('captures stdout for successful commands', async () => {
    const r = await runGit('/tmp', ['echo', 'hello', 'world']);
    expect(r.ok).toBe(true);
    expect(r.stdout.trim()).toBe('hello world');
  });

  it('times out long-running commands', async () => {
    const r = await runGit('/tmp', ['sleep', '5'], { timeoutMs: 200 });
    expect(r.ok).toBe(false);
    expect(r.failure).toBe('timeout');
  });

  it('serializes write operations per cwd', async () => {
    // Two writes that each take ~300ms. Run in parallel against the same
    // cwd — the second must only complete after the first does.
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'dash-lock-'));
    try {
      const start = Date.now();
      const a = runWriteGit(cwd, ['sleep', '0.3']);
      const b = runWriteGit(cwd, ['sleep', '0.3']);
      await Promise.all([a, b]);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThan(550); // 2 × 300ms minus jitter
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 10_000);

  // Independence across cwds is guaranteed by structure (Map keyed by cwd),
  // not by timing. A timing-based test of "doesn't serialize" is too flaky
  // on macOS due to spawn-overhead variance across test runs. The serial-
  // per-cwd test above is the one that catches meaningful regressions.
});
