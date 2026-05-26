/**
 * MazeGen — procedural maze generation + config builder.
 *
 * Algorithm: recursive backtracker (depth-first search with random ordering).
 * Produces a perfect maze: every cell reachable, exactly one path between
 * any two cells. Seeded PRNG ensures reproducible layouts for fixed levels.
 */

import type { MazeCell, MazeConfig, EnemySpawnDef, EnemyType } from '../types/state';

// ─── Seeded PRNG (xorshift32) ─────────────────────────────────────────────────

class PRNG {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >> 17;
    this.s ^= this.s << 5;
    return (this.s >>> 0) / 4294967296;
  }
  nextInt(max: number): number { return Math.floor(this.next() * max); }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ─── Cell factory ─────────────────────────────────────────────────────────────

function makeCell(row: number, col: number): MazeCell {
  return {
    row, col,
    walls: { N: true, E: true, S: true, W: true },
    isExit: false,
    isStart: false,
  };
}

// ─── Maze generation ──────────────────────────────────────────────────────────

const DIRS = [
  { dr: -1, dc:  0, wall: 'N' as const, opp: 'S' as const },
  { dr:  0, dc:  1, wall: 'E' as const, opp: 'W' as const },
  { dr:  1, dc:  0, wall: 'S' as const, opp: 'N' as const },
  { dr:  0, dc: -1, wall: 'W' as const, opp: 'E' as const },
];

/** Generate a perfect maze using recursive backtracker. */
export function generateMaze(rows: number, cols: number, seed = Date.now()): MazeCell[][] {
  const rng = new PRNG(seed);
  const cells: MazeCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => makeCell(r, c)),
  );
  const visited = new Set<string>();

  function carve(r: number, c: number): void {
    visited.add(`${r},${c}`);
    for (const { dr, dc, wall, opp } of rng.shuffle([...DIRS])) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (visited.has(`${nr},${nc}`)) continue;
      cells[r][c].walls[wall] = false;
      cells[nr][nc].walls[opp]  = false;
      carve(nr, nc);
    }
  }

  carve(0, 0);
  return cells;
}

// ─── Config builder ───────────────────────────────────────────────────────────

export interface MazeBuildOptions {
  rows:             number;
  cols:             number;
  seed:             number;
  victoryCondition: 'REACH_EXIT' | 'COLLECT_PRIZE' | 'SURVIVE_WAVES';
  difficulty:       number;  // 1–5
}

const ENEMY_TYPES: EnemyType[] = ['PAPERCLIP', 'STAPLER', 'RED_TAPE', 'RUBBER_BAND', 'SHREDDER'];

function difficultyEnemyTypes(difficulty: number): EnemyType[] {
  if (difficulty <= 1) return ['PAPERCLIP'];
  if (difficulty <= 2) return ['PAPERCLIP', 'STAPLER'];
  if (difficulty <= 3) return ['PAPERCLIP', 'STAPLER', 'RED_TAPE'];
  if (difficulty <= 4) return ['PAPERCLIP', 'STAPLER', 'RED_TAPE', 'RUBBER_BAND'];
  return ENEMY_TYPES;
}

/** Build a full MazeConfig from options — generates the maze and places all entities. */
export function buildMazeConfig(opts: MazeBuildOptions): MazeConfig {
  const { rows, cols, seed, victoryCondition, difficulty } = opts;
  const rng = new PRNG(seed + 9999); // offset so item placement differs from carving

  const cells = generateMaze(rows, cols, seed);

  // Start = top-left; Exit = bottom-right (for non-SURVIVE_WAVES)
  const startCell: [number, number] = [0, 0];
  const exitCell:  [number, number] = [rows - 1, cols - 1];
  cells[0][0].isStart        = true;
  if (victoryCondition !== 'SURVIVE_WAVES') {
    cells[rows - 1][cols - 1].isExit = true;
  }

  // Collect candidate cells for item/enemy placement (away from start & exit)
  const candidates: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const distStart = Math.abs(r) + Math.abs(c);
      const distExit  = Math.abs(r - (rows - 1)) + Math.abs(c - (cols - 1));
      if (distStart > 2 && distExit > 2) candidates.push([r, c]);
    }
  }
  const shuffled = rng.shuffle([...candidates]);

  // Place prizes
  const prizeCount = victoryCondition === 'COLLECT_PRIZE' ? Math.min(3 + difficulty, 6) : 0;
  const prizes: [number, number][] = [];
  for (let i = 0; i < prizeCount && i < shuffled.length; i++) {
    const [r, c] = shuffled[i];
    cells[r][c].item = 'PRIZE';
    prizes.push([r, c]);
  }

  // Place ink charges
  const inkCount = 2 + Math.floor(difficulty / 2);
  for (let i = prizeCount; i < prizeCount + inkCount && i < shuffled.length; i++) {
    const [r, c] = shuffled[i];
    if (!cells[r][c].item) cells[r][c].item = 'INK_CHARGE';
  }

  // Place health packs
  const hpCount = 1 + Math.floor(difficulty / 3);
  const hpStart = prizeCount + inkCount;
  for (let i = hpStart; i < hpStart + hpCount && i < shuffled.length; i++) {
    const [r, c] = shuffled[i];
    if (!cells[r][c].item) cells[r][c].item = 'HEALTH';
  }

  // Place enemies
  const availableTypes = difficultyEnemyTypes(difficulty);
  const enemyCount     = 2 + difficulty * 2;
  const enemySlots     = rng.shuffle([...shuffled]).slice(0, enemyCount);
  const enemySpawns: EnemySpawnDef[] = enemySlots.map(([r, c]) => {
    const type: EnemyType = availableTypes[rng.nextInt(availableTypes.length)];
    // Build a short patrol path for PATROL enemies
    const behavior: EnemyBehavior = type === 'PAPERCLIP' || type === 'RUBBER_BAND'
      ? 'LURK'
      : type === 'RED_TAPE'
      ? 'WANDER'
      : 'PATROL';

    const patrolPath = behavior === 'PATROL'
      ? buildPatrolPath(r, c, cells, rows, cols, 4)
      : [];

    return { type, row: r, col: c, behavior, patrolPath };
  });

  return {
    rows, cols, cells,
    startCell, exitCell, prizes,
    enemySpawns,
    totalPrizes: prizeCount,
  };
}

// ─── Patrol path builder ──────────────────────────────────────────────────────

/** Walk `length` steps from (r,c) through open corridors to form a patrol segment. */
function buildPatrolPath(
  r: number, c: number,
  cells: MazeCell[][],
  rows: number, cols: number,
  length: number,
): ReadonlyArray<readonly [number, number]> {
  const DIRSARR = [
    { dr: -1, dc:  0, wall: 'N' as const },
    { dr:  0, dc:  1, wall: 'E' as const },
    { dr:  1, dc:  0, wall: 'S' as const },
    { dr:  0, dc: -1, wall: 'W' as const },
  ];
  const path: [number, number][] = [[r, c]];
  let cr = r, cc = c;

  for (let i = 0; i < length; i++) {
    const open = DIRSARR.filter(({ wall }) => !cells[cr][cc].walls[wall]).map(({ dr, dc }) => {
      const nr = cr + dr, nc = cc + dc;
      return (nr >= 0 && nr < rows && nc >= 0 && nc < cols) ? [nr, nc] as [number, number] : null;
    }).filter(Boolean) as [number, number][];

    if (open.length === 0) break;
    const [nr, nc] = open[Math.floor(Math.random() * open.length)];
    path.push([nr, nc]);
    cr = nr; cc = nc;
  }
  return path;
}

type EnemyBehavior = 'LURK' | 'PATROL' | 'WANDER';
