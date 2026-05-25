import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { HeroId } from '../types/entities';
import { useGameLoop } from '../engine/useGameLoop';
import { GRID_ROWS, GRID_COLS, ROW_HEIGHT_PX } from '../engine/GridSystem';
import { HERO_BLUEPRINTS, ENEMY_BLUEPRINTS } from '../data/unitRegistry';
import { SidePanel } from './SidePanel';
import { UpgradeModal } from './UpgradeModal';
import { ProjectileCanvas } from './ProjectileCanvas';

// ─── Constants ────────────────────────────────────────────────────────────────

const UPGRADE_COST_PER_LEVEL = [0, 0, 150, 250, 400, 600, 900, 1300, 1800, 2500, 3500];

const INITIAL_HERO_LEVELS: Record<HeroId, number> = {
  inkwell: 1, pencil: 1, eraser: 1, clicky_pen: 1,
  highlighter: 1, sharpie: 1, whiteout: 1, crayon: 1, marker: 1,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeathBurst {
  id: string;
  /** CSS pixels from the grid's top-left corner */
  x: number;
  y: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GameCanvas: React.FC = () => {
  const { gameState, placeHero, resetGame } = useGameLoop(1);
  const [selectedHero, setSelectedHero]     = useState<HeroId | null>(null);
  const [heroLevels, setHeroLevels]         = useState<Record<HeroId, number>>(INITIAL_HERO_LEVELS);
  const [upgradeOpen, setUpgradeOpen]       = useState(false);

  // ── Area 4: event animation state ─────────────────────────────────────────
  const [hitEnemyIds, setHitEnemyIds]   = useState<Set<string>>(new Set());
  const [deathBursts, setDeathBursts]   = useState<DeathBurst[]>([]);
  const [inkPulse, setInkPulse]         = useState(false);

  // ── Grid pixel width (drives transform positioning + canvas size) ──────────
  const gridRef   = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    setGridWidth(el.offsetWidth);
    const ro = new ResizeObserver(() => setGridWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Area 4: hit flash + death burst tracking ───────────────────────────────
  //
  // We diff gameState.enemies each frame (runs on every render, but the work
  // is O(N) on a small array so it's fine).
  //
  // prevEnemyHpRef  — id → last known hp
  // prevEnemyPosRef — id → last known grid position (for burst placement)

  const prevEnemyHpRef  = useRef<Map<string, number>>(new Map());
  const prevEnemyPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const prevHp  = prevEnemyHpRef.current;
    const prevPos = prevEnemyPosRef.current;
    const newHits: string[]      = [];
    const newBursts: DeathBurst[] = [];

    // Deaths: was in prev, gone from current
    prevHp.forEach((hp, id) => {
      if (hp > 0 && !gameState.enemies.find(e => e.id === id)) {
        const pos = prevPos.get(id);
        if (pos && gridWidth > 0) {
          newBursts.push({
            id:   `burst_${id}_${Date.now()}`,
            x:    (pos.x / GRID_COLS) * gridWidth,
            y:    pos.y * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2,
          });
        }
      }
    });

    // Hits: hp decreased
    for (const enemy of gameState.enemies) {
      const ph = prevHp.get(enemy.id);
      if (ph !== undefined && enemy.hp < ph) newHits.push(enemy.id);
    }

    // Update snapshot refs
    prevEnemyHpRef.current  = new Map(gameState.enemies.map(e => [e.id, e.hp]));
    prevEnemyPosRef.current = new Map(
      gameState.enemies.map(e => [e.id, { x: e.x, y: e.y }]),
    );

    if (newBursts.length > 0) {
      setDeathBursts(prev => [...prev, ...newBursts]);
    }

    if (newHits.length === 0) return;

    setHitEnemyIds(prev => {
      const next = new Set(prev);
      for (const id of newHits) next.add(id);
      return next;
    });
    const t = setTimeout(() => {
      setHitEnemyIds(prev => {
        const next = new Set(prev);
        for (const id of newHits) next.delete(id);
        return next;
      });
    }, 200);
    return () => clearTimeout(t);
  }, [gameState.enemies, gridWidth]);

  // ── Area 5: ink pulse ──────────────────────────────────────────────────────
  // Fire whenever ink increases (passive ticks). Avoid false-positives on
  // spend events by checking direction of change.

  const prevInkRef = useRef(gameState.ink);
  useEffect(() => {
    if (gameState.ink > prevInkRef.current) {
      setInkPulse(true);
      const t = setTimeout(() => setInkPulse(false), 420);
      prevInkRef.current = gameState.ink;
      return () => clearTimeout(t);
    }
    prevInkRef.current = gameState.ink;
  }, [gameState.ink]);

  // ── Interaction ────────────────────────────────────────────────────────────

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!selectedHero) return;
    const placed = placeHero(row, col, selectedHero, heroLevels[selectedHero] ?? 1);
    if (placed) setSelectedHero(null);
  }, [selectedHero, heroLevels, placeHero]);

  const handleUpgrade = useCallback((id: HeroId): boolean => {
    const lvl = heroLevels[id] ?? 1;
    if (lvl >= 10) return false;
    const cost = UPGRADE_COST_PER_LEVEL[lvl + 1] ?? 0;
    if (gameState.ink < cost) return false;
    setHeroLevels(prev => ({ ...prev, [id]: Math.min(10, (prev[id] ?? 1) + 1) }));
    return true;
  }, [heroLevels, gameState.ink]);

  // ── Derived rendering data ─────────────────────────────────────────────────

  const gridHeightPx = GRID_ROWS * ROW_HEIGHT_PX;
  const rows = Array.from({ length: GRID_ROWS }, (_, i) => i);
  const cols = Array.from({ length: GRID_COLS },  (_, i) => i);

  // Area 5: which lanes have active enemies, and is danger zone triggered
  const hotLanes    = new Set(gameState.enemies.map(e => e.y));
  const dangerActive = gameState.enemies.some(e => e.x < 2.5);

  // Convert grid-space coords to CSS pixels (for transform: translate)
  // The percentage of the *element's own width* trick only works for full-width
  // wrappers — instead we measure the grid container and use raw pixels.
  const toPx = (gx: number): number =>
    gridWidth > 0 ? (gx / GRID_COLS) * gridWidth : 0;
  const toTopPx = (gy: number, offset = 14): number =>
    gy * ROW_HEIGHT_PX + offset;

  // Danger zone width = 2 grid columns
  const dangerWidthPx = gridWidth > 0 ? (2 / GRID_COLS) * gridWidth : 0;

  return (
    <div style={{ fontFamily: "'Courier New', Courier, monospace" }}>

      {/* ── HUD ─────────────────────────────────────────────────────────── */}
      <div className="hud">
        <span>🖋️ STICKVENGERS</span>
        {/* Area 5: ink-pulse class drives the scale keyframe */}
        <span className={`hud-ink${inkPulse ? ' ink-pulse' : ''}`}>
          INK: {gameState.ink} mL
        </span>
        <span>WAVE {gameState.wave}</span>
        <span>SCORE: {gameState.score}</span>
        <span className="hud-status">[ {gameState.status} ]</span>
      </div>

      <div className="layout">
        {/* ── Play field ────────────────────────────────────────────────── */}
        <div className="game-area">
          <div
            ref={gridRef}
            style={{
              position: 'relative',
              height: gridHeightPx,
              border: '2px solid #475569',
              backgroundColor: '#fff',
              /* Notebook paper: horizontal rules + faint column guides */
              backgroundImage: [
                'repeating-linear-gradient(#e2e8f0 0px, #e2e8f0 1px, transparent 1px, transparent 80px)',
                'repeating-linear-gradient(90deg, #e2e8f0 0px, #e2e8f0 1px, transparent 1px, transparent 11.11%)',
              ].join(', '),
              cursor: selectedHero ? 'crosshair' : 'default',
              overflow: 'hidden',
            }}
          >

            {/* ── Area 5: lane threat tint ─────────────────────────────────
                Absolutely positioned siblings of grid rows — avoids touching
                grid layout; only opacity animates (composited). */}
            {rows.map(row =>
              hotLanes.has(row) ? (
                <div
                  key={`lane-hot-${row}`}
                  className="lane-hot-overlay"
                  style={{ top: row * ROW_HEIGHT_PX }}
                />
              ) : null,
            )}

            {/* ── Area 5: danger zone ──────────────────────────────────────
                Left-edge strip; opacity-only animation. */}
            <div
              className={`danger-zone${dangerActive ? ' danger-zone-active' : ''}`}
              style={{ width: dangerWidthPx }}
            />

            {/* ── Clickable cell grid ──────────────────────────────────────  */}
            {rows.map(row => (
              <div key={row} className="grid-row">
                {cols.map(col => {
                  const key        = `${row}_${col}`;
                  const placedHero = gameState.heroes.get(key);
                  return (
                    <div
                      key={col}
                      className="grid-cell"
                      onClick={() => handleCellClick(row, col)}
                    >
                      {placedHero && (
                        /* Area 4: hero-place-anim plays once on element mount */
                        <div className="hero-place-anim" style={{ textAlign: 'center', pointerEvents: 'none' }}>
                          <div style={{ fontSize: 20, lineHeight: 1 }}>
                            {HERO_BLUEPRINTS[placedHero.type].emoji}
                          </div>
                          {/* HP bar */}
                          <div style={{
                            width: 36, height: 4, background: '#e2e8f0',
                            borderRadius: 2, margin: '2px auto 0', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${(placedHero.hp / placedHero.maxHp) * 100}%`,
                              height: '100%',
                              background: placedHero.hp / placedHero.maxHp > 0.5 ? '#22c55e' : '#ef4444',
                              transition: 'width 0.1s linear',
                            }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ── Enemy overlays ────────────────────────────────────────────
                OUTER div: positioned at top-left, translated to entity coords.
                  • transition on `transform` only (composited)
                  • will-change: transform tells the compositor to promote
                INNER div (.enemy-inner): receives per-event CSS animation
                  classes without disturbing the outer positioning transform.
            */}
            {gameState.enemies.map(enemy => {
              const x    = toPx(enemy.x);
              const y    = toTopPx(enemy.y);
              const isHit = hitEnemyIds.has(enemy.id);

              return (
                <div
                  key={enemy.id}
                  className="entity-overlay"
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                >
                  {/* Area 4: spawn-enter plays once on mount (translateX, not fighting outer) */}
                  <div className={`enemy-inner spawn-enter`}>

                    {/* Area 4: hit flash — opacity overlay, not background-color anim */}
                    {isHit && <div className="hit-flash-overlay" />}

                    <div style={{ fontSize: 18, lineHeight: 1, textAlign: 'center' }}>
                      {ENEMY_BLUEPRINTS[enemy.type].emoji}
                    </div>

                    {/* HP bar */}
                    <div style={{
                      width: 32, height: 3, marginTop: 2,
                      background: '#fca5a5', borderRadius: 2, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${(enemy.hp / enemy.maxHp) * 100}%`,
                        height: '100%',
                        background: '#ef4444',
                        transition: 'width 0.08s linear',
                      }} />
                    </div>

                    {enemy.statusDebuff && (
                      <div style={{ fontSize: 8, color: '#7c3aed', textAlign: 'center' }}>
                        {enemy.statusDebuff}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ── Area 4: death burst rings ─────────────────────────────────
                Short-lived divs dropped at the enemy's last pixel position.
                Only transform (scale) + opacity animate — composited.
                `left`/`top` are static (not animated) so no reflow penalty. */}
            {deathBursts.map(burst => (
              <div
                key={burst.id}
                className="death-burst"
                style={{ left: burst.x, top: burst.y }}
                onAnimationEnd={() =>
                  setDeathBursts(prev => prev.filter(b => b.id !== burst.id))
                }
              />
            ))}

            {/* ── Area 3: canvas projectile layer ──────────────────────────
                Single <canvas> redrawn each RAF tick — replaces per-projectile
                DOM nodes entirely. DPR-aware; decoupled from game logic. */}
            <ProjectileCanvas
              projectiles={gameState.projectiles}
              width={gridWidth}
              height={gridHeightPx}
            />

            {/* ── Game over / victory screen ────────────────────────────── */}
            {(gameState.status === 'GAMEOVER' || gameState.status === 'VICTORY') && (
              <div className="game-overlay">
                <div>{gameState.status === 'VICTORY' ? '🎉 VICTORY' : '💀 GAME OVER'}</div>
                <div style={{ fontSize: 16 }}>Score: {gameState.score}</div>
                <button onClick={() => resetGame()}>Play Again</button>
              </div>
            )}
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 10, color: '#94a3b8', marginTop: 4,
          }}>
            <span>⬅ Enemies approach from right</span>
            <span>Notebook edge →</span>
          </div>
        </div>

        {/* ── Side panel ──────────────────────────────────────────────────── */}
        <SidePanel
          ink={gameState.ink}
          selectedHeroId={selectedHero}
          heroLevels={heroLevels}
          onSelectHero={setSelectedHero}
          onOpenUpgrade={() => setUpgradeOpen(true)}
        />
      </div>

      {/* ── Upgrade modal ──────────────────────────────────────────────────── */}
      {upgradeOpen && (
        <UpgradeModal
          ink={gameState.ink}
          heroLevels={heroLevels}
          onUpgrade={handleUpgrade}
          onClose={() => setUpgradeOpen(false)}
        />
      )}
    </div>
  );
};
