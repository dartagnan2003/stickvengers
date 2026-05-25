// ─── Primitive enumerations ───────────────────────────────────────────────────

export type TeamType = 'GOOD' | 'EVIL';
export type StatusDebuff = 'SLOW' | 'BLIND' | 'STUN';
export type ProjectileType = 'GRAPHITE' | 'INK_BLOT' | 'LOBBED' | 'LASER';
export type HeroId =
  | 'inkwell' | 'pencil' | 'eraser' | 'clicky_pen'
  | 'highlighter' | 'sharpie' | 'whiteout' | 'crayon' | 'marker';
export type EnemyId =
  | 'paperclip' | 'coffee' | 'red_tape' | 'shredder'
  | 'rubber_band' | 'stapler' | 'sticky_note';

// ─── Blueprint shapes (static config, never mutated at runtime) ───────────────

export interface HeroBlueprint {
  readonly id: HeroId;
  readonly name: string;
  readonly emoji: string;
  readonly hp: number;
  readonly inkCost: number;
  /** Seconds between shots; 0 = melee/instant only */
  readonly attackCooldown: number;
  /** Base projectile damage per shot */
  readonly damage: number;
  readonly projectileType: ProjectileType;
  readonly description: string;
}

export interface EnemyBlueprint {
  readonly id: EnemyId;
  readonly name: string;
  readonly emoji: string;
  readonly hp: number;
  /** Grid columns per second */
  readonly speed: number;
  readonly damage: number;
  /** Seconds between melee attacks */
  readonly attackCooldown: number;
  readonly threatType: 'SWARM' | 'TANK' | 'FAST' | 'BOSS' | 'SHIELD';
  readonly appliesDebuff?: StatusDebuff;
}

// ─── Runtime entity shapes ────────────────────────────────────────────────────

export interface BaseEntity {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  hp: number;
  readonly maxHp: number;
  /** Grid column — float for smooth motion (0–8) */
  x: number;
  /** Grid row — integer (0–4) */
  readonly y: number;
}

export interface Hero extends BaseEntity {
  readonly type: HeroId;
  readonly level: number;
  readonly inkCost: number;
  readonly attackCooldown: number;
  readonly damage: number;
  readonly projectileType: ProjectileType;
  lastShotTime: number;
  // Level-unlocked flags
  readonly hasRearShot: boolean;
  readonly piercing: boolean;
  readonly slowEffect: boolean;
  readonly coneSpread: boolean;
}

export interface Enemy extends BaseEntity {
  readonly type: EnemyId;
  speed: number;
  readonly threatType: string;
  statusDebuff?: StatusDebuff;
  debuffDuration: number;
  readonly damage: number;
  readonly attackCooldown: number;
  lastAttackTime: number;
}

export interface Projectile {
  readonly id: string;
  x: number;
  readonly y: number;
  readonly speed: number;
  readonly damage: number;
  readonly type: ProjectileType;
  readonly lane: number;
  readonly piercing: boolean;
  /** For LOBBED arc tracking: 0→1 */
  progress?: number;
  readonly targetX?: number;
  readonly targetY?: number;
  readonly startX?: number;
}

// ─── Top-level game state (immutable shape, values replaced on each tick) ─────

export type GameStatus = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY';

export interface GameState {
  status: GameStatus;
  /** Current ink (resource) */
  ink: number;
  readonly level: number;
  /** Keyed by "row_col", e.g. "2_5" */
  heroes: Map<string, Hero>;
  enemies: Enemy[];
  projectiles: Projectile[];
  wave: number;
  score: number;
}
