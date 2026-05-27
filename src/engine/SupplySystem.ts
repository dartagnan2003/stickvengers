/**
 * SupplySystem — pure supply placement and effect resolution.
 *
 * No React / DOM imports. All functions are pure transformations on GameState.
 * Designed to be called from GameReducer handlers only.
 */

import type { GameState, EnemyType, Direction } from '../types/state';
import type {
  SupplyType, SupplyTier, CellEffectType, PlacedSupply, InventorySupply,
} from '../types/supplies';
import { computeVisibleCells, updateFogMap, collapseInkFog } from './FogSystem';

// ─── SUPPLY_STATS ─────────────────────────────────────────────────────────────

interface TierStats {
  /** ⚡ cost when buying from a shop. T1 always 0 (dropped free from enemies). */
  energyCost:      number;
  /** HIGHLIGHTER: fog reveal radius. */
  revealRadius?:   number;
  /** HIGHLIGHTER: effect lifetime in seconds; -1 = permanent. */
  revealDuration?: number;
  /** STICKY_NOTE: damage dealt. */
  damage?:         number;
  /** PAPERCLIP: number of cells in the wall chain. */
  chainLength?:    number;
  /** RUBBER_BAND: launch distance in cells. */
  launchDist?:     number;
  /** Probability (0–1) of dropping T1 on enemy kill. */
  dropRate:        number;
}

interface SupplyStatEntry {
  emoji:       string;
  displayName: string;
  tiers:       Record<SupplyTier, TierStats>;
}

export const SUPPLY_STATS: Record<SupplyType, SupplyStatEntry> = {
  PAPERCLIP: {
    emoji: '📎', displayName: 'Paperclip',
    tiers: {
      1: { energyCost: 0,  chainLength: 1, dropRate: 0.70 },
      2: { energyCost: 10, chainLength: 2, dropRate: 0.20 },
      3: { energyCost: 25, chainLength: 3, damage: 2, dropRate: 0.05 },
    },
  },
  STAPLER: {
    emoji: '🖇️', displayName: 'Stapler',
    tiers: {
      1: { energyCost: 0,  dropRate: 0.70 },
      2: { energyCost: 12, dropRate: 0.20 },
      3: { energyCost: 28, dropRate: 0.05 },
    },
  },
  RED_TAPE: {
    emoji: '📋', displayName: 'Red Tape',
    tiers: {
      1: { energyCost: 0,  dropRate: 0.70 },
      2: { energyCost: 10, dropRate: 0.20 },
      3: { energyCost: 22, dropRate: 0.05 },
    },
  },
  RUBBER_BAND: {
    emoji: '🔗', displayName: 'Rubber Band',
    tiers: {
      1: { energyCost: 0,  launchDist: 2, dropRate: 0.60 },
      2: { energyCost: 15, launchDist: 3, dropRate: 0.15 },
      3: { energyCost: 30, launchDist: 4, dropRate: 0.05 },
    },
  },
  INK_BLOT: {
    emoji: '🖊️', displayName: 'Ink Blot',
    tiers: {
      1: { energyCost: 0,  dropRate: 0.50 },
      2: { energyCost: 18, dropRate: 0.15 },
      3: { energyCost: 35, dropRate: 0.05 },
    },
  },
  HIGHLIGHTER: {
    emoji: '✏️', displayName: 'Highlighter',
    tiers: {
      1: { energyCost: 0,  revealRadius: 2, revealDuration: 5,  dropRate: 0.60 },
      2: { energyCost: 14, revealRadius: 3, revealDuration: 8,  dropRate: 0.15 },
      3: { energyCost: 30, revealRadius: 4, revealDuration: -1, dropRate: 0.05 },
    },
  },
  WHITEOUT: {
    emoji: '⬜', displayName: 'Whiteout',
    tiers: {
      1: { energyCost: 0,  dropRate: 0.55 },
      2: { energyCost: 12, dropRate: 0.15 },
      3: { energyCost: 28, dropRate: 0.05 },
    },
  },
  SHARPIE: {
    emoji: '🖋️', displayName: 'Sharpie',
    tiers: {
      1: { energyCost: 0,  dropRate: 0.40 },
      2: { energyCost: 20, dropRate: 0.10 },
      3: { energyCost: 40, dropRate: 0.03 },
    },
  },
  STICKY_NOTE: {
    emoji: '📝', displayName: 'Sticky Note',
    tiers: {
      1: { energyCost: 0,  damage: 3, dropRate: 0.60 },
      2: { energyCost: 12, damage: 5, dropRate: 0.15 },
      3: { energyCost: 25, damage: 8, dropRate: 0.05 },
    },
  },
  CRAYON: {
    emoji: '🖍️', displayName: 'Crayon',
    tiers: {
      1: { energyCost: 0,  dropRate: 0.80 },
      2: { energyCost: 5,  dropRate: 0.25 },
      3: { energyCost: 15, dropRate: 0.10 },
    },
  },
  ERASER: {
    emoji: '🧹', displayName: 'Eraser',
    tiers: {
      1: { energyCost: 0,  dropRate: 0.60 },
      2: { energyCost: 10, dropRate: 0.20 },
      3: { energyCost: 22, dropRate: 0.05 },
    },
  },
};

// ─── Enemy drop tables ────────────────────────────────────────────────────────

const ENEMY_ENERGY_DROP: Record<EnemyType, number> = {
  PAPERCLIP:   2,
  STAPLER:     4,
  RED_TAPE:    3,
  RUBBER_BAND: 5,
  SHREDDER:    12,
};

const ENEMY_SUPPLY_DROP: Record<EnemyType, SupplyType> = {
  PAPERCLIP:   'PAPERCLIP',
  STAPLER:     'STAPLER',
  RED_TAPE:    'RED_TAPE',
  RUBBER_BAND: 'RUBBER_BAND',
  SHREDDER:    'SHARPIE',    // Shredder drops heavy artillery
};

export function getSupplyEnergyDrop(enemyType: EnemyType): number {
  return ENEMY_ENERGY_DROP[enemyType];
}

/** Returns a T1 supply drop (70% chance) or null. Uses Math.random intentionally — not seeded. */
export function getSupplyDrop(enemyType: EnemyType): InventorySupply | null {
  const dropRate = SUPPLY_STATS[ENEMY_SUPPLY_DROP[enemyType]].tiers[1].dropRate;
  if (Math.random() > dropRate) return null;
  return { type: ENEMY_SUPPLY_DROP[enemyType], tier: 1, count: 1 };
}

// ─── Effect type mapping ──────────────────────────────────────────────────────

const SUPPLY_TO_EFFECT: Record<SupplyType, CellEffectType> = {
  PAPERCLIP:   'WALL',
  STAPLER:     'BRIDGE',
  RED_TAPE:    'SLOW',
  RUBBER_BAND: 'PORTAL_IN',
  INK_BLOT:    'PORTAL_IN',
  HIGHLIGHTER: 'REVEAL',
  WHITEOUT:    'WALL',       // never actually added; special-cased in handlePlaceSupply
  SHARPIE:     'PERM_WALL',
  STICKY_NOTE: 'TRAP',
  CRAYON:      'MARK',
  ERASER:      'BRIDGE',
};

export function supplyTypeToEffect(type: SupplyType): CellEffectType {
  return SUPPLY_TO_EFFECT[type];
}

// ─── canPlaceSupply ───────────────────────────────────────────────────────────

/**
 * Returns true if the player can place the given supply at (row, col).
 * Called by both the reducer (for validation) and the canvas (for drag highlighting).
 */
export function canPlaceSupply(
  type: SupplyType,
  tier: SupplyTier,
  row: number,
  col: number,
  state: GameState,
): boolean {
  const { maze, players, placedSupplies } = state;
  const player = players['p1'];
  if (!player?.isAlive) return false;

  // Bounds check
  if (row < 0 || row >= maze.rows || col < 0 || col >= maze.cols) return false;

  const cell = maze.cells[row][col];
  const fog  = player.fogMap[row]?.[col] ?? 'dark';

  // Must have seen the cell
  if (fog === 'dark') return false;

  // Inventory check
  const invItem = player.inventory.find(i => i.type === type && i.tier === tier);
  if (!invItem || invItem.count < 1) return false;

  // WHITEOUT: must have a removable supply at target; permWall cells are immune
  if (type === 'WHITEOUT') {
    if (cell.permWall) return false;
    const target = placedSupplies.find(ps => ps.row === row && ps.col === col);
    if (!target) return false;
    if (target.effect === 'PERM_WALL' && tier < 3) return false; // T3 SHARPIE is WHITEOUT-immune
    return true;
  }

  // ERASER: must be placed on a cell adjacent to the player (1 step away)
  if (type === 'ERASER') {
    const dr = Math.abs(row - player.row);
    const dc = Math.abs(col - player.col);
    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
      // Must have a wall in the direction toward target from player
      const dir = getDirection(player.row, player.col, row, col);
      if (!dir) return false;
      if (!maze.cells[player.row][player.col].walls[dir]) return false;
    } else {
      return false;
    }
    return true;
  }

  // PAPERCLIP / SHARPIE: cannot place on special cells
  if (type === 'PAPERCLIP' || type === 'SHARPIE') {
    if (cell.isStart || cell.isExit || cell.isShop || cell.isBase) return false;
    if (cell.permWall) return false;
  }

  // RUBBER_BAND: must be placed in a cardinal direction from player
  if (type === 'RUBBER_BAND') {
    const dr = row - player.row;
    const dc = col - player.col;
    if (dr !== 0 && dc !== 0) return false; // reject diagonals
    if (dr === 0 && dc === 0) return false;  // same cell
    // Target cell (launch destination) must be in bounds
    const dist = SUPPLY_STATS.RUBBER_BAND.tiers[tier].launchDist ?? 2;
    const normR = Math.sign(dr);
    const normC = Math.sign(dc);
    const tr = row + normR * dist;
    const tc = col + normC * dist;
    if (tr < 0 || tr >= maze.rows || tc < 0 || tc >= maze.cols) return false;
  }

  // INK_BLOT side B: must not be same cell as pending side A
  if (type === 'INK_BLOT' && state.pendingPortal !== null) {
    const sideA = placedSupplies.find(ps => ps.id === state.pendingPortal);
    if (sideA && sideA.row === row && sideA.col === col) return false;
  }

  // No same-type duplicate on cell (except CRAYON — always stackable)
  if (type !== 'CRAYON') {
    const dup = placedSupplies.find(ps => ps.row === row && ps.col === col && ps.type === type);
    if (dup) return false;
  }

  return true;
}

// ─── applySupplyEffect ────────────────────────────────────────────────────────

/**
 * Applies the supply's effect to the maze cells (wall mutations) and adds it
 * to placedSupplies. Returns the updated GameState.
 *
 * WHITEOUT must NOT be passed here — it is handled separately in handlePlaceSupply.
 */
export function applySupplyEffect(state: GameState, supply: PlacedSupply): GameState {
  let cells = state.maze.cells;
  let newSupply = { ...supply };

  const { row, col, type, tier } = supply;

  if (type === 'PAPERCLIP' || type === 'SHARPIE') {
    // Seal all 4 walls of the target cell
    const snapshot: Record<string, boolean> = {};
    const cell = cells[row][col];
    (['N','E','S','W'] as Direction[]).forEach(d => {
      snapshot[`${row},${col}:${d}`] = cell.walls[d];
    });
    // Also snapshot neighbor walls that face this cell
    const neighbors: Array<[Direction, Direction, number, number]> = [
      ['N', 'S', row - 1, col],
      ['E', 'W', row, col + 1],
      ['S', 'N', row + 1, col],
      ['W', 'E', row, col - 1],
    ];
    for (const [, oppDir, nr, nc] of neighbors) {
      if (nr >= 0 && nr < state.maze.rows && nc >= 0 && nc < state.maze.cols) {
        snapshot[`${nr},${nc}:${oppDir}`] = cells[nr][nc].walls[oppDir];
      }
    }
    newSupply.wallSnapshot = snapshot;

    // Apply chain (T2 = 2 cells, T3 = 3 cells in same line)
    const chain = SUPPLY_STATS[type].tiers[tier].chainLength ?? 1;
    cells = sealCellWalls(cells, row, col);
    if (chain >= 2) {
      // Chain along the nearest open corridor direction from player
      const player = state.players['p1'];
      const dr = Math.sign(row - player.row);
      const dc = Math.sign(col - player.col);
      if (dr === 0 && dc === 0) {
        // player is on same cell — seal eastward by default
        if (col + 1 < state.maze.cols) cells = sealCellWalls(cells, row, col + 1);
        if (chain >= 3 && col + 2 < state.maze.cols) cells = sealCellWalls(cells, row, col + 2);
      } else {
        const r2 = row + dr; const c2 = col + dc;
        if (r2 >= 0 && r2 < state.maze.rows && c2 >= 0 && c2 < state.maze.cols)
          cells = sealCellWalls(cells, r2, c2);
        if (chain >= 3) {
          const r3 = row + 2 * dr; const c3 = col + 2 * dc;
          if (r3 >= 0 && r3 < state.maze.rows && c3 >= 0 && c3 < state.maze.cols)
            cells = sealCellWalls(cells, r3, c3);
        }
      }
    }

  } else if (type === 'STAPLER' || type === 'ERASER') {
    // Open walls between player and target cell
    const player = state.players['p1'];
    const dir = getDirection(player.row, player.col, row, col);
    if (dir) {
      const snapshot: Record<string, boolean> = {};
      snapshot[`${player.row},${player.col}:${dir}`] = cells[player.row][player.col].walls[dir];
      const oppDir = OPPOSITE[dir];
      snapshot[`${row},${col}:${oppDir}`] = cells[row][col].walls[oppDir];
      newSupply.wallSnapshot = snapshot;
      cells = openWall(cells, player.row, player.col, row, col, dir);
    }

  } else if (type === 'HIGHLIGHTER') {
    // Immediately reveal fog from supply position
    const stats = SUPPLY_STATS.HIGHLIGHTER.tiers[tier];
    const radius = stats.revealRadius ?? 2;
    const duration = stats.revealDuration ?? 5;
    const p = state.players['p1'];
    const visKeys = computeVisibleCells(row, col, radius, cells);
    const newFog = updateFogMap(p.fogMap, visKeys);
    newSupply.turnsLeft = duration;
    return {
      ...state,
      maze: { ...state.maze, cells },
      players: {
        ...state.players,
        p1: { ...p, fogMap: newFog },
      },
      placedSupplies: [...state.placedSupplies, newSupply],
    };
  }

  return {
    ...state,
    maze: { ...state.maze, cells },
    placedSupplies: [...state.placedSupplies, newSupply],
  };
}

// ─── removeSupplyAt (used by WHITEOUT handler) ────────────────────────────────

/** Removes the PlacedSupply at (row,col) and restores wall changes. */
export function removeSupplyAt(
  state: GameState,
  row: number,
  col: number,
  tier: SupplyTier,
): GameState {
  const target = state.placedSupplies.find(
    ps => ps.row === row && ps.col === col && ps.effect !== 'MARK',
  );
  if (!target) return state;

  let cells = state.maze.cells;

  // Restore walls from snapshot
  if (target.wallSnapshot) {
    for (const [key, wasWalled] of Object.entries(target.wallSnapshot)) {
      // key = "row,col:DIR"
      const [coords, dir] = key.split(':');
      const [r, c] = coords.split(',').map(Number);
      if (r >= 0 && r < state.maze.rows && c >= 0 && c < state.maze.cols) {
        cells = cells.map((rowArr, ri) =>
          ri !== r ? rowArr : rowArr.map((cell, ci) =>
            ci !== c ? cell : {
              ...cell,
              walls: { ...cell.walls, [dir]: wasWalled },
            },
          ),
        );
      }
    }
  }

  // T2 WHITEOUT: refund half the supply cost (add 1 energy)
  // T3 WHITEOUT: full refund
  const refundEnergy = tier >= 3 ? (SUPPLY_STATS[target.type].tiers[target.tier].energyCost)
                     : tier >= 2 ? Math.floor(SUPPLY_STATS[target.type].tiers[target.tier].energyCost / 2)
                     : 0;

  const player = state.players['p1'];
  const newEnergy = Math.min(player.maxEnergy, player.energy + refundEnergy);

  return {
    ...state,
    maze: { ...state.maze, cells },
    placedSupplies: state.placedSupplies.filter(ps => ps.id !== target.id),
    players: { ...state.players, p1: { ...player, energy: newEnergy } },
  };
}

// ─── Portal resolution ────────────────────────────────────────────────────────

/** Teleports player to the linked portal cell. */
export function resolvePortalEntry(
  state: GameState,
  playerId: string,
  supply: PlacedSupply,
): GameState {
  const player = state.players[playerId];
  if (!player || !supply.linkedId) return state;

  let destRow: number;
  let destCol: number;

  if (supply.type === 'RUBBER_BAND') {
    // linkedId is "row,col" string
    const parts = supply.linkedId.split(',');
    destRow = parseInt(parts[0], 10);
    destCol = parseInt(parts[1], 10);
  } else {
    // INK_BLOT — find linked PlacedSupply
    const other = state.placedSupplies.find(ps => ps.id === supply.linkedId);
    if (!other) return state;
    destRow = other.row;
    destCol = other.col;
  }

  if (destRow < 0 || destRow >= state.maze.rows || destCol < 0 || destCol >= state.maze.cols) {
    return state;
  }

  const visKeys = computeVisibleCells(destRow, destCol, 2, state.maze.cells);
  const newFog  = updateFogMap(player.fogMap, visKeys);

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, row: destRow, col: destCol, fogMap: newFog },
    },
  };
}

// ─── Trap resolution ──────────────────────────────────────────────────────────

/**
 * Triggers STICKY_NOTE trap at (row,col) for the given entity.
 * `isPlayer` true = damage player; false = damage enemy with `entityId`.
 */
export function resolveTrapTrigger(
  state: GameState,
  entityId: string,
  isPlayer: boolean,
  row: number,
  col: number,
): GameState {
  const trap = state.placedSupplies.find(
    ps => ps.row === row && ps.col === col && ps.effect === 'TRAP',
  );
  if (!trap) return state;

  const stats = SUPPLY_STATS.STICKY_NOTE.tiers[trap.tier];
  const dmg   = stats.damage ?? 3;

  // Remove trap (T1/T2) or set reloading timer (T3)
  let newSupplies: PlacedSupply[];
  if (trap.tier >= 3) {
    newSupplies = state.placedSupplies.map(ps =>
      ps.id === trap.id ? { ...ps, turnsLeft: 3 } : ps,
    );
  } else {
    newSupplies = state.placedSupplies.filter(ps => ps.id !== trap.id);
  }

  let newState = { ...state, placedSupplies: newSupplies };

  if (isPlayer) {
    const player = newState.players[entityId];
    if (!player) return newState;
    const newHp = player.hp - dmg;
    newState = {
      ...newState,
      players: {
        ...newState.players,
        [entityId]: { ...player, hp: newHp, isAlive: newHp > 0 },
      },
    };
  } else {
    newState = {
      ...newState,
      enemies: newState.enemies.map(e =>
        e.id === entityId
          ? { ...e, hp: e.hp - dmg, isAlive: e.hp - dmg > 0 }
          : e,
      ),
    };
  }

  return newState;
}

// ─── Tick placed supplies ─────────────────────────────────────────────────────

/** Counts down timed effects. Removes expired ones. Handles HIGHLIGHTER fog collapse. */
export function tickPlacedSupplies(state: GameState, delta: number): GameState {
  const player    = state.players['p1'];
  let newSupplies = state.placedSupplies;
  let newFog      = player?.fogMap;
  let changed     = false;

  newSupplies = newSupplies.map(ps => {
    if (ps.turnsLeft === undefined || ps.turnsLeft === -1) return ps;
    // T3 sticky note reloading
    if (ps.effect === 'TRAP' && ps.turnsLeft > 0) {
      const rem = ps.turnsLeft - delta;
      if (rem <= 0) return { ...ps, turnsLeft: undefined }; // re-armed
      return { ...ps, turnsLeft: rem };
    }
    if (ps.effect !== 'REVEAL') return ps;
    const rem = ps.turnsLeft - delta;
    if (rem <= 0) {
      // HIGHLIGHTER expired — collapse fog back to normal vision
      if (player && newFog) {
        const normalKeys = computeVisibleCells(player.row, player.col, 2, state.maze.cells);
        newFog  = collapseInkFog(newFog, normalKeys);
        changed = true;
      }
      return null as unknown as PlacedSupply; // mark for removal
    }
    return { ...ps, turnsLeft: rem };
  }).filter(Boolean);

  if (newSupplies.length === state.placedSupplies.length && !changed) return state;

  return {
    ...state,
    placedSupplies: newSupplies,
    players: player && changed
      ? { ...state.players, p1: { ...player, fogMap: newFog! } }
      : state.players,
  };
}

// ─── Inventory helpers ────────────────────────────────────────────────────────

export function addToInventory(
  inv: InventorySupply[],
  item: InventorySupply,
): InventorySupply[] {
  const idx = inv.findIndex(i => i.type === item.type && i.tier === item.tier);
  if (idx >= 0) {
    return inv.map((i, n) => n === idx ? { ...i, count: i.count + item.count } : i);
  }
  return [...inv, { ...item }];
}

export function deductFromInventory(
  inv: InventorySupply[],
  type: SupplyType,
  tier: SupplyTier,
): InventorySupply[] {
  return inv
    .map(i => i.type === type && i.tier === tier ? { ...i, count: i.count - 1 } : i)
    .filter(i => i.count > 0);
}

// ─── Wall utility helpers ─────────────────────────────────────────────────────

const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };

function getDirection(fr: number, fc: number, tr: number, tc: number): Direction | null {
  const dr = tr - fr;
  const dc = tc - fc;
  if (dr === -1 && dc === 0) return 'N';
  if (dr === 1  && dc === 0) return 'S';
  if (dr === 0  && dc === 1) return 'E';
  if (dr === 0  && dc === -1) return 'W';
  return null;
}

type CellGrid = GameState['maze']['cells'];

/** Set all 4 walls of a cell to true (fully sealed). Mirrors on neighbors. */
function sealCellWalls(cells: CellGrid, row: number, col: number): CellGrid {
  const rows = cells.length;
  const cols = cells[0].length;
  const sealed = { N: true, E: true, S: true, W: true };
  let result = cells.map((rowArr, r) =>
    r !== row ? rowArr : rowArr.map((c2, c) =>
      c !== col ? c2 : { ...c2, walls: { ...sealed } },
    ),
  );
  // Mirror walls on neighbors
  const nbrs: Array<[Direction, Direction, number, number]> = [
    ['N', 'S', row - 1, col],
    ['E', 'W', row, col + 1],
    ['S', 'N', row + 1, col],
    ['W', 'E', row, col - 1],
  ];
  for (const [, oppDir, nr, nc] of nbrs) {
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      result = result.map((rowArr, r) =>
        r !== nr ? rowArr : rowArr.map((c2, c) =>
          c !== nc ? c2 : { ...c2, walls: { ...c2.walls, [oppDir]: true } },
        ),
      );
    }
  }
  return result;
}

/** Open the wall between (fr,fc) and (tr,tc) in direction `dir`. */
function openWall(
  cells: CellGrid,
  fr: number, fc: number,
  tr: number, tc: number,
  dir: Direction,
): CellGrid {
  const opp = OPPOSITE[dir];
  return cells.map((rowArr, r) =>
    rowArr.map((cell, c) => {
      if (r === fr && c === fc) return { ...cell, walls: { ...cell.walls, [dir]: false } };
      if (r === tr && c === tc) return { ...cell, walls: { ...cell.walls, [opp]: false } };
      return cell;
    }),
  );
}
