import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '../src/shared/types';

// We mock execFile so listWorktrees (which shells `git worktree list
// --porcelain`) returns canned stdout, then exercise the join logic in
// listWorktreesWithHeads.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { listWorktreesWithHeads } from '../src/main/git';

type Cb = (err: Error | null, stdout: string, stderr: string) => void;

function mockGitOutput(stdout: string) {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
    (_cmd: string, _args: string[], _opts: unknown, cb: Cb) => {
      cb(null, stdout, '');
    },
  );
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'p',
    path: '/repo/main',
    addedAt: '',
    lastOpenedAt: null,
    order: 0,
    worktrees: [],
    todos: [],
    ...overrides,
  };
}

beforeEach(() => {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(() => {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockReset();
});

describe('listWorktreesWithHeads', () => {
  it('single-worktree repo returns just the primary tree with short head', async () => {
    mockGitOutput(
      [
        'worktree /repo/main',
        'HEAD abcdef1234567890abcdef1234567890abcdef12',
        'branch refs/heads/main',
        '',
      ].join('\n'),
    );
    const out = await listWorktreesWithHeads(project());
    expect(out).toEqual([{ worktreeId: null, head: 'abcdef1' }]);
  });

  it('multi-worktree repo joins heads to registry by path', async () => {
    mockGitOutput(
      [
        'worktree /repo/main',
        'HEAD aaaaaaa1111111111111111111111111111111aa',
        'branch refs/heads/main',
        '',
        'worktree /repo/main.worktrees/feat-x',
        'HEAD bbbbbbb2222222222222222222222222222222bb',
        'branch refs/heads/feature/x',
        '',
        'worktree /repo/main.worktrees/feat-y',
        'HEAD ccccccc3333333333333333333333333333333cc',
        'branch refs/heads/feature/y',
        '',
      ].join('\n'),
    );
    const out = await listWorktreesWithHeads(
      project({
        worktrees: [
          {
            id: 'wt-x',
            branch: 'feature/x',
            path: '/repo/main.worktrees/feat-x',
            addedAt: '',
            lastOpenedAt: null,
            order: 0,
          },
          {
            id: 'wt-y',
            branch: 'feature/y',
            path: '/repo/main.worktrees/feat-y',
            addedAt: '',
            lastOpenedAt: null,
            order: 1,
          },
        ],
      }),
    );
    expect(out).toEqual([
      { worktreeId: null, head: 'aaaaaaa' },
      { worktreeId: 'wt-x', head: 'bbbbbbb' },
      { worktreeId: 'wt-y', head: 'ccccccc' },
    ]);
  });

  it('worktree path missing from git output returns head: null', async () => {
    // Registry knows about `wt-stale` but git doesn't (e.g. the directory was
    // deleted externally and git pruned it).
    mockGitOutput(
      [
        'worktree /repo/main',
        'HEAD aaaaaaa1111111111111111111111111111111aa',
        'branch refs/heads/main',
        '',
      ].join('\n'),
    );
    const out = await listWorktreesWithHeads(
      project({
        worktrees: [
          {
            id: 'wt-stale',
            branch: 'gone',
            path: '/repo/main.worktrees/gone',
            addedAt: '',
            lastOpenedAt: null,
            order: 0,
          },
        ],
      }),
    );
    expect(out).toEqual([
      { worktreeId: null, head: 'aaaaaaa' },
      { worktreeId: 'wt-stale', head: null },
    ]);
  });

  it('primary tree missing from git output returns head: null for primary', async () => {
    mockGitOutput('');
    const out = await listWorktreesWithHeads(project());
    expect(out).toEqual([{ worktreeId: null, head: null }]);
  });
});
