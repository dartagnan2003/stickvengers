/**
 * PatrolSystem — enemy AI tick logic.
 *
 * Three behaviours:
 *   LURK    — stationary; only revealed when ink lights their cell.
 *   PATROL  — follow a predefined waypoint path, reversing at each end.
 *   WANDER  — random walk through open corridors each move tick.
 *
 * Pure function: (enemies, cells, delta) → enemies. No side effects.
 */

import type { EnemyState, MazeCell } from '../types/state';

const DIRS = [
  { dr: -1, dc:  0, wall: 'N' as const },
  { dr:  0, dc:  1, wall: 'E' as const },
  { dr:  1, dc:  0, wall: 'S' as const },
  { dr:  0, dc: -1, wall: 'W' as const },
];

/** Tick all enemies forward by `delta` seconds. */
export function tickEnemies(
  enemies: EnemyState[],
  cells: MazeCell[][],
  delta: number,
): EnemyState[] {
  const rows = cells.length;
  const cols = rows > 0 ? cells[0].length : 0;
  return enemies.map(e => tickEnemy(e, cells, rows, cols, delta));
}

function tickEnemy(
  e: EnemyState,
  cells: MazeCell[][],
  rows: number,
  cols: number,
  delta: number,
): EnemyState {
  if (!e.isAlive || e.behavior === 'LURK') return e;

  const newTimer = e.moveTimer - delta;
  if (newTimer > 0) return { ...e, moveTimer: newTimer };

  // Move time
  switch (e.behavior) {
    case 'PATROL': return doPatrol(e);
    case 'WANDER': return doWander(e, cells, rows, cols);
    default:       return { ...e, moveTimer: e.moveInterval };
  }
}

// ─── Patrol: follow waypoint path, reverse at ends ────────────────────────────

function doPatrol(e: EnemyState): EnemyState {
  const path = e.patrolPath;
  if (!path || path.length < 2) return { ...e, moveTimer: e.moveInterval };

  let nextIdx = e.patrolIndex + e.patrolDir;
  let dir     = e.patrolDir;

  if (nextIdx >= path.length) { nextIdx = path.length - 2; dir = -1; }
  else if (nextIdx < 0)       { nextIdx = 1;                dir =  1; }

  const [row, col] = path[nextIdx];
  return { ...e, row, col, patrolIndex: nextIdx, patrolDir: dir, moveTimer: e.moveInterval };
}

// ─── Wander: random walk through open corridors ───────────────────────────────

// Seeded-ish random: use enemy id hash so wander isn't perfectly synchronised
function idHash(id: string): number {
  let h = 0;
  for (const ch of id) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return h >>> 0;
}

function doWander(e: EnemyState, cells: MazeCell[][], rows: number, cols: number): EnemyState {
  const cell   = cells[e.row][e.col];
  const open   = DIRS.filter(d => {
    if (cell.walls[d.wall]) return false;
    const nr = e.row + d.dr;
    const nc = e.col + d.dc;
    return nr >= 0 && nr < rows && nc >= 0 && nc < cols;
  });

  if (open.length === 0) return { ...e, moveTimer: e.moveInterval };

  // Deterministic-ish pick using tick count + id hash
  const pick = open[(idHash(e.id) + Math.floor(e.moveTimer * 1000)) % open.length];
  return {
    ...e,
    row:       e.row + pick.dr,
    col:       e.col + pick.dc,
    moveTimer: e.moveInterval,
  };
}

// ─── Wave spawning (SURVIVE_WAVES mode) ──────────────────────────────────────

import type { EnemyType } from '../types/state';

const WAVE_ENEMY_POOLS: EnemyType[][] = [
  ['PAPERCLIP', 'PAPERCLIP', 'STAPLER'],
  ['PAPERCLIP', 'STAPLER', 'RED_TAPE'],
  ['STAPLER', 'RED_TAPE', 'RUBBER_BAND'],
  ['RED_TAPE', 'RUBBER_BAND', 'SHREDDER'],
];

const ENEMY_STATS: Record<EnemyType, { hp: number; damage: number; moveInterval: number }> = {
  PAPERCLIP:   { hp: 2,  damage: 1, moveInterval: 1.2 },
  STAPLER:     { hp: 4,  damage: 2, moveInterval: 1.8 },
  RED_TAPE:    { hp: 3,  damage: 1, moveInterval: 0.8 },
  RUBBER_BAND: { hp: 3,  damage: 2, moveInterval: 0.6 },
  SHREDDER:    { hp: 10, damage: 5, moveInterval: 2.5 },
};

let _enemyCounter = 0;

export function spawnWaveEnemies(
  waveNumber: number,
  rows: number,
  cols: number,
  existingEnemies: EnemyState[],
): EnemyState[] {
  const pool  = WAVE_ENEMY_POOLS[Math.min(waveNumber - 1, WAVE_ENEMY_POOLS.length - 1)];
  const count = 2 + Math.floor(waveNumber * 1.5);
  const newEnemies: EnemyState[] = [];

  // Spawn from random border cells
  const borderCells: [number, number][] = [];
  for (let c = 0; c < cols; c++)  { borderCells.push([0, c]); borderCells.push([rows - 1, c]); }
  for (let r = 1; r < rows - 1; r++) { borderCells.push([r, 0]); borderCells.push([r, cols - 1]); }

  const shuffled = [...borderCells].sort(() => Math.random() - 0.5);

  for (let i = 0; i < count; i++) {
    const [row, col] = shuffled[i % shuffled.length];
    const occupied   = existingEnemies.some(e => e.row === row && e.col === col);
    if (occupied) continue;

    const type  = pool[i % pool.length];
    const stats = ENEMY_STATS[type];

    newEnemies.push({
      id:           `wave_${waveNumber}_${++_enemyCounter}`,
      type,
      row, col,
      hp:           stats.hp,
      maxHp:        stats.hp,
      damage:       stats.damage,
      behavior:     type === 'RED_TAPE' ? 'WANDER' : 'PATROL',
      patrolPath:   [],
      patrolIndex:  0,
      patrolDir:    1,
      moveInterval: stats.moveInterval,
      moveTimer:    stats.moveInterval,
      isAlive:      true,
    });
  }

  return newEnemies;
}

export { ENEMY_STATS };
