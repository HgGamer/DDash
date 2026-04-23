import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Project } from '@shared/types';

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function runGit(repoPath: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile('git', ['-C', repoPath, ...args], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = (err as NodeJS.ErrnoException & { code?: number | string })?.code;
      const exitCode =
        typeof code === 'number' ? code : err ? ((err as { code?: number }).code ?? 1) : 0;
      resolve({
        ok: !err,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: typeof exitCode === 'number' ? exitCode : null,
      });
    });
  });
}

export async function isGitRepo(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    if (!st.isDirectory()) return false;
  } catch {
    return false;
  }
  const r = await runGit(p, ['rev-parse', '--git-dir']);
  return r.ok;
}

export interface GitWorktreeListEntry {
  path: string;
  branch: string | null;
  head: string;
}

export async function listWorktrees(repoPath: string): Promise<GitWorktreeListEntry[]> {
  const res = await runGit(repoPath, ['worktree', 'list', '--porcelain']);
  if (!res.ok) return [];
  const out: GitWorktreeListEntry[] = [];
  let cur: Partial<GitWorktreeListEntry> | null = null;
  const flush = () => {
    if (cur && cur.path) {
      out.push({ path: cur.path, branch: cur.branch ?? null, head: cur.head ?? '' });
    }
    cur = null;
  };
  for (const line of res.stdout.split('\n')) {
    if (line === '') {
      flush();
      continue;
    }
    if (!cur) cur = {};
    if (line.startsWith('worktree ')) cur.path = line.slice('worktree '.length);
    else if (line.startsWith('HEAD ')) cur.head = line.slice('HEAD '.length);
    else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length);
      cur.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
    } else if (line === 'detached') {
      cur.branch = null;
    }
  }
  flush();
  return out;
}

export async function listLocalBranches(repoPath: string): Promise<string[]> {
  const res = await runGit(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  if (!res.ok) return [];
  return res.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function addWorktree(
  repoPath: string,
  opts: { branch: string; path: string; mode: 'new' | 'existing' },
): Promise<GitResult> {
  if (opts.mode === 'new') {
    return runGit(repoPath, ['worktree', 'add', '-b', opts.branch, opts.path]);
  }
  return runGit(repoPath, ['worktree', 'add', opts.path, opts.branch]);
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  opts?: { force?: boolean },
): Promise<GitResult> {
  const args = ['worktree', 'remove'];
  if (opts?.force) args.push('--force');
  args.push(worktreePath);
  return runGit(repoPath, args);
}

export function sanitizeBranchForFs(branch: string): string {
  // Replace anything filesystem-unsafe (incl. control chars) with '-'.
  let s = branch.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^[-.]+|[-.]+$/g, '');
  return s || 'branch';
}

export async function computeDefaultWorktreePath(project: Project, branch: string): Promise<string> {
  const root = project.worktreesRoot ?? `${project.path}.worktrees`;
  const safe = sanitizeBranchForFs(branch);
  const base = path.join(root, safe);
  let candidate = base;
  let n = 2;
  while (await pathExists(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
