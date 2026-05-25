import type { HeroBlueprint, EnemyBlueprint, HeroId, EnemyId } from '../types/entities';
import type { ComputedHeroStats } from '../types/skills';

// ─── Hero blueprints (baseline, level 1) ─────────────────────────────────────

export const HERO_BLUEPRINTS: Readonly<Record<HeroId, HeroBlueprint>> = {
  inkwell: {
    id: 'inkwell', name: 'Inkwell', emoji: '🫙',
    hp: 500, inkCost: 50, attackCooldown: 12.0, damage: 8,
    projectileType: 'INK_BLOT',
    description: 'Slow-firing ink drop. Low cost, steady DPS.',
  },
  pencil: {
    id: 'pencil', name: 'Regular Pencil', emoji: '✏️',
    hp: 300, inkCost: 100, attackCooldown: 1.5, damage: 15,
    projectileType: 'GRAPHITE',
    description: 'Workhorse ranged attacker. Unlocks rear-shot at Lvl 4.',
  },
  eraser: {
    id: 'eraser', name: 'The Eraser', emoji: '🟫',
    hp: 4000, inkCost: 50, attackCooldown: 0, damage: 0,
    projectileType: 'GRAPHITE',
    description: 'Melee tank. Absorbs damage, deals contact damage at Lvl 4.',
  },
  clicky_pen: {
    id: 'clicky_pen', name: 'Clicky Pen', emoji: '🖊️',
    hp: 350, inkCost: 200, attackCooldown: 1.0, damage: 20,
    projectileType: 'GRAPHITE',
    description: 'Fast-fire ranged. Applies SLOW at Lvl 4.',
  },
  highlighter: {
    id: 'highlighter', name: 'Highlighter', emoji: '🟡',
    hp: 100, inkCost: 150, attackCooldown: 0, damage: 500,
    projectileType: 'LOBBED',
    description: 'One-shot AoE burst on placement. Applies BLIND.',
  },
  sharpie: {
    id: 'sharpie', name: 'Fat Sharpie', emoji: '🖋️',
    hp: 400, inkCost: 325, attackCooldown: 2.5, damage: 60,
    projectileType: 'INK_BLOT',
    description: 'Heavy-damage ink cannon with splash radius.',
  },
  whiteout: {
    id: 'whiteout', name: 'White-Out Tape', emoji: '📄',
    hp: 100, inkCost: 75, attackCooldown: 0, damage: 0,
    projectileType: 'GRAPHITE',
    description: 'Instant-place row block. Erases one enemy on contact.',
  },
  crayon: {
    id: 'crayon', name: 'Crayon Pack', emoji: '🖍️',
    hp: 2500, inkCost: 175, attackCooldown: 0, damage: 0,
    projectileType: 'GRAPHITE',
    description: 'Durable roadblock. No attack, pure stall.',
  },
  marker: {
    id: 'marker', name: 'Magic Marker', emoji: '✒️',
    hp: 500, inkCost: 400, attackCooldown: 3.0, damage: 80,
    projectileType: 'LASER',
    description: 'Long-range laser beam. Piercing at Lvl 7.',
  },
} as const;

// ─── Enemy blueprints (baseline, level 1) ────────────────────────────────────

export const ENEMY_BLUEPRINTS: Readonly<Record<EnemyId, EnemyBlueprint>> = {
  paperclip: {
    id: 'paperclip', name: 'Paperclip Grunt', emoji: '📎',
    hp: 150, speed: 0.30, damage: 20, attackCooldown: 1.0,
    threatType: 'SWARM',
  },
  coffee: {
    id: 'coffee', name: 'Coffee Spill', emoji: '☕',
    hp: 600, speed: 0.15, damage: 10, attackCooldown: 1.5,
    threatType: 'TANK', appliesDebuff: 'SLOW',
  },
  red_tape: {
    id: 'red_tape', name: 'Red Tape', emoji: '🎗️',
    hp: 300, speed: 0.45, damage: 30, attackCooldown: 1.0,
    threatType: 'FAST',
  },
  shredder: {
    id: 'shredder', name: 'The Shredder', emoji: '🗂️',
    hp: 5000, speed: 0.05, damage: 500, attackCooldown: 2.0,
    threatType: 'BOSS',
  },
  rubber_band: {
    id: 'rubber_band', name: 'Rubber Band', emoji: '🔁',
    hp: 200, speed: 0.50, damage: 15, attackCooldown: 0.8,
    threatType: 'FAST',
  },
  stapler: {
    id: 'stapler', name: 'Stapler', emoji: '🔩',
    hp: 400, speed: 0.20, damage: 25, attackCooldown: 1.2,
    threatType: 'SWARM',
  },
  sticky_note: {
    id: 'sticky_note', name: 'Sticky Note Shield', emoji: '📋',
    hp: 400, speed: 0.20, damage: 20, attackCooldown: 1.0,
    threatType: 'SHIELD',
  },
} as const;

// ─── Level-scaling stat lookup ────────────────────────────────────────────────
//
// Returns fully-computed hero stats for a given heroId + level.
// All hero-specific unlocks are resolved here so callers never
// inspect levels directly.

export function getComputedHeroStats(heroId: HeroId, level: number): ComputedHeroStats {
  const bp = HERO_BLUEPRINTS[heroId];
  let hp = bp.hp;
  let attackCooldown = bp.attackCooldown;
  let damage = bp.damage;

  // ── Tier 1 unlock: level 4 ───────────────────────────────────────────────
  if (level >= 4) {
    hp *= 1.20;
    damage *= 1.15;
  }

  // ── Tier 2 unlock: level 7 ───────────────────────────────────────────────
  if (level >= 7) {
    hp *= 1.30;
    damage *= 1.30;
    if (attackCooldown > 0) attackCooldown *= 0.80;
  }

  // ── Tier 3 unlock: level 10 ──────────────────────────────────────────────
  if (level === 10) {
    hp *= 1.50;
    damage *= 1.50;
    if (attackCooldown > 0) attackCooldown *= 0.75;
  }

  // ── Hero-specific flag unlocks (switch table) ─────────────────────────────
  let hasRearShot = false;
  let piercing = false;
  let slowEffect = false;
  let coneSpread = false;
  let deathExplosion = false;
  let contactDamage = 0;

  switch (heroId) {
    case 'pencil':
      if (level >= 4)  hasRearShot = true;
      if (level >= 7)  piercing    = true;
      if (level === 10) coneSpread = true;
      break;

    case 'eraser':
      if (level >= 4)   contactDamage  = 5;
      if (level === 10) deathExplosion = true;
      break;

    case 'clicky_pen':
      if (level >= 4) slowEffect = true;
      break;

    case 'marker':
      if (level >= 7) piercing = true;
      break;

    case 'sharpie':
      if (level >= 7) coneSpread = true;
      break;

    // inkwell, highlighter, whiteout, crayon, sticky_note: no special flags
    default:
      break;
  }

  return {
    hp: Math.round(hp),
    attackCooldown,
    damage: Math.round(damage),
    hasRearShot,
    piercing,
    slowEffect,
    coneSpread,
    deathExplosion,
    contactDamage,
  };
}
