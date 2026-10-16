# 0001 — The board's "main + stack" layout fills the board at any window count

## The question

The board has three layouts: `tile` (equal cells), `main` (one window favoured),
and `free` (drag-sized tiles). `main` was built for the common case of one
window being worked in while a couple of others are watched, and it was wired
as a literal two-column grid: the first pinned window took the full-height left
column, every other window stacked in the right one.

That reads well up to three windows. At four it produces a 1 + 3 split, where
each stacked tile is a third of the main window's height, and it gets worse with
every window added — the layout the user asked for was "always fill the
available space well", not "always favour the first window".

## Options

1. **Keep two columns, cap the stack.** Simple, but it either hides windows or
   keeps shrinking them; the complaint was exactly this shrinking.
2. **Fall back to `tile` above three windows.** The main window loses its
   prominence abruptly at the fourth, and the two layouts become hard to tell
   apart.
3. **Derive the column count from the window count.** The first window keeps the
   roomiest column for as long as that is possible, and the board stays covered.

## The decision

Option 3. Columns are `ceil(sqrt(n))`, the tiles are spread over them as evenly
as possible, and the **extra** tiles go to the *later* columns, so the first
column holds the fewest — the first window stays the roomiest, and while it is
alone in its column it is full height:

| windows | layout |
| --- | --- |
| 1 | the whole board |
| 2 | two halves |
| 3 | main column + a stack of two |
| 4 | 2×2 |
| 5 | main column + two stacks of two |
| 6 | three stacks of two |

Every column is filled top to bottom, so there is no empty cell at any count.
The row count is the least common multiple of the per-column counts and each
tile spans its column's share of it — that is what lets columns of different
heights coexist in one grid.

Cells are placed **explicitly** (`grid-column` / `grid-row` per cell, computed
from the board order) rather than by auto-placement: the DOM under the board
also holds the hidden, unpinned panes, so auto-placement would count the wrong
children. The same reason rules out `:first-child` for the main cell.

The maths lives in `src/renderer/src/lib/board-layout.ts`, apart from the
component, so it can be tested directly — `test/board-layout.dom.test.ts` checks
every count from 1 to 12 for exactly-once coverage of the grid, no gaps and no
overlaps.

## Consequences

- The first window is only distinguished while it is alone in its column
  (1, 2, 3 and 5 windows). At 4 it is one of four equal tiles. That is the
  deliberate trade for never leaving dead space; `free` remains for anyone who
  wants a fixed big pane.
- `tile` got the matching treatment: a part-filled last row stretches its tiles
  across the leftover columns instead of leaving a gap.
- Adding a window re-flows the whole board rather than only the stack. Terminals
  keep their PTY and scrollback — only the cells they sit in change — but the
  reflow is visible.
