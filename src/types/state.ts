/**
 * state.ts — v3.0 game state types.
 *
 * All types are plain JSON-serializable — no Maps, Sets, or class instances.
 * This keeps the state compatible with BLE transport serialization.
 */

import type { InventorySupply, PlacedSupply, ShopNode, GameFormat } from './supplies';

// ─── Re-export for convenience (consumers can import from one place) ──────────
export type { GameFormat, SupplyType, SupplyTier, CellEffectType,
              InventorySupply, PlacedSupply, ShopNode } from './supplies';

// ─── Primitives ───────────────────────────────────────────────────────────────

export type FogState        = 'dark' | 'explored' | 'lit';
export type Direction       = 'N' | 'E' | 'S' | 'W';
export type GamePhase       = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY';
export type GameMode        = 'SOLO' | 'COOP' | 'VS';
export type TurnOrder       = 'SIMULTANEOUS' | 'SEQUENTIAL';
export type PlayerRole      = 'HERO' | 'VILLAIN';
export type ItemType        = 'INK_CHARGE' | 'PRIZE' | 'HEALTH';
export type EnemyBehavior   = 'LURK' | 'PATROL' | 'WANDER' | 'CHASE';

// @deprecated — GameFormat replaces VictoryCondition in v3.
// Kept for any v2 migration paths.
export type VictoryCondition = 'REACH_EXIT' | 'COLLECT_PRIZE' | 'SURVIVE_WAVES';

// ─── Maze cell ────────────────────────────────────────────────────────────────

export interface CellWalls {
  N: boolean; E: boolean; S: boolean; W: boolean;
}

export interface MazeCell {
  readonly row:   number;
  readonly col:   number;
  walls:          CellWalls;   // mutable — walls change when supplies are placed
  item?:          ItemType;
  isExit:         boolean;
  isStart:        boolean;
  isShop?:        boolean;     // v3: shop node location
  isBase?:        boolean;     // v3: ATTACK=enemy base, DEFEND=player base
  permWall?:      boolean;     // v3: ATTACK fortification — WHITEOUT cannot remove
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface PlayerState {
  readonly id:      string;
  readonly role:    PlayerRole;
  row:              number;
  col:              number;
  hp:               number;
  readonly maxHp:   number;
  inkCharges:       number;
  inkActive:        boolean;
  inkTimer:         number;    // seconds remaining on ink effect
  inkRadius:        number;    // current visibility radius
  /** Per-player fog — not shared between players */
  fogMap:           FogState[][];
  isAlive:          boolean;
  prizesCollected:  number;
  score:            number;
  // ── v3 additions ──────────────────────────────────────────────────────────
  energy:           number;
  maxEnergy:        number;
  inventory:        InventorySupply[];
}

// ─── Enemy ────────────────────────────────────────────────────────────────────

export type EnemyType = 'PAPERCLIP' | 'STAPLER' | 'RED_TAPE' | 'SHREDDER' | 'RUBBER_BAND';

export interface EnemyState {
  readonly id:       string;
  readonly type:     EnemyType;
  row:               number;
  col:               number;
  hp:                number;
  readonly maxHp:    number;
  readonly damage:   number;
  readonly behavior: EnemyBehavior;
  /** Ordered list of [row,col] waypoints for PATROL */
  readonly patrolPath: ReadonlyArray<readonly [number, number]>;
  patrolIndex:       number;
  patrolDir:         1 | -1;
  /** Seconds between moves */
  readonly moveInterval: number;
  moveTimer:         number;
  isAlive:           boolean;
}

// ─── Maze config ─────────────────────────────────────────────────────────────

export interface EnemySpawnDef {
  readonly type:        EnemyType;
  readonly row:         number;
  readonly col:         number;
  readonly behavior:    EnemyBehavior;
  readonly patrolPath?: ReadonlyArray<readonly [number, number]>;
}

export interface MazeConfig {
  readonly rows:        number;
  readonly cols:        number;
  cells:                MazeCell[][];   // mutable — walls and items change during play
  readonly startCell:   readonly [number, number];
  readonly exitCell:    readonly [number, number];  // [-1,-1] for DEFEND (no exit)
  readonly prizes:      ReadonlyArray<readonly [number, number]>;
  readonly enemySpawns: readonly EnemySpawnDef[];
  readonly totalPrizes: number;
  readonly shopNodes:   ShopNode[];    // v3: immutable initial config
}

// ─── Top-level game state (plain JSON-serializable — no Maps, no class instances)

export interface GameState {
  phase:             GamePhase;
  readonly mode:     GameMode;
  tick:              number;
  readonly turnOrder:   TurnOrder;
  // v3: gameFormat replaces victoryCondition
  gameFormat:           GameFormat;
  maze:              MazeConfig;
  /** Keyed by playerId — plain object so it serializes cleanly for BLE */
  players:           Record<string, PlayerState>;
  enemies:           EnemyState[];
  waveNumber:        number;
  waveTimer:         number;
  nextWaveIn:        number;    // seconds until next spawn (DEFEND)
  message?:          string;
  // ── v3 additions ──────────────────────────────────────────────────────────
  placedSupplies:    PlacedSupply[];
  /** Runtime shop stock (depletes separately from maze.shopNodes) */
  shopNodes:         ShopNode[];
  /** ID of first INK_BLOT portal awaiting its pair; null when no pairing in progress */
  pendingPortal:     string | null;
  /** True when the ShopModal should be displayed */
  shopOpen:          boolean;
}
