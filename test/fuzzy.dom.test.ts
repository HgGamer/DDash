import { describe, it, expect } from 'vitest';
import { fuzzyFinder } from '../src/renderer/src/lib/fuzzy';

describe('fuzzyFinder', () => {
  const files = ['src/index.ts', 'src/renderer/store.ts', 'README.md', 'package.json'];
  const find = fuzzyFinder(files, (f) => f);

  it('matches non-contiguous subsequences', () => {
    const hits = find('sit').map((r) => r.item);
    expect(hits).toContain('src/index.ts'); // s..i..t
  });

  it('ranks the closer match first', () => {
    const hits = find('store').map((r) => r.item);
    expect(hits[0]).toBe('src/renderer/store.ts');
  });

  it('returns matched positions for highlighting', () => {
    const [rme] = find('rdme');
    expect(rme.item).toBe('README.md');
    expect(rme.positions.size).toBe(4);
  });

  it('drops items missing a subsequence char', () => {
    expect(find('xyz')).toEqual([]); // no item contains x,y,z in order
  });

  it('empty query yields nothing', () => {
    expect(find('')).toEqual([]);
  });

  it('AND-matches space-separated terms regardless of order', () => {
    const paths = ['src/renderer/src/lib/fuzzy.ts', 'src/main/git-ipc.ts'];
    const f = fuzzyFinder(paths, (p) => p);
    // "fuzzy render" — terms out of order vs the path, both must match.
    expect(f('fuzzy render').map((r) => r.item)).toEqual(['src/renderer/src/lib/fuzzy.ts']);
  });
});
