// ─── Primitives ───────────────────────────────────────────────────────────────

export type FogState        = 'dark' | 'explored' | 'lit';
export type Direction       = 'N' | 'E' | 'S' | 'W';
export type GamePhase       = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY';
export type GameMode        = 'SOLO' | 'COOP' | 'VS';
export type TurnOrder       = 'SIMULTANEOUS' | 'SEQUENTIAL';
export type VictoryCondition= 'REACH_EXIT' | 'COLLECT_PRIZE' | 'SURVIVE_WAVES';
export type PlayerRole      = 'HERO' | 'VILLAIN';
export type ItemType        = 'INK_CHARGE' | 'PRIZE' | 'HEALTH';
export type EnemyBehavior   = 'LURK' | 'PATROL' | 'WANDER';

// ─── Maze cell ────────────────────────────────────────────────────────────────

export interface CellWalls {
  N: boolean; E: boolean; S: boolean; W: boolean;
}

export interface MazeCell {
  readonly row:     number;
  readonly col:     number;
  walls:            CellWalls;   // mutable — items can be picked up
  item?:            ItemType;
  isExit:           boolean;
  isStart:          boolean;
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
  inkTimer:         number;   // seconds remaining on ink effect
  inkRadius:        number;   // current visibility radius
  /** Per-player fog — not shared between players */
  fogMap:           FogState[][];
  isAlive:          boolean;
  prizesCollected:  number;
  score:            number;
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
  readonly rows:       number;
  readonly cols:       number;
  cells:               MazeCell[][];   // mutable — items removed on pickup
  readonly startCell:  readonly [number, number];
  readonly exitCell:   readonly [number, number];
  readonly prizes:     ReadonlyArray<readonly [number, number]>;
  readonly enemySpawns: readonly EnemySpawnDef[];
  readonly totalPrizes: number;
}

// ─── Top-level game state (plain JSON-serializable — no Maps, no class instances)

export interface GameState {
  phase:             GamePhase;
  readonly mode:     GameMode;
  tick:              number;
  readonly turnOrder:         TurnOrder;
  readonly victoryCondition:  VictoryCondition;
  maze:              MazeConfig;
  /** Keyed by playerId — plain object so it serializes cleanly for BLE */
  players:           Record<string, PlayerState>;
  enemies:           EnemyState[];
  waveNumber:        number;
  waveTimer:         number;
  nextWaveIn:        number;   // seconds until next spawn (SURVIVE_WAVES)
  message?:          string;
}
