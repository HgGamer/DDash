import { describe, expect, it } from 'vitest';
import {
  GIT_LOG_FORMAT,
  parseBranches,
  parseLog,
  parsePorcelainV2,
} from '../src/main/git-parsers';

const NUL = '\0';

describe('parsePorcelainV2', () => {
  it('parses a clean repo with only a branch header', () => {
    const input =
      `# branch.oid abcdef1234567890${NUL}` +
      `# branch.head main${NUL}` +
      `# branch.upstream origin/main${NUL}` +
      `# branch.ab +0 -0${NUL}`;
    const s = parsePorcelainV2(input, '/repo');
    expect(s.branch).toBe('main');
    expect(s.head).toBe('abcdef1');
    expect(s.upstream).toBe('origin/main');
    expect(s.ahead).toBe(0);
    expect(s.behind).toBe(0);
    expect(s.detached).toBe(false);
    expect(s.files).toEqual([]);
  });

  it('reports detached HEAD', () => {
    const input = `# branch.oid abcdef1${NUL}# branch.head (detached)${NUL}`;
    const s = parsePorcelainV2(input, '/repo');
    expect(s.detached).toBe(true);
    expect(s.branch).toBeNull();
  });

  it('separates staged and unstaged changes on the same file', () => {
    // XY = "MM" → modified in index AND modified in worktree.
    const input =
      `# branch.head main${NUL}` +
      `1 MM N... 100644 100644 100644 hA hB src/foo.ts${NUL}`;
    const s = parsePorcelainV2(input, '/repo');
    expect(s.files).toEqual([
      { path: 'src/foo.ts', stage: 'staged', change: 'modified' },
      { path: 'src/foo.ts', stage: 'unstaged', change: 'modified' },
    ]);
  });

  it('parses an added (only staged) entry', () => {
    const input =
      `# branch.head main${NUL}` +
      `1 A. N... 100644 100644 100644 hA hB src/new.ts${NUL}`;
    const s = parsePorcelainV2(input, '/repo');
    expect(s.files).toEqual([
      { path: 'src/new.ts', stage: 'staged', change: 'added' },
    ]);
  });

  it('parses renamed entries (type 2) with origPath', () => {
    const input =
      `# branch.head main${NUL}` +
      `2 R. N... 100644 100644 100644 hA hB R100 newName.ts${NUL}` +
      `oldName.ts${NUL}`;
    const s = parsePorcelainV2(input, '/repo');
    expect(s.files).toEqual([
      { path: 'newName.ts', origPath: 'oldName.ts', stage: 'staged', change: 'renamed' },
    ]);
  });

  it('parses untracked entries', () => {
    const input =
      `# branch.head main${NUL}` +
      `? untracked.txt${NUL}` +
      `? dir/other.txt${NUL}`;
    const s = parsePorcelainV2(input, '/repo');
    expect(s.files).toEqual([
      { path: 'untracked.txt', stage: 'untracked', change: 'untracked' },
      { path: 'dir/other.txt', stage: 'untracked', change: 'untracked' },
    ]);
  });

  it('parses a mixed status (staged + unstaged + untracked + renamed)', () => {
    const input =
      `# branch.oid 1234567abc${NUL}` +
      `# branch.head feature${NUL}` +
      `1 M. N... 100644 100644 100644 hA hB src/a.ts${NUL}` +
      `1 .M N... 100644 100644 100644 hA hB src/b.ts${NUL}` +
      `2 R. N... 100644 100644 100644 hA hB R100 newFile.ts${NUL}oldFile.ts${NUL}` +
      `? pending.md${NUL}`;
    const s = parsePorcelainV2(input, '/repo');
    expect(s.branch).toBe('feature');
    expect(s.files).toHaveLength(4);
    expect(s.files[0]).toEqual({ path: 'src/a.ts', stage: 'staged', change: 'modified' });
    expect(s.files[1]).toEqual({ path: 'src/b.ts', stage: 'unstaged', change: 'modified' });
    expect(s.files[2]).toEqual({
      path: 'newFile.ts',
      origPath: 'oldFile.ts',
      stage: 'staged',
      change: 'renamed',
    });
    expect(s.files[3]).toEqual({ path: 'pending.md', stage: 'untracked', change: 'untracked' });
  });

  it('parses unmerged (conflicted) entries', () => {
    const input =
      `# branch.head main${NUL}` +
      `u UU N... 100644 100644 100644 100644 h1 h2 h3 merge.ts${NUL}`;
    const s = parsePorcelainV2(input, '/repo');
    expect(s.files).toEqual([
      { path: 'merge.ts', stage: 'unstaged', change: 'conflicted' },
    ]);
  });
});

describe('parseLog', () => {
  it('parses a single commit', () => {
    // Format: %H%x00%P%x00%an%x00%at%x00%s%x00%D
    const h = '1'.repeat(40);
    const input =
      h + NUL + '' + NUL + 'Alice' + NUL + '1700000000' + NUL + 'first commit' + NUL + '' + NUL;
    const commits = parseLog(input);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual({
      hash: h,
      shortHash: h.slice(0, 7),
      parents: [],
      authorName: 'Alice',
      authorTime: 1700000000,
      subject: 'first commit',
      refs: [],
    });
  });

  it('parses refs including HEAD pointer and tags', () => {
    const h = 'a'.repeat(40);
    const p = 'b'.repeat(40);
    const input =
      h +
      NUL +
      p +
      NUL +
      'Bob' +
      NUL +
      '1700000100' +
      NUL +
      'second' +
      NUL +
      'HEAD -> main, origin/main, tag: v1' +
      NUL;
    const commits = parseLog(input);
    expect(commits).toHaveLength(1);
    expect(commits[0].parents).toEqual([p]);
    expect(commits[0].refs).toEqual(['main', 'origin/main', 'tag: v1']);
  });

  it('parses multiple commits with multi-parent merges', () => {
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    const c = 'c'.repeat(40);
    const input =
      `${c}${NUL}${a} ${b}${NUL}Merger${NUL}1700000200${NUL}Merge branch${NUL}${NUL}` +
      `${a}${NUL}${NUL}Alice${NUL}1700000000${NUL}init${NUL}${NUL}` +
      `${b}${NUL}${NUL}Bob${NUL}1700000100${NUL}feat${NUL}${NUL}`;
    const commits = parseLog(input);
    expect(commits).toHaveLength(3);
    expect(commits[0].parents).toEqual([a, b]);
    expect(commits[1].parents).toEqual([]);
    expect(commits[2].parents).toEqual([]);
  });

  it('exports a stable log format string', () => {
    expect(GIT_LOG_FORMAT).toBe('%H%x00%P%x00%an%x00%at%x00%s%x00%D');
  });
});

describe('parseBranches', () => {
  it('parses local and remote branches and marks current', () => {
    const input =
      `refs/heads/main${NUL}hashA${NUL}origin/main${NUL}*\n` +
      `refs/heads/feature${NUL}hashB${NUL}${NUL} \n` +
      `refs/remotes/origin/main${NUL}hashA${NUL}${NUL} \n` +
      `refs/remotes/origin/HEAD${NUL}hashA${NUL}${NUL} \n`;
    const bs = parseBranches(input);
    // origin/HEAD is filtered out.
    expect(bs).toHaveLength(3);
    const main = bs.find((b) => b.name === 'main' && !b.remote)!;
    expect(main.isCurrent).toBe(true);
    expect(main.upstream).toBe('origin/main');
    const feature = bs.find((b) => b.name === 'feature')!;
    expect(feature.isCurrent).toBe(false);
    expect(feature.upstream).toBeNull();
    const remote = bs.find((b) => b.remote)!;
    expect(remote.name).toBe('origin/main');
  });

  it('returns empty for empty input', () => {
    expect(parseBranches('')).toEqual([]);
  });
});
