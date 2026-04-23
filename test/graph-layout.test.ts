import { describe, expect, it } from 'vitest';
import { layoutCommitGraph, maxLane } from '../src/shared/graph-layout';
import type { GitCommit } from '../src/shared/git';

function c(hash: string, parents: string[], subject = hash): GitCommit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    authorName: 'Test',
    authorTime: 0,
    subject,
    refs: [],
  };
}

describe('layoutCommitGraph', () => {
  it('lays out a linear history on a single lane', () => {
    const rows = layoutCommitGraph([c('c', ['b']), c('b', ['a']), c('a', [])]);
    expect(rows.map((r) => r.nodeLane)).toEqual([0, 0, 0]);
    expect(rows[0].lanesOut).toEqual(['b']);
    expect(rows[1].lanesOut).toEqual(['a']);
    expect(rows[2].lanesOut).toEqual([]);
    expect(maxLane(rows)).toBe(0);
  });

  it('opens a new lane for a branch split', () => {
    // base <- A (on lane 0)
    //      \- B (on lane 1, same parent as A)
    // Commits returned newest-first: [A, B, base]
    const rows = layoutCommitGraph([c('A', ['base']), c('B', ['base']), c('base', [])]);
    // A takes lane 0, base expected at lane 0.
    expect(rows[0].nodeLane).toBe(0);
    expect(rows[0].lanesOut).toEqual(['base']);
    // B isn't yet expected anywhere → opens lane 1.
    expect(rows[1].nodeLane).toBe(1);
    // B's parent is also `base`, so it reuses lane 0 rather than opening a new one.
    expect(rows[1].lanesOut).toEqual(['base']);
    // base consumes lane 0.
    expect(rows[2].nodeLane).toBe(0);
    expect(rows[2].lanesOut).toEqual([]);
  });

  it('draws parent edges for merges', () => {
    //   M  (merge of A and B)
    //  / \
    // A   B
    //  \ /
    //   base
    // Newest-first order: M, A, B, base
    const rows = layoutCommitGraph([
      c('M', ['A', 'B']),
      c('A', ['base']),
      c('B', ['base']),
      c('base', []),
    ]);
    // Row M: nodeLane=0 (new), edges to lanes holding A (lane 0) and B (lane 1).
    expect(rows[0].nodeLane).toBe(0);
    expect(rows[0].parentEdges).toHaveLength(2);
    expect(rows[0].parentEdges[0].toLane).toBe(0);
    expect(rows[0].parentEdges[1].toLane).toBe(1);
    expect(rows[0].lanesOut).toEqual(['A', 'B']);
    // Row A: consumes lane 0, replaced by `base`.
    expect(rows[1].nodeLane).toBe(0);
    expect(rows[1].lanesOut).toEqual(['base', 'B']);
    // Row B: consumes lane 1, replaced by `base` → dedupes into lane 0.
    expect(rows[2].nodeLane).toBe(1);
    expect(rows[2].lanesOut).toEqual(['base']);
    // Row base.
    expect(rows[3].nodeLane).toBe(0);
    expect(rows[3].lanesOut).toEqual([]);
    expect(maxLane(rows)).toBe(1);
  });

  it('handles a root commit (no parents)', () => {
    const rows = layoutCommitGraph([c('only', [])]);
    expect(rows[0].nodeLane).toBe(0);
    expect(rows[0].parentEdges).toHaveLength(0);
    expect(rows[0].lanesOut).toEqual([]);
  });

  it('places an orphan commit on a fresh lane when its hash is not expected', () => {
    const rows = layoutCommitGraph([c('a', []), c('b', [])]);
    expect(rows[0].nodeLane).toBe(0);
    expect(rows[0].lanesOut).toEqual([]);
    expect(rows[1].nodeLane).toBe(0); // reuses empty slot 0
  });
});
