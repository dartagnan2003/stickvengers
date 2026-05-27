/**
 * GameReducer — the entire game brain.
 *
 * Pure function: (GameState, Command) => GameState.
 * No side effects, no React imports, no DOM.
 * This is the unit that will be shared over BLE in multiplayer.
 */

import type { GameState, PlayerState, EnemyState, Direction } from '../types/state';
import type { GameFormat, InventorySupply, SupplyType, SupplyTier } from '../types/supplies';
import type { Command } from '../types/commands';
import { computeVisibleCells, updateFogMap, makeDarkFogMap, collapseInkFog } from './FogSystem';
import { buildMazeConfig }   from './MazeGen';
import { tickEnemies, spawnWaveEnemies, ENEMY_STATS } from './PatrolSystem';
import {
  canPlaceSupply, applySupplyEffect, removeSupplyAt,
  resolvePortalEntry, resolveTrapTrigger, tickPlacedSupplies,
  getSupplyEnergyDrop, getSupplyDrop, supplyTypeToEffect,
  addToInventory, deductFromInventory, SUPPLY_STATS,
} from './SupplySystem';

// ─── Constants ────────────────────────────────────────────────────────────────

export const NORMAL_RADIUS    = 2;
export const INK_RADIUS       = 5;
export const INK_DURATION     = 4.5;   // seconds
export const PLAYER_MAX_HP    = 10;
export const PLAYER_START_INK = 2;
export const WAVE_INTERVAL    = 12.0;  // seconds between waves in DEFEND (was 20 — much faster pressure)
export const DEFEND_WIN_WAVES = 5;

const DELTA: Record<Direction, [number, number]> = {
  N: [-1,  0],
  E: [ 0,  1],
  S: [ 1,  0],
  W: [ 0, -1],
};

// ─── Starting inventories per game format ─────────────────────────────────────

const STARTING_INVENTORY: Record<GameFormat, InventorySupply[]> = {
  JOURNEY: [
    { type: 'PAPERCLIP',   tier: 1, count: 2 },
    { type: 'HIGHLIGHTER', tier: 1, count: 1 },
  ],
  ATTACK: [
    { type: 'WHITEOUT',    tier: 1, count: 2 },
    { type: 'RUBBER_BAND', tier: 1, count: 1 },
    { type: 'ERASER',      tier: 1, count: 2 },
  ],
  DEFEND: [
    { type: 'PAPERCLIP',   tier: 1, count: 4 },
    { type: 'STICKY_NOTE', tier: 1, count: 3 },
    { type: 'RED_TAPE',    tier: 1, count: 2 },
    { type: 'HIGHLIGHTER', tier: 1, count: 1 },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, cmd: Command): GameState {
  switch (cmd.type) {
    case 'START_GAME':    return handleStartGame(state, cmd.gameFormat, cmd.turnOrder, cmd.seed);
    case 'MOVE':          return handleMove(state, cmd.playerId, cmd.direction);
    case 'USE_INK':       return handleUseInk(state, cmd.playerId);
    case 'TICK':          return handleTick(state, cmd.delta);
    case 'RESET':         return handleStartGame(state, state.gameFormat, state.turnOrder);
    case 'PAUSE':         return { ...state, phase: 'PAUSED' };
    case 'RESUME':        return state.phase === 'PAUSED' ? { ...state, phase: 'PLAYING' } : state;
    case 'GOTO_MENU':     return { ...makeBlankState() };
    case 'PLACE_SUPPLY':  return handlePlaceSupply(state, cmd.playerId, cmd.supplyType, cmd.tier, cmd.row, cmd.col);
    case 'OPEN_SHOP':     return handleOpenShop(state, cmd.playerId);
    case 'BUY_SUPPLY':    return handleBuySupply(state, cmd.playerId, cmd.supplyType, cmd.tier);
    case 'CLOSE_SHOP':    return { ...state, shopOpen: false };
    default:              return state;
  }
}

// ─── START_GAME ───────────────────────────────────────────────────────────────

function handleStartGame(
  _prev: GameState,
  gf:    GameFormat,
  to:    GameState['turnOrder'],
  seed?: number,
): GameState {
  const s    = seed ?? Date.now();
  // DEFEND gets a larger maze — more corridors to fortify, more paths for enemies to exploit
  const mazeRows = gf === 'DEFEND' ? 11 : 9;
  const mazeCols = gf === 'DEFEND' ? 13 : 11;
  const mazeDiff = gf === 'DEFEND' ? 3 : 2;
  const maze = buildMazeConfig({
    rows: mazeRows, cols: mazeCols,
    seed: s,
    gameFormat: gf,
    difficulty: mazeDiff,
  });

  const [sr, sc] = maze.startCell;

  const darkFog  = makeDarkFogMap(maze.rows, maze.cols);
  const startVis = computeVisibleCells(sr, sc, NORMAL_RADIUS, maze.cells);
  const initFog  = updateFogMap(darkFog, startVis);

  const player: PlayerState = {
    id:              'p1',
    role:            'HERO',
    row:             sr,
    col:             sc,
    hp:              PLAYER_MAX_HP,
    maxHp:           PLAYER_MAX_HP,
    inkCharges:      PLAYER_START_INK,
    inkActive:       false,
    inkTimer:        0,
    inkRadius:       NORMAL_RADIUS,
    fogMap:          initFog,
    isAlive:         true,
    prizesCollected: 0,
    score:           0,
    energy:          10,
    maxEnergy:       50,
    inventory:       [...STARTING_INVENTORY[gf].map(i => ({ ...i }))],
  };

  const enemies: EnemyState[] = maze.enemySpawns.map((def, i) => ({
    id:           `e_${i}`,
    type:         def.type,
    row:          def.row,
    col:          def.col,
    hp:           ENEMY_STATS[def.type].hp,
    maxHp:        ENEMY_STATS[def.type].hp,
    damage:       ENEMY_STATS[def.type].damage,
    behavior:     def.behavior,
    patrolPath:   def.patrolPath ?? [],
    patrolIndex:  0,
    patrolDir:    1,
    moveInterval: ENEMY_STATS[def.type].moveInterval,
    moveTimer:    ENEMY_STATS[def.type].moveInterval,
    isAlive:      true,
  }));

  return {
    phase:          'PLAYING',
    mode:           'SOLO',
    tick:           0,
    turnOrder:      to,
    gameFormat:     gf,
    maze,
    players:        { p1: player },
    enemies,
    waveNumber:     1,
    waveTimer:      0,
    nextWaveIn:     WAVE_INTERVAL,
    message:        undefined,
    placedSupplies: [],
    shopNodes:      maze.shopNodes.map(n => ({ ...n, stock: [...n.stock.map(s => ({ ...s }))] })),
    pendingPortal:  null,
    shopOpen:       false,
  };
}

// ─── MOVE ─────────────────────────────────────────────────────────────────────

function handleMove(state: GameState, playerId: string, dir: Direction): GameState {
  if (state.phase !== 'PLAYING') return state;

  const player = state.players[playerId];
  if (!player?.isAlive) return state;

  // Wall check
  const cell = state.maze.cells[player.row][player.col];
  if (cell.walls[dir]) return state;

  const [dr, dc] = DELTA[dir];
  const nr = player.row + dr;
  const nc = player.col + dc;

  if (nr < 0 || nr >= state.maze.rows || nc < 0 || nc >= state.maze.cols) return state;

  let newCells        = state.maze.cells;
  let enemies         = state.enemies.map(e => ({ ...e }));
  let inkCharges      = player.inkCharges;
  let prizesCollected = player.prizesCollected;
  let playerHp        = player.hp;
  let playerEnergy    = player.energy;
  let inventory       = player.inventory;
  let score           = player.score;

  // ── Enemy contact in destination cell ──────────────────────────────────────
  const enemyInCell = enemies.find(e => e.isAlive && e.row === nr && e.col === nc);
  if (enemyInCell) {
    enemyInCell.hp      -= 99;
    enemyInCell.isAlive  = enemyInCell.hp > 0;
    playerHp -= enemyInCell.damage;
    if (!enemyInCell.isAlive) {
      score         += 10;
      playerEnergy   = Math.min(player.maxEnergy, playerEnergy + getSupplyEnergyDrop(enemyInCell.type));
      const drop     = getSupplyDrop(enemyInCell.type);
      if (drop) inventory = addToInventory(inventory, drop);
    }
  }

  // ── Item pickup ────────────────────────────────────────────────────────────
  const destCell = newCells[nr][nc];
  if (destCell.item) {
    switch (destCell.item) {
      case 'INK_CHARGE': inkCharges++;       break;
      case 'PRIZE':      prizesCollected++;  score += 50; break;
      case 'HEALTH':     playerHp = Math.min(player.maxHp, playerHp + 3); break;
    }
    newCells = newCells.map((row, r) =>
      r !== nr ? row : row.map((c2, c) => c !== nc ? c2 : { ...c2, item: undefined }),
    );
  }

  // ── Update fog ─────────────────────────────────────────────────────────────
  const radius  = player.inkActive ? player.inkRadius : NORMAL_RADIUS;
  const visKeys = computeVisibleCells(nr, nc, radius, newCells);
  const newFog  = updateFogMap(player.fogMap, visKeys);

  const updatedPlayer: PlayerState = {
    ...player,
    row: nr, col: nc,
    hp: playerHp,
    inkCharges,
    prizesCollected,
    fogMap: newFog,
    score,
    isAlive:   playerHp > 0,
    energy:    playerEnergy,
    inventory,
  };

  let newState: GameState = {
    ...state,
    tick: state.tick + 1,
    players: { ...state.players, [playerId]: updatedPlayer },
    enemies: enemies.filter(e => e.isAlive),
    maze: { ...state.maze, cells: newCells },
  };

  // ── v3: supply effects at destination ─────────────────────────────────────
  // RED_TAPE slow zone
  const slowTrap = newState.placedSupplies.find(
    ps => ps.row === nr && ps.col === nc && ps.effect === 'SLOW',
  );
  if (slowTrap) {
    newState = { ...newState, message: 'Slowed by red tape! 🚧' };
    // In SEQUENTIAL: skip enemy tick this turn (handled below by early return)
    if (state.turnOrder === 'SEQUENTIAL') {
      newState = checkVictory(newState, playerId);
      newState = checkDeath(newState, playerId);
      return newState;
    }
  }

  // STICKY_NOTE trap
  const trapSupply = newState.placedSupplies.find(
    ps => ps.row === nr && ps.col === nc && ps.effect === 'TRAP',
  );
  if (trapSupply) {
    newState = resolveTrapTrigger(newState, playerId, true, nr, nc);
  }

  // Portal entry
  const portalSupply = newState.placedSupplies.find(
    ps => ps.row === nr && ps.col === nc &&
          (ps.effect === 'PORTAL_IN' || ps.effect === 'PORTAL_OUT') &&
          ps.linkedId,
  );
  if (portalSupply) {
    newState = resolvePortalEntry(newState, playerId, portalSupply);
  }

  // Shop entry
  if (destCell.isShop) {
    newState = { ...newState, shopOpen: true };
  }

  // ── Turn-based: enemies move after player ──────────────────────────────────
  if (state.turnOrder === 'SEQUENTIAL') {
    const p1 = newState.players[playerId];
    const pPos: [number, number] = [p1.row, p1.col];
    newState = { ...newState, enemies: tickEnemies(newState.enemies, newCells, 1, pPos) };
    newState = resolveEnemyAttacks(newState, playerId);
    // Enemy trap triggers after enemy movement
    newState = resolveEnemyTraps(newState);
  }

  newState = checkVictory(newState, playerId);
  newState = checkDeath(newState, playerId);
  return newState;
}

// ─── USE_INK ──────────────────────────────────────────────────────────────────

function handleUseInk(state: GameState, playerId: string): GameState {
  if (state.phase !== 'PLAYING') return state;

  const player = state.players[playerId];
  if (!player || player.inkCharges <= 0 || player.inkActive) return state;

  const visKeys = computeVisibleCells(player.row, player.col, INK_RADIUS, state.maze.cells);
  const newFog  = updateFogMap(player.fogMap, visKeys);

  return {
    ...state,
    tick: state.tick + 1,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        inkCharges: player.inkCharges - 1,
        inkActive:  true,
        inkTimer:   INK_DURATION,
        inkRadius:  INK_RADIUS,
        fogMap:     newFog,
      },
    },
  };
}

// ─── TICK (real-time mode) ────────────────────────────────────────────────────

function handleTick(state: GameState, delta: number): GameState {
  if (state.phase !== 'PLAYING') return state;

  // Tick ink timers + collapse fog when expired
  let players = state.players;
  for (const [id, p] of Object.entries(players)) {
    if (!p.inkActive) continue;
    const remaining = p.inkTimer - delta;
    if (remaining <= 0) {
      const normalKeys = computeVisibleCells(p.row, p.col, NORMAL_RADIUS, state.maze.cells);
      players = {
        ...players,
        [id]: {
          ...p,
          inkActive: false,
          inkTimer:  0,
          inkRadius: NORMAL_RADIUS,
          fogMap:    collapseInkFog(p.fogMap, normalKeys),
        },
      };
    } else {
      players = { ...players, [id]: { ...p, inkTimer: remaining } };
    }
  }

  // Tick enemies
  const p1Pos = players['p1'] ? [players['p1'].row, players['p1'].col] as [number, number] : undefined;
  const enemies = tickEnemies(state.enemies, state.maze.cells, delta, p1Pos);

  let newState: GameState = {
    ...state,
    tick: state.tick + 1,
    players,
    enemies,
  };

  // Resolve enemy-player contacts
  for (const playerId of Object.keys(players)) {
    newState = resolveEnemyAttacks(newState, playerId);
  }

  // Resolve enemy trap triggers
  newState = resolveEnemyTraps(newState);

  // ── DEFEND: spawn new waves ────────────────────────────────────────────────
  if (state.gameFormat === 'DEFEND') {
    const newNextWaveIn = state.nextWaveIn - delta;
    const newWaveTimer  = state.waveTimer  + delta;

    if (newNextWaveIn <= 0) {
      const fresh = spawnWaveEnemies(
        state.waveNumber + 1,
        state.maze.rows, state.maze.cols,
        newState.enemies,
        'DEFEND',
      );
      newState = {
        ...newState,
        enemies:    [...newState.enemies, ...fresh],
        waveNumber: state.waveNumber + 1,
        waveTimer:  0,
        nextWaveIn: WAVE_INTERVAL,
        message:    `Wave ${state.waveNumber + 1}!`,
      };
    } else {
      newState = { ...newState, nextWaveIn: newNextWaveIn, waveTimer: newWaveTimer };
    }
  }

  // Tick placed supplies (HIGHLIGHTER timers, trap reload, etc.)
  newState = tickPlacedSupplies(newState, delta);

  // Prune dead enemies
  newState = { ...newState, enemies: newState.enemies.filter(e => e.isAlive) };

  for (const playerId of Object.keys(players)) {
    newState = checkDeath(newState, playerId);
  }
  return newState;
}

// ─── PLACE_SUPPLY ─────────────────────────────────────────────────────────────

function handlePlaceSupply(
  state:     GameState,
  playerId:  string,
  type:      SupplyType,
  tier:      SupplyTier,
  row:       number,
  col:       number,
): GameState {
  if (state.phase !== 'PLAYING') return state;

  const player = state.players[playerId];
  if (!player?.isAlive) return state;

  if (!canPlaceSupply(type, tier, row, col, state)) return state;

  // Inventory check
  const invItem = player.inventory.find(i => i.type === type && i.tier === tier);
  if (!invItem || invItem.count < 1) return state;

  // WHITEOUT: special removal handler
  if (type === 'WHITEOUT') {
    const newInv = deductFromInventory(player.inventory, type, tier);
    let newState = removeSupplyAt(state, row, col, tier);
    newState = {
      ...newState,
      players: { ...newState.players, [playerId]: { ...player, inventory: newInv } },
    };
    return newState;
  }

  // Build PlacedSupply record
  const id     = `ps_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
  const effect = supplyTypeToEffect(type);

  let linkedId: string | undefined;
  let pendingPortal = state.pendingPortal;

  // INK_BLOT portal pairing
  if (type === 'INK_BLOT') {
    if (pendingPortal === null) {
      pendingPortal = id; // this becomes side A
    } else {
      linkedId      = pendingPortal;  // side B links to side A
      pendingPortal = null;
    }
  }

  // RUBBER_BAND: compute launch destination
  if (type === 'RUBBER_BAND') {
    const dist  = SUPPLY_STATS.RUBBER_BAND.tiers[tier].launchDist ?? 2;
    const dr    = Math.sign(row - player.row);
    const dc    = Math.sign(col - player.col);
    const tr    = row + dr * dist;
    const tc    = col + dc * dist;
    linkedId = `${tr},${tc}`;
  }

  // INK_BLOT side B: also mark effect as PORTAL_OUT
  const finalEffect = (type === 'INK_BLOT' && linkedId) ? 'PORTAL_OUT' : effect;

  const stats  = SUPPLY_STATS[type].tiers[tier];
  const placed = {
    id,
    type,
    tier,
    row,
    col,
    effect:    finalEffect,
    linkedId,
    turnsLeft: stats.revealDuration !== undefined ? stats.revealDuration : undefined,
    ownerId:   playerId,
  };

  const newInv = deductFromInventory(player.inventory, type, tier);

  let newState = applySupplyEffect({ ...state, pendingPortal }, placed);

  // Update player inventory
  newState = {
    ...newState,
    players: {
      ...newState.players,
      [playerId]: { ...player, inventory: newInv },
    },
  };

  // Backfill INK_BLOT side A's linkedId if this was side B
  if (type === 'INK_BLOT' && linkedId) {
    newState = {
      ...newState,
      placedSupplies: newState.placedSupplies.map(ps =>
        ps.id === linkedId ? { ...ps, linkedId: id } : ps,
      ),
    };
  }

  return newState;
}

// ─── OPEN_SHOP ────────────────────────────────────────────────────────────────

function handleOpenShop(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player) return state;
  const shop = state.shopNodes.find(n => n.row === player.row && n.col === player.col);
  if (!shop) return state;
  return { ...state, shopOpen: true };
}

// ─── BUY_SUPPLY ───────────────────────────────────────────────────────────────

function handleBuySupply(
  state:    GameState,
  playerId: string,
  type:     SupplyType,
  tier:     SupplyTier,
): GameState {
  const player = state.players[playerId];
  if (!player) return state;

  const cost = SUPPLY_STATS[type].tiers[tier].energyCost;
  if (player.energy < cost) return state;

  const shopIdx = state.shopNodes.findIndex(
    n => n.row === player.row && n.col === player.col,
  );
  if (shopIdx < 0) return state;

  const shop     = state.shopNodes[shopIdx];
  const stockIdx = shop.stock.findIndex(s => s.type === type && s.tier === tier);
  if (stockIdx < 0) return state;

  const newStock = shop.stock
    .map((s, i) => i === stockIdx ? { ...s, count: s.count - 1 } : s)
    .filter(s => s.count > 0);

  const newShopNodes = state.shopNodes.map((n, i) =>
    i === shopIdx ? { ...n, stock: newStock } : n,
  );

  return {
    ...state,
    shopNodes: newShopNodes,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        energy:    player.energy - cost,
        inventory: addToInventory(player.inventory, { type, tier, count: 1 }),
      },
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveEnemyAttacks(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player?.isAlive) return state;

  let hp = player.hp;
  state.enemies.forEach(e => {
    if (!e.isAlive || e.row !== player.row || e.col !== player.col) return;
    // In real-time (SIMULTANEOUS) mode, only deal damage the exact tick the enemy
    // moved onto this cell — identified by moveTimer === moveInterval (just reset).
    // Without this guard, enemies would deal damage at 60 fps while sharing a cell,
    // making contact instantly lethal.
    if (state.turnOrder === 'SIMULTANEOUS' && e.moveTimer !== e.moveInterval) return;
    hp -= e.damage;
  });

  if (hp === player.hp) return state;
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...player, hp, isAlive: hp > 0 } },
  };
}

/** Check if any enemy stepped on a STICKY_NOTE trap. */
function resolveEnemyTraps(state: GameState): GameState {
  let newState = state;
  for (const enemy of newState.enemies) {
    if (!enemy.isAlive) continue;
    const trap = newState.placedSupplies.find(
      ps => ps.row === enemy.row && ps.col === enemy.col && ps.effect === 'TRAP',
    );
    if (trap) {
      newState = resolveTrapTrigger(newState, enemy.id, false, enemy.row, enemy.col);
    }
  }
  return newState;
}

function checkVictory(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player) return state;

  const { gameFormat, maze } = state;

  if (gameFormat === 'JOURNEY') {
    const [er, ec] = maze.exitCell;
    if (er >= 0 && player.row === er && player.col === ec) {
      return { ...state, phase: 'VICTORY', message: 'You escaped the maze!' };
    }
  }

  if (gameFormat === 'ATTACK') {
    const cell = maze.cells[player.row][player.col];
    if (cell.isBase) {
      return { ...state, phase: 'VICTORY', message: 'Enemy base captured! ⚔️' };
    }
  }

  if (gameFormat === 'DEFEND') {
    const TARGET = DEFEND_WIN_WAVES;
    if (state.waveNumber > TARGET && state.enemies.filter(e => e.isAlive).length === 0) {
      return { ...state, phase: 'VICTORY', message: `Survived ${TARGET} waves! 🛡️` };
    }
  }

  return state;
}

function checkDeath(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player || player.isAlive) return state;
  return { ...state, phase: 'GAMEOVER', message: 'You were caught.' };
}

// ─── Blank initial state (before START_GAME) ──────────────────────────────────

export function makeBlankState(): GameState {
  const blankMaze = buildMazeConfig({
    rows: 9, cols: 11, seed: 1,
    gameFormat: 'JOURNEY', difficulty: 1,
  });
  return {
    phase:          'MENU',
    mode:           'SOLO',
    tick:           0,
    turnOrder:      'SIMULTANEOUS',
    gameFormat:     'JOURNEY',
    maze:           blankMaze,
    players:        {},
    enemies:        [],
    waveNumber:     0,
    waveTimer:      0,
    nextWaveIn:     0,
    placedSupplies: [],
    shopNodes:      [],
    pendingPortal:  null,
    shopOpen:       false,
  };
}
