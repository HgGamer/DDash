import { describe, it, expect } from 'vitest';
import { mainPlacements, tileSpans } from '../src/renderer/src/lib/board-layout';

describe('mainPlacements', () => {
  it('gives a single window the whole board', () => {
    expect(mainPlacements(1)).toEqual({ rows: 1, cells: [{ col: 1, row: 1, span: 1 }] });
  });

  it('splits two windows into halves', () => {
    const { rows, cells } = mainPlacements(2);
    expect(rows).toBe(1);
    expect(cells).toEqual([
      { col: 1, row: 1, span: 1 },
      { col: 2, row: 1, span: 1 },
    ]);
  });

  it('gives three windows a full-height main column beside a stack of two', () => {
    const { rows, cells } = mainPlacements(3);
    expect(rows).toBe(2);
    expect(cells).toEqual([
      { col: 1, row: 1, span: 2 },
      { col: 2, row: 1, span: 1 },
      { col: 2, row: 2, span: 1 },
    ]);
  });

  it('splits four windows 2 + 2, not 1 + 3', () => {
    const { rows, cells } = mainPlacements(4);
    expect(rows).toBe(2);
    expect(cells).toEqual([
      { col: 1, row: 1, span: 1 },
      { col: 1, row: 2, span: 1 },
      { col: 2, row: 1, span: 1 },
      { col: 2, row: 2, span: 1 },
    ]);
  });

  it('covers the board with no gap or overlap for 1..12 windows', () => {
    for (let n = 1; n <= 12; n++) {
      const { rows, cells } = mainPlacements(n);
      const cols = Math.ceil(Math.sqrt(n));
      expect(cells).toHaveLength(n);
      const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
      for (const cell of cells) {
        for (let r = cell.row - 1; r < cell.row - 1 + cell.span; r++) grid[r][cell.col - 1]++;
      }
      expect(grid.flat().every((v) => v === 1)).toBe(true);
    }
  });
});

describe('tileSpans', () => {
  it('leaves full rows alone', () => {
    expect(tileSpans(4, 2)).toEqual([1, 1, 1, 1]);
    expect(tileSpans(6, 3)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('stretches a part-filled last row across the leftover columns', () => {
    // 5 windows in 3 columns: last row holds 2 tiles, one of them double-wide.
    expect(tileSpans(5, 3)).toEqual([1, 1, 1, 2, 1]);
    // 4 windows in 3 columns: the lone last tile takes the whole row.
    expect(tileSpans(4, 3)).toEqual([1, 1, 1, 3]);
  });

  it('always fills the last row exactly', () => {
    for (let cols = 1; cols <= 6; cols++) {
      for (let n = 1; n <= 20; n++) {
        const spans = tileSpans(n, cols);
        expect(spans).toHaveLength(n);
        const rem = n % cols;
        const last = spans.slice(n - (rem || cols));
        expect(last.reduce((a, b) => a + b, 0)).toBe(cols);
      }
    }
  });
});
