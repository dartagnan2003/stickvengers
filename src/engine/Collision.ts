import type { Enemy, Projectile } from '../types/entities';
import { getEnemiesInRadius } from './GridSystem';

// ─── Hit-radius constants (in grid units) ────────────────────────────────────

const PROJ_HIT_HALF_WIDTH = 0.4;

// ─── Standard projectile × enemy collision pass ───────────────────────────────
//
// Runs every tick. Returns the surviving projectile list.
// onHit is called once per (projectile, enemy) impact — caller is responsible
// for mutating enemy HP so this function stays pure on projectiles.

export function checkCollisions(
  projectiles: Projectile[],
  enemies: Enemy[],
  onHit: (proj: Projectile, enemy: Enemy) => void,
): Projectile[] {
  return projectiles.filter(proj => {
    // Lobbed projectiles travel an arc and only detonate on landing (progress === 1).
    if (proj.type === 'LOBBED') {
      if ((proj.progress ?? 0) < 1) return true;
      // Landed — trigger AoE and remove
      handleAoEExplosion(
        proj.targetY ?? proj.y,
        proj.targetX ?? proj.x,
        enemies,
        proj.damage,
        'BLIND',
      );
      return false;
    }

    // LASER travels the full lane without stopping (piercing always true for LASER).
    const isPiercing = proj.piercing || proj.type === 'LASER';

    const hits = enemies.filter(
      e => e.y === proj.lane && Math.abs(e.x - proj.x) < PROJ_HIT_HALF_WIDTH,
    );

    if (hits.length === 0) {
      // Remove if it has exited the grid
      return proj.x < 9.5 && proj.x > -0.5;
    }

    hits.forEach(e => onHit(proj, e));
    return isPiercing; // piercing survives a hit; standard does not
  });
}

// ─── AoE explosion (Highlighter / Sharpie / Lobbed landing) ──────────────────

export function handleAoEExplosion(
  centerRow: number,
  centerCol: number,
  enemies: Enemy[],
  damage: number,
  debuff?: Enemy['statusDebuff'],
  rowRadius = 1,
  colRadius = 1,
): void {
  const affected = getEnemiesInRadius(enemies, centerRow, centerCol, rowRadius, colRadius);
  for (const enemy of affected) {
    enemy.hp -= damage;
    if (debuff) {
      enemy.statusDebuff = debuff;
      enemy.debuffDuration = 3.0;
    }
  }
}

// ─── Melee contact check ──────────────────────────────────────────────────────
//
// Returns true if enemy x has moved into the hero's cell column.
// Kept separate so GridSystem.getHeroInPath remains the source of truth.

export function isMeleeContact(enemyX: number, heroCol: number): boolean {
  return Math.floor(enemyX) === heroCol || (enemyX - heroCol < 0.1 && enemyX - heroCol >= -0.5);
}
