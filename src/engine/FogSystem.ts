/**
 * FogSystem — pure functions for visibility and fog-of-war computation.
 *
 * Uses BFS from the player position, blocked by maze walls, so visibility
 * is maze-aware: you can only see cells reachable through open corridors
 * within the sight radius. No ray-casting needed.
 */

import type { MazeCell, FogState } from '../types/state';

// ─── BFS visibility ───────────────────────────────────────────────────────────

const DIRS = [
  { dr: -1, dc:  0, wall: 'N' as const, opp: 'S' as const },
  { dr:  0, dc:  1, wall: 'E' as const, opp: 'W' as const },
  { dr:  1, dc:  0, wall: 'S' as const, opp: 'N' as const },
  { dr:  0, dc: -1, wall: 'W' as const, opp: 'E' as const },
];

/**
 * Returns a Set of "row,col" keys visible from (pr, pc) within `radius`
 * BFS steps, blocked by cell walls.
 */
export function computeVisibleCells(
  pr: number,
  pc: number,
  radius: number,
  cells: MazeCell[][],
): Set<string> {
  const rows    = cells.length;
  const cols    = rows > 0 ? cells[0].length : 0;
  const visible = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ r: number; c: number; dist: number }> = [
    { r: pr, c: pc, dist: 0 },
  ];

  while (queue.length > 0) {
    const { r, c, dist } = queue.shift()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    visible.add(key);
    if (dist >= radius) continue;

    const cell = cells[r][c];
    for (const { dr, dc, wall } of DIRS) {
      if (cell.walls[wall]) continue;          // wall blocks passage
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nk = `${nr},${nc}`;
      if (!visited.has(nk)) queue.push({ r: nr, c: nc, dist: dist + 1 });
    }
  }

  return visible;
}

// ─── Fog map operations ───────────────────────────────────────────────────────

/** Build an all-dark fog map for a maze of given dimensions. */
export function makeDarkFogMap(rows: number, cols: number): FogState[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (): FogState => 'dark'),
  );
}

/**
 * Return a new fog map where:
 *  - cells in `visibleKeys` → 'lit'
 *  - cells that WERE 'lit' but are no longer → 'explored'
 *  - 'dark' and 'explored' cells not in visibleKeys stay unchanged
 */
export function updateFogMap(
  fogMap: FogState[][],
  visibleKeys: Set<string>,
): FogState[][] {
  return fogMap.map((row, r) =>
    row.map((state, c) => {
      const key = `${r},${c}`;
      if (visibleKeys.has(key)) return 'lit';
      if (state === 'lit')       return 'explored';
      return state;
    }),
  );
}

/**
 * Collapse ink-expanded visibility back to a normal-radius view.
 * Cells that were lit only by ink (outside normalKeys) become 'explored'.
 */
export function collapseInkFog(
  fogMap: FogState[][],
  normalKeys: Set<string>,
): FogState[][] {
  return fogMap.map((row, r) =>
    row.map((state, c) => {
      if (normalKeys.has(`${r},${c}`)) return 'lit';
      if (state === 'lit')              return 'explored';
      return state;
    }),
  );
}
