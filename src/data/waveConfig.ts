import type { EnemyId } from '../types/entities';

// ─── Per-wave enemy spawn entry ───────────────────────────────────────────────

export interface SpawnEntry {
  readonly enemyId: EnemyId;
  /** Seconds from wave-start before this enemy enters */
  readonly delaySeconds: number;
  /** Override lane (0–4); omit for random */
  readonly lane?: number;
}

export interface WaveDefinition {
  readonly waveNumber: number;
  readonly level: number;
  readonly spawns: readonly SpawnEntry[];
  /** Seconds after last spawn before victory is checked */
  readonly clearDelay: number;
}

// ─── Level 1 waves (tutorial pacing) ─────────────────────────────────────────

const L1: readonly WaveDefinition[] = [
  {
    waveNumber: 1, level: 1, clearDelay: 8,
    spawns: [
      { enemyId: 'paperclip', delaySeconds: 0 },
      { enemyId: 'paperclip', delaySeconds: 4 },
      { enemyId: 'paperclip', delaySeconds: 8 },
    ],
  },
  {
    waveNumber: 2, level: 1, clearDelay: 8,
    spawns: [
      { enemyId: 'paperclip', delaySeconds: 0 },
      { enemyId: 'paperclip', delaySeconds: 3 },
      { enemyId: 'stapler',   delaySeconds: 6 },
    ],
  },
  {
    waveNumber: 3, level: 1, clearDelay: 10,
    spawns: [
      { enemyId: 'paperclip', delaySeconds: 0 },
      { enemyId: 'rubber_band', delaySeconds: 2 },
      { enemyId: 'paperclip', delaySeconds: 4 },
      { enemyId: 'stapler',   delaySeconds: 6 },
      { enemyId: 'paperclip', delaySeconds: 8 },
    ],
  },
];

// ─── Level 2–3 waves (introduces coffee & red_tape) ──────────────────────────

const L2: readonly WaveDefinition[] = [
  {
    waveNumber: 1, level: 2, clearDelay: 10,
    spawns: [
      { enemyId: 'paperclip',  delaySeconds: 0 },
      { enemyId: 'coffee',     delaySeconds: 3 },
      { enemyId: 'paperclip',  delaySeconds: 5 },
      { enemyId: 'rubber_band', delaySeconds: 7 },
    ],
  },
  {
    waveNumber: 2, level: 2, clearDelay: 10,
    spawns: [
      { enemyId: 'red_tape',   delaySeconds: 0 },
      { enemyId: 'paperclip',  delaySeconds: 2 },
      { enemyId: 'coffee',     delaySeconds: 4 },
      { enemyId: 'stapler',    delaySeconds: 6 },
      { enemyId: 'red_tape',   delaySeconds: 8 },
    ],
  },
  {
    waveNumber: 3, level: 2, clearDelay: 12,
    spawns: [
      { enemyId: 'coffee',      delaySeconds: 0 },
      { enemyId: 'rubber_band', delaySeconds: 1 },
      { enemyId: 'red_tape',    delaySeconds: 3 },
      { enemyId: 'paperclip',   delaySeconds: 4 },
      { enemyId: 'stapler',     delaySeconds: 6 },
      { enemyId: 'coffee',      delaySeconds: 9 },
    ],
  },
];

const L3: readonly WaveDefinition[] = [
  {
    waveNumber: 1, level: 3, clearDelay: 12,
    spawns: [
      { enemyId: 'sticky_note', delaySeconds: 0 },
      { enemyId: 'paperclip',   delaySeconds: 2 },
      { enemyId: 'red_tape',    delaySeconds: 4 },
      { enemyId: 'coffee',      delaySeconds: 6 },
      { enemyId: 'sticky_note', delaySeconds: 8 },
    ],
  },
  {
    waveNumber: 2, level: 3, clearDelay: 12,
    spawns: [
      { enemyId: 'rubber_band', delaySeconds: 0 },
      { enemyId: 'rubber_band', delaySeconds: 1 },
      { enemyId: 'stapler',     delaySeconds: 3 },
      { enemyId: 'coffee',      delaySeconds: 5 },
      { enemyId: 'sticky_note', delaySeconds: 7 },
      { enemyId: 'red_tape',    delaySeconds: 9 },
    ],
  },
  {
    waveNumber: 3, level: 3, clearDelay: 15,
    spawns: [
      { enemyId: 'paperclip',   delaySeconds: 0 },
      { enemyId: 'red_tape',    delaySeconds: 1 },
      { enemyId: 'coffee',      delaySeconds: 2 },
      { enemyId: 'stapler',     delaySeconds: 3 },
      { enemyId: 'sticky_note', delaySeconds: 5 },
      { enemyId: 'rubber_band', delaySeconds: 7 },
      { enemyId: 'shredder',    delaySeconds: 12, lane: 2 },
    ],
  },
];

// ─── Levels 4–10: procedurally scaled copies ─────────────────────────────────
// Full scripted wave sets for later levels follow the same pattern.
// For MVP these use the L3 template; waveConfig consumers apply
// LEVEL_SCALE_TABLE multipliers to HP/speed/damage at spawn time.

function buildScaledLevel(level: number, waveCount: number): readonly WaveDefinition[] {
  return Array.from({ length: waveCount }, (_, i) => {
    const base = L3[i % L3.length];
    return { ...base, waveNumber: i + 1, level } as WaveDefinition;
  });
}

// ─── Master wave registry ─────────────────────────────────────────────────────

export const WAVE_REGISTRY: Readonly<Record<number, readonly WaveDefinition[]>> = {
  1:  L1,
  2:  L2,
  3:  L3,
  4:  buildScaledLevel(4, 4),
  5:  buildScaledLevel(5, 4),
  6:  buildScaledLevel(6, 5),
  7:  buildScaledLevel(7, 5),
  8:  buildScaledLevel(8, 5),
  9:  buildScaledLevel(9, 6),
  10: buildScaledLevel(10, 6),
} as const;
