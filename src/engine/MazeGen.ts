/**
 * MazeGen — procedural maze generation + config builder.
 *
 * Algorithm: recursive backtracker (depth-first search with random ordering).
 * Produces a perfect maze: every cell reachable, exactly one path between
 * any two cells. Seeded PRNG ensures reproducible layouts for fixed levels.
 */

import type { MazeCell, MazeConfig, EnemySpawnDef, EnemyType, EnemyBehavior } from '../types/state';
import type { GameFormat, ShopNode, InventorySupply } from '../types/supplies';
import { SUPPLY_STATS } from './SupplySystem';

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
    walls:   { N: true, E: true, S: true, W: true },
    isExit:  false,
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
  rows:       number;
  cols:       number;
  seed:       number;
  gameFormat: GameFormat;
  difficulty: number;   // 1–5
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
  const { rows, cols, seed, gameFormat, difficulty } = opts;
  const rng = new PRNG(seed + 9999); // offset so item placement differs from carving

  const cells = generateMaze(rows, cols, seed);

  // ── Start cell (always top-left) ──────────────────────────────────────────
  const startCell: [number, number] = [0, 0];
  cells[0][0].isStart = true;

  // ── Exit cell ─────────────────────────────────────────────────────────────
  // DEFEND has no exit; ATTACK exit is unused (win by reaching base).
  let exitCell: [number, number] = [-1, -1];
  if (gameFormat === 'JOURNEY') {
    exitCell = [rows - 1, cols - 1];
    cells[rows - 1][cols - 1].isExit = true;
  }

  // ── Collect candidate cells for item/enemy placement ─────────────────────
  // Away from start; away from exit if it exists.
  const candidates: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const distStart = Math.abs(r) + Math.abs(c);
      const distExit  = exitCell[0] >= 0
        ? Math.abs(r - exitCell[0]) + Math.abs(c - exitCell[1])
        : 999;
      if (distStart > 2 && distExit > 2) candidates.push([r, c]);
    }
  }
  const shuffled = rng.shuffle([...candidates]);

  // ── ATTACK: fortify enemy base (bottom-right quadrant) ───────────────────
  if (gameFormat === 'ATTACK') {
    const baseR = rows - 1;
    const baseC = cols - 1;
    cells[baseR][baseC].isBase  = true;
    cells[baseR][baseC].isExit  = false;
    // Fortify cells surrounding the base with perm walls
    for (let dr = -2; dr <= 0; dr++) {
      for (let dc = -2; dc <= 0; dc++) {
        const r = baseR + dr;
        const c = baseC + dc;
        if (r < 0 || c < 0 || (r === baseR && c === baseC)) continue;
        if (rng.next() < 0.5) {
          cells[r][c].walls  = { N: true, E: true, S: true, W: true };
          cells[r][c].permWall = true;
          // Mirror sealed walls on neighbors
          if (r > 0) cells[r-1][c].walls.S = true;
          if (r < rows - 1) cells[r+1][c].walls.N = true;
          if (c > 0) cells[r][c-1].walls.E = true;
          if (c < cols - 1) cells[r][c+1].walls.W = true;
        }
      }
    }
    // Ensure at least one corridor into the base area exists
    const gapR = baseR - 2;
    const gapC = Math.max(0, baseC - 1);
    if (gapR >= 0) {
      cells[gapR][gapC].walls.E = false;
      cells[gapR][gapC].walls.S = false;
      if (gapC + 1 < cols) cells[gapR][gapC + 1].walls.W = false;
      if (gapR + 1 < rows) cells[gapR + 1][gapC].walls.N = false;
    }
  }

  // ── DEFEND: player base at center ────────────────────────────────────────
  if (gameFormat === 'DEFEND') {
    const baseR = Math.floor(rows / 2);
    const baseC = Math.floor(cols / 2);
    cells[baseR][baseC].isBase = true;
  }

  // ── Place prizes (JOURNEY only for now) ──────────────────────────────────
  const prizeCount = gameFormat === 'JOURNEY' ? Math.min(2 + difficulty, 5) : 0;
  const prizes: [number, number][] = [];
  for (let i = 0; i < prizeCount && i < shuffled.length; i++) {
    const [r, c] = shuffled[i];
    cells[r][c].item = 'PRIZE';
    prizes.push([r, c]);
  }

  // ── Place ink charges ─────────────────────────────────────────────────────
  const inkCount = 1 + Math.floor(difficulty / 2);
  for (let i = prizeCount; i < prizeCount + inkCount && i < shuffled.length; i++) {
    const [r, c] = shuffled[i];
    if (!cells[r][c].item) cells[r][c].item = 'INK_CHARGE';
  }

  // ── Place health packs ────────────────────────────────────────────────────
  const hpCount = 1 + Math.floor(difficulty / 3);
  const hpStart = prizeCount + inkCount;
  for (let i = hpStart; i < hpStart + hpCount && i < shuffled.length; i++) {
    const [r, c] = shuffled[i];
    if (!cells[r][c].item) cells[r][c].item = 'HEALTH';
  }

  // ── Place shop nodes (1–2) ────────────────────────────────────────────────
  const shopCandidates = rng.shuffle([...shuffled]).slice(hpStart + hpCount);
  const shopNodes: ShopNode[] = [];
  const shopCount = gameFormat === 'DEFEND' ? 1 : 2;
  for (let i = 0; i < shopCount && i < shopCandidates.length; i++) {
    const [r, c] = shopCandidates[i];
    if (cells[r][c].item || cells[r][c].isBase || cells[r][c].isExit) continue;
    cells[r][c].isShop = true;
    shopNodes.push({ row: r, col: c, stock: buildShopStock(rng) });
  }

  // ── Place enemies ─────────────────────────────────────────────────────────
  const availableTypes = difficultyEnemyTypes(difficulty);
  const enemyCount     = gameFormat === 'DEFEND' ? 0 : 2 + difficulty * 2; // DEFEND spawns via waves
  const enemySlots     = rng.shuffle([...shuffled]).slice(0, enemyCount);
  const enemySpawns: EnemySpawnDef[] = enemySlots.map(([r, c]) => {
    const type: EnemyType = availableTypes[rng.nextInt(availableTypes.length)];
    const behavior: EnemyBehavior =
      gameFormat === 'ATTACK'
        ? (rng.next() < 0.5 ? 'CHASE' : 'PATROL')
        : type === 'PAPERCLIP' || type === 'RUBBER_BAND'
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
    shopNodes,
  };
}

// ─── Shop stock builder ───────────────────────────────────────────────────────

function buildShopStock(rng: PRNG): InventorySupply[] {
  // Deterministic selection of T2 supplies available for purchase
  const allTypes = Object.keys(SUPPLY_STATS) as Array<keyof typeof SUPPLY_STATS>;
  const chosen = rng.shuffle([...allTypes]).slice(0, 5);
  const stock: InventorySupply[] = [];
  for (const type of chosen) {
    // Offer T2 and T3 versions in shop
    stock.push({ type, tier: 2, count: 2 });
    if (rng.next() < 0.4) stock.push({ type, tier: 3, count: 1 });
  }
  return stock;
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
    const open = DIRSARR
      .filter(({ wall }) => !cells[cr][cc].walls[wall])
      .map(({ dr, dc }) => {
        const nr = cr + dr, nc = cc + dc;
        return (nr >= 0 && nr < rows && nc >= 0 && nc < cols) ? [nr, nc] as [number, number] : null;
      })
      .filter(Boolean) as [number, number][];

    if (open.length === 0) break;
    const [nr, nc] = open[Math.floor(Math.random() * open.length)];
    path.push([nr, nc]);
    cr = nr; cc = nc;
  }
  return path;
}
