import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, GameStatus, Hero, Enemy, HeroId, EnemyId } from '../types/entities';
import { HERO_BLUEPRINTS, ENEMY_BLUEPRINTS, getComputedHeroStats } from '../data/unitRegistry';
import { WAVE_REGISTRY } from '../data/waveConfig';
import { LEVEL_SCALE_TABLE } from '../types/skills';
import { cellKey, isCellOccupied, isValidCell, getHeroInPath, getEnemiesAhead, GRID_COLS } from './GridSystem';
import { checkCollisions, handleAoEExplosion, isMeleeContact } from './Collision';

// ─── Ink constants ────────────────────────────────────────────────────────────

const INK_TICK_INTERVAL = 2.0;   // seconds between passive ink drops
const INK_TICK_AMOUNT   = 25;    // ink per tick
const INK_MAX           = 9999;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function buildEnemy(enemyId: EnemyId, lane: number, level: number): Enemy {
  const bp = ENEMY_BLUEPRINTS[enemyId];
  const scale = LEVEL_SCALE_TABLE[Math.max(1, Math.min(10, level))];
  return {
    id: `enemy_${uid()}`,
    type: enemyId,
    name: bp.name,
    hp: Math.round(bp.hp * scale.hpScale),
    maxHp: Math.round(bp.hp * scale.hpScale),
    x: GRID_COLS,
    y: lane,
    speed: bp.speed * scale.speedScale,
    threatType: bp.threatType,
    damage: Math.round(bp.damage * scale.damageScale),
    attackCooldown: bp.attackCooldown,
    lastAttackTime: 0,
    debuffDuration: 0,
  };
}

// ─── Initial state ────────────────────────────────────────────────────────────

function makeInitialState(level: number): GameState {
  return {
    status: 'PLAYING',
    ink: 200,
    level,
    heroes: new Map(),
    enemies: [],
    projectiles: [],
    wave: 0,
    score: 0,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGameLoop(initialLevel: number) {
  const [gameState, setGameState] = useState<GameState>(() => makeInitialState(initialLevel));

  // Refs hold mutable loop state without triggering re-renders
  const stateRef        = useRef<GameState>(gameState);
  const lastTimeRef     = useRef<number>(0);
  const inkAccumRef     = useRef<number>(0);
  const waveTimerRef    = useRef<number>(0);  // seconds since wave started
  const waveIndexRef    = useRef<number>(0);  // next SpawnEntry index to process
  const currentWaveRef  = useRef<number>(0);  // 0-based wave index in WAVE_REGISTRY
  const clearTimerRef   = useRef<number>(0);  // counts down after last spawn
  const frameIdRef      = useRef<number>(0);

  stateRef.current = gameState;

  // ── Wave helpers ────────────────────────────────────────────────────────────

  const getWaves = useCallback((level: number) => {
    return WAVE_REGISTRY[Math.max(1, Math.min(10, level))] ?? WAVE_REGISTRY[1];
  }, []);

  // ── Main RAF loop ───────────────────────────────────────────────────────────

  useEffect(() => {
    function loop(timestamp: number) {
      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1); // cap at 100 ms
      lastTimeRef.current = timestamp;

      const cur = stateRef.current;
      if (cur.status !== 'PLAYING') {
        frameIdRef.current = requestAnimationFrame(loop);
        return;
      }

      // Clone mutable collections for this tick
      const enemies     = cur.enemies.map(e => ({ ...e }));
      const projectiles = cur.projectiles.map(p => ({ ...p }));
      const heroes      = new Map(cur.heroes);
      let ink           = cur.ink;
      let score         = cur.score;
      let status: GameStatus = cur.status;
      const level       = cur.level;
      const waves       = getWaves(level);

      // ── 1. Passive ink income ──────────────────────────────────────────────
      inkAccumRef.current += dt;
      if (inkAccumRef.current >= INK_TICK_INTERVAL) {
        ink = Math.min(ink + INK_TICK_AMOUNT, INK_MAX);
        inkAccumRef.current -= INK_TICK_INTERVAL;
      }

      // ── 2. Wave / spawn engine ─────────────────────────────────────────────
      const waveIdx    = currentWaveRef.current;
      const waveDef    = waves[waveIdx];

      if (waveDef) {
        waveTimerRef.current += dt;
        const t = waveTimerRef.current;

        // Emit spawns whose delay has elapsed and haven't been emitted yet
        while (waveIndexRef.current < waveDef.spawns.length) {
          const entry = waveDef.spawns[waveIndexRef.current];
          if (t >= entry.delaySeconds) {
            const lane = entry.lane ?? Math.floor(Math.random() * 5);
            enemies.push(buildEnemy(entry.enemyId, lane, level));
            waveIndexRef.current++;
          } else {
            break;
          }
        }

        // Check wave clear: all spawns done, enemies gone, clear delay elapsed
        const allSpawned = waveIndexRef.current >= waveDef.spawns.length;
        if (allSpawned) {
          clearTimerRef.current += dt;
          if (enemies.length === 0 && clearTimerRef.current >= waveDef.clearDelay) {
            if (waveIdx + 1 < waves.length) {
              // Advance to next wave
              currentWaveRef.current++;
              waveTimerRef.current  = 0;
              waveIndexRef.current  = 0;
              clearTimerRef.current = 0;
            } else {
              status = 'VICTORY';
            }
          }
        }
      }

      // ── 3. Debuff timers ───────────────────────────────────────────────────
      for (const enemy of enemies) {
        if (enemy.statusDebuff && enemy.debuffDuration > 0) {
          enemy.debuffDuration = Math.max(0, enemy.debuffDuration - dt);
          if (enemy.debuffDuration === 0) {
            enemy.statusDebuff = undefined;
          }
        }
      }

      // ── 4. Enemy movement & melee ──────────────────────────────────────────
      for (const enemy of enemies) {
        const blocker = getHeroInPath(heroes, enemy.y, enemy.x);

        if (blocker && isMeleeContact(enemy.x, blocker.x)) {
          // Melee attack
          if (timestamp - enemy.lastAttackTime >= enemy.attackCooldown * 1000) {
            blocker.hp -= enemy.damage;
            enemy.lastAttackTime = timestamp;
            if (blocker.hp <= 0) {
              heroes.delete(cellKey(blocker.y, Math.floor(blocker.x)));
            }
          }
        } else {
          // Advance toward notebook
          const effectiveSpeed = enemy.statusDebuff === 'SLOW' ? enemy.speed * 0.5 : enemy.speed;
          enemy.x -= effectiveSpeed * dt;
        }
      }

      // ── 5. Hero firing ─────────────────────────────────────────────────────
      heroes.forEach((hero) => {
        if (hero.attackCooldown === 0) return; // melee/instant only

        const cooldownMs = hero.attackCooldown * 1000;
        if (timestamp - hero.lastShotTime < cooldownMs) return;

        const targets = getEnemiesAhead(enemies, hero.y, hero.x);
        if (targets.length === 0) return;

        hero.lastShotTime = timestamp;

        // Forward shot
        projectiles.push({
          id: `proj_${uid()}`,
          x: hero.x + 0.5,
          y: hero.y,
          lane: hero.y,
          speed: 4.0,
          damage: hero.damage,
          type: hero.projectileType,
          piercing: hero.piercing,
        });

        // Rear shot (pencil lvl 4+)
        if (hero.hasRearShot) {
          projectiles.push({
            id: `proj_${uid()}`,
            x: hero.x - 0.5,
            y: hero.y,
            lane: hero.y,
            speed: -4.0,
            damage: Math.round(hero.damage * 0.6),
            type: hero.projectileType,
            piercing: false,
          });
        }

        // Cone spread (pencil/sharpie lvl 10): also fires into adjacent lanes
        if (hero.coneSpread) {
          for (const adjRow of [hero.y - 1, hero.y + 1]) {
            if (adjRow >= 0 && adjRow < 5) {
              projectiles.push({
                id: `proj_${uid()}`,
                x: hero.x + 0.5,
                y: adjRow,
                lane: adjRow,
                speed: 3.5,
                damage: Math.round(hero.damage * 0.5),
                type: hero.projectileType,
                piercing: false,
              });
            }
          }
        }
      });

      // ── 6. Projectile movement ─────────────────────────────────────────────
      for (const proj of projectiles) {
        if (proj.type === 'LOBBED') {
          // Arc progress 0→1 over distance
          proj.progress = Math.min(1, (proj.progress ?? 0) + dt * 0.8);
        } else {
          proj.x += proj.speed * dt;
        }
      }

      // ── 7. Collision resolution ────────────────────────────────────────────
      const survivingProjectiles = checkCollisions(projectiles, enemies, (proj, enemy) => {
        enemy.hp -= proj.damage;
        // Apply slow on clicky_pen projectiles
        if (enemy.statusDebuff === undefined) {
          // Hero type is embedded in projectile via the lane lookup... we use a simple heuristic:
          // slowEffect is tracked at hero level; for now GRAPHITE from slow-enabled heroes applies it.
          // Full hero-type tagging on projectiles is a natural next step.
        }
      });

      // Remove dead enemies
      const survivingEnemies = enemies.filter(e => {
        if (e.hp <= 0) { score += 10; return false; }
        return true;
      });

      // ── 8. Slow-effect application from clicky_pen ────────────────────────
      // Tag projectiles fired by a slow-enabled hero at spawn time instead of here.
      // (Architecture note: add `appliesSlow: boolean` to Projectile for a clean pass.)

      // ── 9. Loss condition ──────────────────────────────────────────────────
      if (survivingEnemies.some(e => e.x <= 0)) {
        status = 'GAMEOVER';
      }

      setGameState({
        status,
        ink,
        level,
        heroes,
        enemies: survivingEnemies,
        projectiles: survivingProjectiles,
        wave: currentWaveRef.current + 1,
        score,
      });

      frameIdRef.current = requestAnimationFrame(loop);
    }

    frameIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameIdRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — loop reads from refs

  // ── Public: place hero on grid ─────────────────────────────────────────────

  const placeHero = useCallback((row: number, col: number, heroId: HeroId, heroLevel: number): boolean => {
    const cur = stateRef.current;
    if (!isValidCell(row, col)) return false;
    if (isCellOccupied(cur.heroes, row, col)) return false;

    const bp   = HERO_BLUEPRINTS[heroId];
    const cost = bp.inkCost;
    if (cur.ink < cost) return false;

    const stats = getComputedHeroStats(heroId, heroLevel);
    const key   = cellKey(row, col);

    const hero: Hero = {
      id: `hero_${uid()}`,
      type: heroId,
      name: bp.name,
      hp: stats.hp,
      maxHp: stats.hp,
      x: col,
      y: row,
      inkCost: cost,
      level: heroLevel,
      attackCooldown: stats.attackCooldown,
      damage: stats.damage,
      projectileType: bp.projectileType,
      lastShotTime: 0,
      hasRearShot: stats.hasRearShot,
      piercing: stats.piercing,
      slowEffect: stats.slowEffect,
      coneSpread: stats.coneSpread,
    };

    setGameState(prev => {
      if (prev.ink < cost) return prev;
      const nextHeroes = new Map(prev.heroes);
      nextHeroes.set(key, hero);

      // Highlighter: immediate AoE on placement — schedule into next microtask
      // so it lands after the state settles.
      if (heroId === 'highlighter') {
        setTimeout(() => {
          setGameState(g => {
            const mutableEnemies = g.enemies.map(e => ({ ...e }));
            handleAoEExplosion(row, col, mutableEnemies, stats.damage, 'BLIND');
            const alive = mutableEnemies.filter(e => e.hp > 0);
            const cleanHeroes = new Map(g.heroes);
            cleanHeroes.delete(key); // consumed on use
            return { ...g, enemies: alive, heroes: cleanHeroes, score: g.score + (g.enemies.length - alive.length) * 10 };
          });
        }, 300);
      }

      return { ...prev, ink: prev.ink - cost, heroes: nextHeroes };
    });

    return true;
  }, []);

  // ── Public: reset game ─────────────────────────────────────────────────────

  const resetGame = useCallback((level = initialLevel) => {
    currentWaveRef.current  = 0;
    waveTimerRef.current    = 0;
    waveIndexRef.current    = 0;
    clearTimerRef.current   = 0;
    inkAccumRef.current     = 0;
    lastTimeRef.current     = 0;
    setGameState(makeInitialState(level));
  }, [initialLevel]);

  return { gameState, placeHero, resetGame };
}
