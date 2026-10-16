/** Board grid maths. Both layouts must leave no empty cell: every column runs
 *  the full height of the workspace, so the tiles always fill it completely. */

export type BoardPlacement = { col: number; row: number; span: number };

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** 'main' layout: `n` tiles spread over `ceil(sqrt(n))` columns, the extra
 *  tiles going to the *later* columns so the first one stays the roomiest —
 *  1 window fills the board, 2 split it in half, 3 give the main window a
 *  full-height column beside a stack of two, 4 become a 2×2, and so on. Every
 *  column is filled top to bottom, hence the row count is the lcm of the
 *  per-column counts and each tile spans its column's share of it. */
export function mainPlacements(n: number): { rows: number; cells: BoardPlacement[] } {
  if (n <= 0) return { rows: 1, cells: [] };
  const cols = Math.ceil(Math.sqrt(n));
  const base = Math.floor(n / cols);
  const rem = n % cols;
  // counts[i]: tiles in column i — the last `rem` columns take one extra.
  const counts = Array.from({ length: cols }, (_, i) => base + (i >= cols - rem ? 1 : 0));
  const rows = counts.reduce((acc, c) => lcm(acc, c), 1);
  const cells: BoardPlacement[] = [];
  counts.forEach((count, col) => {
    const span = rows / count;
    for (let k = 0; k < count; k++) cells.push({ col: col + 1, row: k * span + 1, span });
  });
  return { rows, cells };
}

/** 'tile' layout: equal cells in `cols` columns, except that a part-filled last
 *  row widens its tiles to span the leftover columns instead of leaving a gap. */
export function tileSpans(n: number, cols: number): number[] {
  const spans = Array.from({ length: Math.max(0, n) }, () => 1);
  if (n <= 0 || cols <= 1) return spans;
  const rem = n % cols;
  if (rem === 0) return spans;
  const base = Math.floor(cols / rem);
  const extra = cols % rem;
  for (let i = 0; i < rem; i++) spans[n - rem + i] = base + (i < extra ? 1 : 0);
  return spans;
}
