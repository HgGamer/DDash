import type { GitCommit } from '@shared/git';

/**
 * Per-commit graph geometry. Each row describes the lane state BEFORE and
 * AFTER this commit is placed, plus the edges the renderer should draw.
 *
 * The layout is produced by walking the log in the order git returned it
 * (newest → oldest, `lanesOut` being what the next row sees as `lanesIn`).
 * Lanes are small integer columns; `null` entries are placeholder gaps left
 * behind by terminated branches.
 */
export interface GraphRow {
  /** Column index where this commit's node sits. */
  nodeLane: number;
  /** Hashes each lane is "waiting for" coming in from the previous row. */
  lanesIn: (string | null)[];
  /** Hashes each lane is "waiting for" going out to the next row. */
  lanesOut: (string | null)[];
  /** Edges to draw from the commit's node (at `nodeLane`, middle of row) to
   *  each parent's outgoing lane at the bottom of the row. */
  parentEdges: { toLane: number }[];
  /** Pass-through lanes (non-node) whose column index changes between in→out
   *  because of compaction. For MVP we don't compact, so this is always
   *  pairs where in===out; kept for future use. */
  passthrough: { inLane: number; outLane: number }[];
}

/**
 * Compute the graph layout for a linear list of commits (newest first).
 *
 * Algorithm per row, starting from `lanes = []`:
 *   1. Find a lane currently expecting this commit's hash. If none, open a
 *      new lane at the end and place the node there.
 *   2. Pass-through for every other lane stays at the same index (no
 *      compaction).
 *   3. Replace the node's lane with the commit's first parent (or `null`
 *      if the commit is a root).
 *   4. For each additional parent, reuse an existing lane that's already
 *      expecting that parent, or open a new lane at the end.
 */
export function layoutCommitGraph(commits: GitCommit[]): GraphRow[] {
  const rows: GraphRow[] = [];
  let lanes: (string | null)[] = [];

  for (const c of commits) {
    const lanesIn = lanes.slice();

    // Step 1: place the node.
    let nodeLane = lanesIn.indexOf(c.hash);
    if (nodeLane === -1) {
      nodeLane = lanesIn.length;
      lanesIn.push(c.hash);
    }

    // Step 2–4: compute lanesOut by mutating a copy of lanesIn.
    const lanesOut = lanesIn.slice();
    // Vacate the node's lane — its old hash (this commit) has been consumed.
    lanesOut[nodeLane] = null;

    // For each parent, reuse any lane that's already waiting for that parent
    // (so diverged branches merge visually at shared ancestors). Otherwise
    // prefer the just-vacated nodeLane, or append a fresh lane.
    const parentEdges: { toLane: number }[] = [];
    for (const p of c.parents) {
      const existing = lanesOut.indexOf(p);
      if (existing !== -1) {
        parentEdges.push({ toLane: existing });
      } else if (lanesOut[nodeLane] === null) {
        lanesOut[nodeLane] = p;
        parentEdges.push({ toLane: nodeLane });
      } else {
        const newLane = lanesOut.length;
        lanesOut.push(p);
        parentEdges.push({ toLane: newLane });
      }
    }

    // Trim trailing nulls from lanes so the map doesn't grow forever when
    // branches terminate.
    while (lanesOut.length > 0 && lanesOut[lanesOut.length - 1] === null) {
      lanesOut.pop();
    }

    const passthrough: { inLane: number; outLane: number }[] = [];
    for (let i = 0; i < lanesIn.length; i++) {
      if (i === nodeLane) continue;
      if (lanesIn[i] === null) continue;
      // No compaction in this implementation — so a passthrough lane keeps
      // its index. Still record it so the renderer can draw the vertical.
      if (i < lanesOut.length && lanesOut[i] === lanesIn[i]) {
        passthrough.push({ inLane: i, outLane: i });
      }
    }

    rows.push({ nodeLane, lanesIn, lanesOut, parentEdges, passthrough });
    lanes = lanesOut;
  }

  return rows;
}

/**
 * Maximum lane index used across all rows. Helps the renderer size the SVG
 * column it reserves for the graph.
 */
export function maxLane(rows: GraphRow[]): number {
  let m = 0;
  for (const r of rows) {
    m = Math.max(m, r.nodeLane);
    for (let i = 0; i < r.lanesIn.length; i++) m = Math.max(m, i);
    for (let i = 0; i < r.lanesOut.length; i++) m = Math.max(m, i);
  }
  return m;
}

export const LANE_COLORS = [
  '#7aa2f7', // accent blue
  '#9ece6a', // green
  '#e0af68', // orange
  '#bb9af7', // purple
  '#7dcfff', // cyan
  '#f7768e', // pink
];

export function laneColor(laneIndex: number): string {
  return LANE_COLORS[laneIndex % LANE_COLORS.length];
}
