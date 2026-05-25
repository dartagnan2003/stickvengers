import type { Hero, Enemy } from '../types/entities';

// ─── Constants ────────────────────────────────────────────────────────────────

export const GRID_ROWS = 5;
export const GRID_COLS = 9;

// ─── Node occupancy ───────────────────────────────────────────────────────────

export function cellKey(row: number, col: number): string {
  return `${row}_${col}`;
}

export function parseKey(key: string): { row: number; col: number } {
  const [r, c] = key.split('_').map(Number);
  return { row: r, col: c };
}

/** True if a hero already occupies this cell. */
export function isCellOccupied(heroes: Map<string, Hero>, row: number, col: number): boolean {
  return heroes.has(cellKey(row, col));
}

/** True if coordinates are within the playable grid. */
export function isValidCell(row: number, col: number): boolean {
  return row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS;
}

// ─── Entity spatial queries ───────────────────────────────────────────────────

/**
 * Returns the hero occupying the cell at (lane, floor(x)), if any.
 * Used for melee contact resolution.
 */
export function getHeroInPath(heroes: Map<string, Hero>, lane: number, x: number): Hero | undefined {
  const col = Math.floor(x);
  return heroes.get(cellKey(lane, col));
}

/**
 * All enemies in a given lane whose x is ahead of (greater than) the anchor x.
 */
export function getEnemiesAhead(enemies: Enemy[], lane: number, anchorX: number): Enemy[] {
  return enemies.filter(e => e.y === lane && e.x > anchorX);
}

/**
 * Returns enemies within a rectangular cell-space blast radius.
 * rowRadius and colRadius are in grid units.
 */
export function getEnemiesInRadius(
  enemies: Enemy[],
  centerRow: number,
  centerCol: number,
  rowRadius: number,
  colRadius: number,
): Enemy[] {
  return enemies.filter(
    e =>
      Math.abs(e.y - centerRow) <= rowRadius &&
      Math.abs(e.x - centerCol) <= colRadius,
  );
}

// ─── Pixel-space helpers (used by renderer) ───────────────────────────────────

export const CELL_WIDTH_PCT  = 100 / GRID_COLS;  // percent of grid width
export const ROW_HEIGHT_PX   = 80;                // pixels per row

export function entityLeftPct(x: number): string {
  return `${(x / GRID_COLS) * 100}%`;
}

export function entityTopPx(y: number, offsetPx = 20): number {
  return y * ROW_HEIGHT_PX + offsetPx;
}
