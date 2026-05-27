/**
 * PatrolSystem — enemy AI tick logic.
 *
 * Four behaviours:
 *   LURK    — stationary; only revealed when ink lights their cell.
 *   PATROL  — follow a predefined waypoint path, reversing at each end.
 *   WANDER  — random walk through open corridors each move tick.
 *   CHASE   — move toward player position (used in ATTACK format).
 *
 * Pure function: (enemies, cells, delta, playerPos?) → enemies. No side effects.
 */

import type { EnemyState, EnemyType, MazeCell } from '../types/state';
import type { GameFormat } from '../types/supplies';

const DIRS = [
  { dr: -1, dc:  0, wall: 'N' as const },
  { dr:  0, dc:  1, wall: 'E' as const },
  { dr:  1, dc:  0, wall: 'S' as const },
  { dr:  0, dc: -1, wall: 'W' as const },
];

/** Tick all enemies forward by `delta` seconds. */
export function tickEnemies(
  enemies:    EnemyState[],
  cells:      MazeCell[][],
  delta:      number,
  playerPos?: readonly [number, number],
): EnemyState[] {
  const rows = cells.length;
  const cols = rows > 0 ? cells[0].length : 0;
  return enemies.map(e => tickEnemy(e, cells, rows, cols, delta, playerPos));
}

function tickEnemy(
  e:          EnemyState,
  cells:      MazeCell[][],
  rows:       number,
  cols:       number,
  delta:      number,
  playerPos?: readonly [number, number],
): EnemyState {
  if (!e.isAlive || e.behavior === 'LURK') return e;

  const newTimer = e.moveTimer - delta;
  if (newTimer > 0) return { ...e, moveTimer: newTimer };

  switch (e.behavior) {
    case 'PATROL': return doPatrol(e);
    case 'WANDER': return doWander(e, cells, rows, cols);
    case 'CHASE':  return doChase(e, cells, rows, cols, playerPos);
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

function idHash(id: string): number {
  let h = 0;
  for (const ch of id) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return h >>> 0;
}

function doWander(e: EnemyState, cells: MazeCell[][], rows: number, cols: number): EnemyState {
  const cell = cells[e.row][e.col];
  const open = DIRS.filter(d => {
    if (cell.walls[d.wall]) return false;
    const nr = e.row + d.dr;
    const nc = e.col + d.dc;
    return nr >= 0 && nr < rows && nc >= 0 && nc < cols;
  });

  if (open.length === 0) return { ...e, moveTimer: e.moveInterval };

  const pick = open[(idHash(e.id) + Math.floor(e.moveTimer * 1000)) % open.length];
  return {
    ...e,
    row:       e.row + pick.dr,
    col:       e.col + pick.dc,
    moveTimer: e.moveInterval,
  };
}

// ─── Chase: move one step toward player (wall-aware, cardinal only) ───────────

function doChase(
  e:          EnemyState,
  cells:      MazeCell[][],
  rows:       number,
  cols:       number,
  playerPos?: readonly [number, number],
): EnemyState {
  if (!playerPos) return doWander(e, cells, rows, cols);

  const [pr, pc] = playerPos;
  const cell = cells[e.row][e.col];

  // Score each open direction by how much it reduces Manhattan distance to player
  const candidates = DIRS
    .filter(d => {
      if (cell.walls[d.wall]) return false;
      const nr = e.row + d.dr;
      const nc = e.col + d.dc;
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols;
    })
    .map(d => {
      const nr = e.row + d.dr;
      const nc = e.col + d.dc;
      const dist = Math.abs(nr - pr) + Math.abs(nc - pc);
      return { d, nr, nc, dist };
    });

  if (candidates.length === 0) return { ...e, moveTimer: e.moveInterval };

  // Pick the direction with lowest distance to player
  const best = candidates.reduce((a, b) => a.dist <= b.dist ? a : b);
  return { ...e, row: best.nr, col: best.nc, moveTimer: e.moveInterval };
}

// ─── Wave spawning (DEFEND format) ───────────────────────────────────────────

const WAVE_ENEMY_POOLS: EnemyType[][] = [
  ['PAPERCLIP', 'PAPERCLIP', 'RED_TAPE'],                      // wave 1 — immediate pressure
  ['PAPERCLIP', 'STAPLER', 'RED_TAPE', 'RED_TAPE'],            // wave 2 — more speed
  ['STAPLER', 'RED_TAPE', 'RUBBER_BAND', 'RUBBER_BAND'],       // wave 3 — fast + hard-hitting
  ['RED_TAPE', 'RUBBER_BAND', 'SHREDDER'],                     // wave 4+ — heavy assault
];

export const ENEMY_STATS: Record<EnemyType, { hp: number; damage: number; moveInterval: number }> = {
  PAPERCLIP:   { hp: 2,  damage: 1, moveInterval: 0.85 },  // was 1.2 — snappier scouts
  STAPLER:     { hp: 5,  damage: 2, moveInterval: 1.3  },  // was 1.8, +1 hp — tankier
  RED_TAPE:    { hp: 3,  damage: 2, moveInterval: 0.65 },  // was 0.8, +1 dmg — fast harassment
  RUBBER_BAND: { hp: 4,  damage: 3, moveInterval: 0.5  },  // was 0.6, +1 hp +1 dmg — rocket
  SHREDDER:    { hp: 10, damage: 5, moveInterval: 1.6  },  // was 2.5 — much more aggressive
};

let _enemyCounter = 0;

export function spawnWaveEnemies(
  waveNumber: number,
  rows:       number,
  cols:       number,
  existingEnemies: EnemyState[],
  gameFormat?: GameFormat,
): EnemyState[] {
  const pool  = WAVE_ENEMY_POOLS[Math.min(waveNumber - 1, WAVE_ENEMY_POOLS.length - 1)];
  // Steep scaling in DEFEND — each wave meaningfully harder
  const baseCount = gameFormat === 'DEFEND' ? 5 + waveNumber * 3 : 2 + Math.floor(waveNumber * 1.5);
  const count = Math.min(baseCount, 28);
  const newEnemies: EnemyState[] = [];

  // DEFEND: spawn from all 4 edges. Otherwise: right edge only.
  const borderCells: [number, number][] = [];
  if (gameFormat === 'DEFEND') {
    for (let c = 0; c < cols; c++)      { borderCells.push([0, c]); borderCells.push([rows - 1, c]); }
    for (let r = 1; r < rows - 1; r++) { borderCells.push([r, 0]); borderCells.push([r, cols - 1]); }
  } else {
    for (let r = 0; r < rows; r++) borderCells.push([r, cols - 1]);
  }

  const shuffled = [...borderCells].sort(() => Math.random() - 0.5);

  for (let i = 0; i < count; i++) {
    const [row, col] = shuffled[i % shuffled.length];
    const occupied = existingEnemies.some(e => e.row === row && e.col === col);
    if (occupied) continue;

    const type  = pool[i % pool.length];
    const stats = ENEMY_STATS[type];
    // DEFEND enemies chase the player base
    const behavior: EnemyState['behavior'] = gameFormat === 'DEFEND' ? 'CHASE'
      : type === 'RED_TAPE' ? 'WANDER' : 'PATROL';

    newEnemies.push({
      id:           `wave_${waveNumber}_${++_enemyCounter}`,
      type,
      row, col,
      hp:           stats.hp,
      maxHp:        stats.hp,
      damage:       stats.damage,
      behavior,
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
