/**
 * GameReducer — the entire game brain.
 *
 * Pure function: (GameState, Command) => GameState.
 * No side effects, no React imports, no DOM.
 * This is the unit that will be shared over BLE in multiplayer.
 */

import type { GameState, PlayerState, EnemyState, Direction, VictoryCondition, TurnOrder } from '../types/state';
import type { Command } from '../types/commands';
import { computeVisibleCells, updateFogMap, makeDarkFogMap, collapseInkFog } from './FogSystem';
import { buildMazeConfig }                                from './MazeGen';
import { tickEnemies, spawnWaveEnemies, ENEMY_STATS }    from './PatrolSystem';

// ─── Constants ────────────────────────────────────────────────────────────────

export const NORMAL_RADIUS   = 2;
export const INK_RADIUS      = 5;
export const INK_DURATION    = 4.5;   // seconds
export const PLAYER_MAX_HP   = 10;
export const PLAYER_START_INK = 2;
export const WAVE_INTERVAL   = 20.0;  // seconds between waves in SURVIVE_WAVES

const DELTA: Record<Direction, [number, number]> = {
  N: [-1,  0],
  E: [ 0,  1],
  S: [ 1,  0],
  W: [ 0, -1],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, cmd: Command): GameState {
  switch (cmd.type) {
    case 'START_GAME': return handleStartGame(state, cmd.victoryCondition, cmd.turnOrder, cmd.seed);
    case 'MOVE':       return handleMove(state, cmd.playerId, cmd.direction);
    case 'USE_INK':    return handleUseInk(state, cmd.playerId);
    case 'TICK':       return handleTick(state, cmd.delta);
    case 'RESET':      return handleStartGame(state, state.victoryCondition, state.turnOrder);
    case 'PAUSE':      return { ...state, phase: 'PAUSED' };
    case 'RESUME':     return state.phase === 'PAUSED' ? { ...state, phase: 'PLAYING' } : state;
    case 'GOTO_MENU':  return { ...makeBlankState() };
    default:           return state;
  }
}

// ─── START_GAME ───────────────────────────────────────────────────────────────

function handleStartGame(
  _prev: GameState,
  vc: VictoryCondition,
  to: TurnOrder,
  seed?: number,
): GameState {
  const s   = seed ?? Date.now();
  const maze = buildMazeConfig({
    rows: 9, cols: 11,
    seed: s,
    victoryCondition: vc,
    difficulty: 2,
  });

  const [sr, sc] = maze.startCell;

  // Build initial fog map — everything dark, then light up start area
  const darkFog = makeDarkFogMap(maze.rows, maze.cols);
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
  };

  // Instantiate enemies from spawn defs
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
    phase:            'PLAYING',
    mode:             'SOLO',
    tick:             0,
    turnOrder:        to,
    victoryCondition: vc,
    maze,
    players:          { p1: player },
    enemies,
    waveNumber:       1,
    waveTimer:        0,
    nextWaveIn:       WAVE_INTERVAL,
    message:          undefined,
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

  let newCells  = state.maze.cells;
  let enemies   = state.enemies.map(e => ({ ...e }));
  let inkCharges = player.inkCharges;
  let prizesCollected = player.prizesCollected;
  let playerHp  = player.hp;
  let score     = player.score;

  // ── Enemy contact in destination cell ──────────────────────────────────────
  const enemyInCell = enemies.find(e => e.isAlive && e.row === nr && e.col === nc);
  if (enemyInCell) {
    // Player defeats enemy; player takes damage
    enemyInCell.hp     -= 99; // one-shot for now; Phase 2: player attack stat
    enemyInCell.isAlive = enemyInCell.hp > 0;
    playerHp -= enemyInCell.damage;
    if (!enemyInCell.isAlive) score += 10;
  }

  // ── Item pickup ────────────────────────────────────────────────────────────
  const destCell = newCells[nr][nc];
  if (destCell.item) {
    switch (destCell.item) {
      case 'INK_CHARGE': inkCharges++;       break;
      case 'PRIZE':      prizesCollected++;  score += 50; break;
      case 'HEALTH':     playerHp = Math.min(player.maxHp, playerHp + 3); break;
    }
    // Remove item — must clone the cell row to stay immutable
    newCells = newCells.map((row, r) =>
      r !== nr ? row : row.map((c2, c) => c !== nc ? c2 : { ...c2, item: undefined }),
    );
  }

  // ── Update fog ─────────────────────────────────────────────────────────────
  const radius   = player.inkActive ? player.inkRadius : NORMAL_RADIUS;
  const visKeys  = computeVisibleCells(nr, nc, radius, newCells);
  const newFog   = updateFogMap(player.fogMap, visKeys);

  const updatedPlayer: PlayerState = {
    ...player,
    row: nr, col: nc,
    hp: playerHp,
    inkCharges,
    prizesCollected,
    fogMap: newFog,
    score,
    isAlive: playerHp > 0,
  };

  let newState: GameState = {
    ...state,
    tick: state.tick + 1,
    players: { ...state.players, [playerId]: updatedPlayer },
    enemies: enemies.filter(e => e.isAlive),
    maze: { ...state.maze, cells: newCells },
  };

  // ── Turn-based: enemies move after player ──────────────────────────────────
  if (state.turnOrder === 'SEQUENTIAL') {
    newState = { ...newState, enemies: tickEnemies(newState.enemies, newCells, 1) };
    newState = resolveEnemyAttacks(newState, playerId);
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
  const enemies = tickEnemies(state.enemies, state.maze.cells, delta);

  let newState: GameState = {
    ...state,
    tick: state.tick + 1,
    players,
    enemies,
  };

  // Resolve any enemy-player contacts after enemy moves
  for (const playerId of Object.keys(players)) {
    newState = resolveEnemyAttacks(newState, playerId);
  }

  // ── SURVIVE_WAVES: spawn new waves ────────────────────────────────────────
  if (state.victoryCondition === 'SURVIVE_WAVES') {
    const newNextWaveIn = state.nextWaveIn - delta;
    const newWaveTimer  = state.waveTimer  + delta;

    if (newNextWaveIn <= 0) {
      const fresh = spawnWaveEnemies(
        state.waveNumber + 1,
        state.maze.rows, state.maze.cols,
        newState.enemies,
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

  // Prune dead enemies
  newState = { ...newState, enemies: newState.enemies.filter(e => e.isAlive) };

  for (const playerId of Object.keys(players)) {
    newState = checkDeath(newState, playerId);
  }
  return newState;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Damage the player if an enemy occupies the same cell. */
function resolveEnemyAttacks(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player?.isAlive) return state;

  let hp = player.hp;
  const enemies = state.enemies.map(e => {
    if (!e.isAlive || e.row !== player.row || e.col !== player.col) return e;
    hp -= e.damage;
    return e;
  });

  if (hp === player.hp) return state; // no contact

  return {
    ...state,
    enemies,
    players: { ...state.players, [playerId]: { ...player, hp, isAlive: hp > 0 } },
  };
}

/** Check win conditions after each state change. */
function checkVictory(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player) return state;

  const { victoryCondition, maze } = state;

  if (victoryCondition === 'REACH_EXIT') {
    const [er, ec] = maze.exitCell;
    if (player.row === er && player.col === ec) {
      return { ...state, phase: 'VICTORY', message: 'You escaped!' };
    }
  }

  if (victoryCondition === 'COLLECT_PRIZE') {
    if (player.prizesCollected >= maze.totalPrizes) {
      const [er, ec] = maze.exitCell;
      if (player.row === er && player.col === ec) {
        return { ...state, phase: 'VICTORY', message: 'All prizes collected!' };
      }
      // Hint: need to reach exit
      return { ...state, message: `${player.prizesCollected}/${maze.totalPrizes} prizes — reach the exit!` };
    }
  }

  return state;
}

/** Check death condition. */
function checkDeath(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player || player.isAlive) return state;
  return { ...state, phase: 'GAMEOVER', message: 'You were caught.' };
}

// ─── Blank initial state (before START_GAME) ──────────────────────────────────

export function makeBlankState(): GameState {
  // Return MENU phase so App shows the goal/mode selector on first load.
  // START_GAME is dispatched when the user clicks "Start Game".
  const blankMaze = buildMazeConfig({
    rows: 9, cols: 11, seed: 1,
    victoryCondition: 'REACH_EXIT', difficulty: 1,
  });
  return {
    phase:            'MENU',
    mode:             'SOLO',
    tick:             0,
    turnOrder:        'SIMULTANEOUS',
    victoryCondition: 'REACH_EXIT',
    maze:             blankMaze,
    players:          {},
    enemies:          [],
    waveNumber:       0,
    waveTimer:        0,
    nextWaveIn:       0,
  };
}
