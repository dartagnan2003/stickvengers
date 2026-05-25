import type { HeroId } from './entities';

// ─── Per-level unlock descriptor ─────────────────────────────────────────────

export interface LevelUnlock {
  readonly level: number;
  readonly description: string;
}

// ─── Hero progression tree (levels 1–10) ─────────────────────────────────────

export interface HeroSkillTree {
  readonly heroId: HeroId;
  /** Cumulative HP multiplier applied at this level */
  readonly hpMultiplierByLevel: Readonly<Record<number, number>>;
  /** Cumulative attack-cooldown multiplier (< 1 = faster) */
  readonly cooldownMultiplierByLevel: Readonly<Record<number, number>>;
  /** Damage multiplier per level */
  readonly damageMultiplierByLevel: Readonly<Record<number, number>>;
  readonly unlocks: readonly LevelUnlock[];
}

// ─── Stat modifier applied to a hero at runtime ──────────────────────────────

export interface ComputedHeroStats {
  hp: number;
  attackCooldown: number;
  damage: number;
  hasRearShot: boolean;
  piercing: boolean;
  slowEffect: boolean;
  coneSpread: boolean;
  deathExplosion: boolean;
  contactDamage: number;
}

// ─── Enemy level-scaling descriptor ──────────────────────────────────────────

export interface LevelScaleRow {
  readonly level: number;
  /** Multiplier applied to enemy HP */
  readonly hpScale: number;
  /** Multiplier applied to enemy speed */
  readonly speedScale: number;
  /** Multiplier applied to enemy damage */
  readonly damageScale: number;
  /** Maximum number of enemies alive at once */
  readonly maxConcurrent: number;
  /** Seconds between spawns */
  readonly spawnInterval: number;
}

export const LEVEL_SCALE_TABLE: Readonly<Record<number, LevelScaleRow>> = {
  1:  { level: 1,  hpScale: 1.00, speedScale: 1.00, damageScale: 1.00, maxConcurrent: 3,  spawnInterval: 6.0 },
  2:  { level: 2,  hpScale: 1.15, speedScale: 1.05, damageScale: 1.10, maxConcurrent: 4,  spawnInterval: 5.5 },
  3:  { level: 3,  hpScale: 1.30, speedScale: 1.10, damageScale: 1.20, maxConcurrent: 5,  spawnInterval: 5.0 },
  4:  { level: 4,  hpScale: 1.50, speedScale: 1.15, damageScale: 1.35, maxConcurrent: 6,  spawnInterval: 4.5 },
  5:  { level: 5,  hpScale: 1.75, speedScale: 1.20, damageScale: 1.50, maxConcurrent: 7,  spawnInterval: 4.0 },
  6:  { level: 6,  hpScale: 2.00, speedScale: 1.25, damageScale: 1.70, maxConcurrent: 8,  spawnInterval: 3.5 },
  7:  { level: 7,  hpScale: 2.35, speedScale: 1.30, damageScale: 2.00, maxConcurrent: 9,  spawnInterval: 3.0 },
  8:  { level: 8,  hpScale: 2.75, speedScale: 1.40, damageScale: 2.30, maxConcurrent: 10, spawnInterval: 2.5 },
  9:  { level: 9,  hpScale: 3.25, speedScale: 1.50, damageScale: 2.70, maxConcurrent: 12, spawnInterval: 2.0 },
  10: { level: 10, hpScale: 4.00, speedScale: 1.65, damageScale: 3.25, maxConcurrent: 15, spawnInterval: 1.5 },
} as const;
