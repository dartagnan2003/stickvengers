/**
 * MazeCanvas — visual renderer for the v3.0 maze game.
 *
 * Layer order (z-index):
 *   1  — cell floors + walls
 *   2  — fog overlay (per cell)
 *   5  — PlacedSupply layer
 *   10 — enemy entities
 *   20 — player entity
 *   30 — UI controls (pause, ink button, D-pad)
 *   35 — InventoryBar
 *  999 — drag ghost (fixed, in document.body via InventoryBar)
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { GameState, FogState, Direction, EnemyType, ItemType } from '../types/state';
import type { SupplyType, SupplyTier } from '../types/supplies';
import { SUPPLY_STATS, canPlaceSupply } from '../engine/SupplySystem';
import { InventoryBar } from './InventoryBar';

// ─── Emoji maps ───────────────────────────────────────────────────────────────

const ENEMY_EMOJI: Record<EnemyType, string> = {
  PAPERCLIP:   '📎',
  STAPLER:     '🖇️',
  RED_TAPE:    '📋',
  SHREDDER:    '🗑️',
  RUBBER_BAND: '🔗',
};

const ITEM_EMOJI: Record<ItemType, string> = {
  INK_CHARGE: '🖊️',
  PRIZE:      '🏆',
  HEALTH:     '❤️‍🩹',
};

const ENEMY_ANIM: Record<EnemyType, string> = {
  PAPERCLIP:   'anim-enemy-paperclip',
  STAPLER:     'anim-enemy-stapler',
  RED_TAPE:    'anim-enemy-red-tape',
  SHREDDER:    'anim-enemy-shredder',
  RUBBER_BAND: 'anim-enemy-rubber-band',
};

const TIER_DOTS_COLOR: Record<SupplyTier, string> = {
  1: '#94a3b8',
  2: '#60a5fa',
  3: '#fbbf24',
};

// ─── Fog opacity ──────────────────────────────────────────────────────────────

const FOG_OPACITY: Record<FogState, number> = {
  dark:     0.93,
  explored: 0.56,
  lit:      0,
};

// ─── Cell backgrounds ─────────────────────────────────────────────────────────

function cellBg(isExit: boolean, isStart: boolean, isShop: boolean, isBase: boolean): string {
  if (isBase)  return '#1a0505';  // deep red — ATTACK enemy base / DEFEND player base
  if (isExit)  return '#052e16';
  if (isShop)  return '#0c1a2e';  // subtle blue for shop
  if (isStart) return '#172554';
  return '#1e293b';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  state:          GameState;
  onMove:         (dir: Direction) => void;
  onUseInk:       () => void;
  onPause:        () => void;
  onPlaceSupply:  (type: SupplyType, tier: SupplyTier, row: number, col: number) => void;
  dragContextRef: React.MutableRefObject<{ type: SupplyType; tier: SupplyTier } | null>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MazeCanvas: React.FC<Props> = ({
  state, onMove, onUseInk, onPause, onPlaceSupply, dragContextRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(44);
  const [hoveredDrop, setHoveredDrop] = useState<{ r: number; c: number; valid: boolean } | null>(null);

  const { maze, enemies } = state;
  const player = state.players['p1'];

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Account for InventoryBar height (72px) when computing available height
    const INVENTORY_H = 72;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const cw = Math.floor(width  / maze.cols);
      const ch = Math.floor((height - INVENTORY_H) / maze.rows);
      setCellPx(Math.max(28, Math.min(cw, ch)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maze.rows, maze.cols]);

  // ── Listen for supply-drop custom events from InventoryBar mobile drag ───
  useEffect(() => {
    const handler = (e: Event) => {
      const { type, tier, row, col } = (e as CustomEvent).detail as {
        type: SupplyType; tier: SupplyTier; row: number; col: number;
      };
      onPlaceSupply(type, tier, row, col);
    };
    const el = containerRef.current;
    el?.addEventListener('supply-drop', handler);
    return () => el?.removeEventListener('supply-drop', handler);
  }, [onPlaceSupply]);

  // ── Touch swipe (suppressed during drag) ─────────────────────────────────
  const swipeStart = useRef<[number, number] | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('[data-row]')) return; // cell; let swipe handle
    swipeStart.current = [e.clientX, e.clientY];
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragContextRef.current) return; // dragging — suppress swipe
    if (!swipeStart.current) return;
    const [sx, sy] = swipeStart.current;
    swipeStart.current = null;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const THRESHOLD = 22;
    if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
    if (Math.abs(dx) >= Math.abs(dy)) {
      onMove(dx > 0 ? 'E' : 'W');
    } else {
      onMove(dy > 0 ? 'S' : 'N');
    }
  }, [dragContextRef, onMove]);

  const onPointerCancel = useCallback(() => { swipeStart.current = null; }, []);

  // ── Desktop drag-over (per-cell) ─────────────────────────────────────────
  const onCellDragEnter = useCallback((r: number, c: number) => {
    if (!dragContextRef.current) return;
    const { type, tier } = dragContextRef.current;
    const valid = canPlaceSupply(type, tier, r, c, state);
    setHoveredDrop({ r, c, valid });
  }, [dragContextRef, state]);

  const onCellDragLeave = useCallback(() => {
    setHoveredDrop(null);
  }, []);

  const onCellDrop = useCallback((e: React.DragEvent, r: number, c: number) => {
    e.preventDefault();
    setHoveredDrop(null);
    // Try HTML DnD data first, fallback to dragContextRef
    let type: SupplyType | null = null;
    let tier: SupplyTier | null = null;
    try {
      const raw = e.dataTransfer.getData('application/supply');
      if (raw) { const d = JSON.parse(raw); type = d.type; tier = d.tier; }
    } catch { /* ignore */ }
    if (!type || !tier) {
      if (dragContextRef.current) { type = dragContextRef.current.type; tier = dragContextRef.current.tier; }
    }
    if (type && tier) onPlaceSupply(type, tier, r, c);
    dragContextRef.current = null;
  }, [dragContextRef, onPlaceSupply]);

  // ── Derived sizes ─────────────────────────────────────────────────────────
  const gridW  = cellPx * maze.cols;
  const gridH  = cellPx * maze.rows;
  const iconSz = Math.max(14, Math.round(cellPx * 0.52));
  const fontSize = `${iconSz}px`;

  const isOver   = state.phase === 'GAMEOVER' || state.phase === 'VICTORY';
  const isPaused = state.phase === 'PAUSED';
  const inkCharges = player?.inkCharges ?? 0;
  const inkActive  = player?.inkActive  ?? false;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        position: 'relative', flex: 1, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // shift grid up by half the inventory bar height so it centres in the playable area
        paddingBottom: 72,
        background: '#0f172a', userSelect: 'none', touchAction: 'none',
      }}
    >

      {/* ── Maze grid ────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', width: gridW, height: gridH, flexShrink: 0 }}>

        {/* ─ Cell layer ─ */}
        {maze.cells.map((rowArr, r) =>
          rowArr.map((cell, c) => {
            const fog      = player?.fogMap?.[r]?.[c] ?? 'dark';
            const isLit    = fog === 'lit';
            const showCont = isLit || fog === 'explored';
            const isDrop   = hoveredDrop?.r === r && hoveredDrop?.c === c;

            return (
              <div
                key={`${r}-${c}`}
                data-row={r}
                data-col={c}
                onDragOver={e => { e.preventDefault(); onCellDragEnter(r, c); }}
                onDragEnter={() => onCellDragEnter(r, c)}
                onDragLeave={onCellDragLeave}
                onDrop={e => onCellDrop(e, r, c)}
                style={{
                  position: 'absolute',
                  top:    r * cellPx,
                  left:   c * cellPx,
                  width:  cellPx,
                  height: cellPx,
                  background: cellBg(cell.isExit, cell.isStart, !!cell.isShop, !!cell.isBase),
                  borderTop:    cell.walls.N ? (cell.permWall ? '2px solid #7f1d1d' : '2px solid #475569')
                                             : '1px solid rgba(71,85,105,0.12)',
                  borderRight:  cell.walls.E ? (cell.permWall ? '2px solid #7f1d1d' : '2px solid #475569')
                                             : '1px solid rgba(71,85,105,0.12)',
                  borderBottom: cell.walls.S ? (cell.permWall ? '2px solid #7f1d1d' : '2px solid #475569')
                                             : '1px solid rgba(71,85,105,0.12)',
                  borderLeft:   cell.walls.W ? (cell.permWall ? '2px solid #7f1d1d' : '2px solid #475569')
                                             : '1px solid rgba(71,85,105,0.12)',
                  // Drop target highlight
                  outline: isDrop
                    ? `2px solid ${hoveredDrop?.valid ? '#22c55e' : '#ef4444'}`
                    : 'none',
                  outlineOffset: '-2px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', fontSize,
                }}
              >
                {/* Special cell icons (below fog) */}
                {cell.isExit  && showCont && <span style={{ opacity: isLit ? 1 : 0.4, lineHeight: 1 }}>🚪</span>}
                {cell.isShop  && showCont && <span style={{ opacity: isLit ? 1 : 0.5, lineHeight: 1 }}>🏪</span>}
                {cell.isBase  && showCont && (
                  <span style={{ opacity: isLit ? 1 : 0.4, lineHeight: 1 }}>
                    {state.gameFormat === 'DEFEND' ? '🛡️' : '🏰'}
                  </span>
                )}
                {cell.isStart && showCont && !cell.isExit && !cell.isShop && !cell.isBase && (
                  <span style={{
                    opacity: isLit ? 0.55 : 0.2,
                    fontSize: Math.max(10, iconSz * 0.65),
                    lineHeight: 1,
                  }}>★</span>
                )}
                {/* Item */}
                {cell.item && isLit && (
                  <span style={{ lineHeight: 1 }}>{ITEM_EMOJI[cell.item]}</span>
                )}
                {cell.item && !isLit && fog === 'explored' && (
                  <span style={{ opacity: 0.3, fontSize: Math.max(10, iconSz * 0.7), lineHeight: 1 }}>❓</span>
                )}

                {/* Fog overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: '#0f172a',
                  opacity:    FOG_OPACITY[fog],
                  transition: 'opacity 0.3s ease',
                  pointerEvents: 'none', zIndex: 2,
                }} />
              </div>
            );
          })
        )}

        {/* ─ PlacedSupply layer (z-index 5) ─ */}
        {state.placedSupplies.map(ps => {
          const fog = player?.fogMap?.[ps.row]?.[ps.col] ?? 'dark';
          if (fog === 'dark') return null;
          return (
            <div
              key={ps.id}
              style={{
                position:  'absolute',
                transform: `translate(${ps.col * cellPx}px, ${ps.row * cellPx}px)`,
                width:     cellPx,
                height:    cellPx,
                display:   'flex', alignItems: 'center', justifyContent: 'center',
                fontSize,
                zIndex:    5,
                pointerEvents: 'none',
                opacity:   fog === 'explored' ? 0.5 : 1,
              }}
            >
              <span style={{ lineHeight: 1 }}>{SUPPLY_STATS[ps.type].emoji}</span>
              {/* Tier dots */}
              <span style={{
                position: 'absolute', top: 2, right: 2,
                fontSize: 7, lineHeight: 1,
                color: TIER_DOTS_COLOR[ps.tier],
                letterSpacing: -1,
              }}>
                {'●'.repeat(ps.tier)}
              </span>
              {/* Reloading indicator for T3 STICKY_NOTE */}
              {ps.turnsLeft !== undefined && ps.turnsLeft > 0 && ps.effect === 'TRAP' && (
                <span style={{
                  position: 'absolute', bottom: 2, left: 2,
                  fontSize: 7, color: '#f59e0b',
                }}>↺</span>
              )}
            </div>
          );
        })}

        {/* ─ Enemy layer ─ */}
        {enemies.map(enemy => {
          const fog = player?.fogMap?.[enemy.row]?.[enemy.col] ?? 'dark';
          if (fog !== 'lit') return null;
          return (
            <div
              key={enemy.id}
              style={{
                position:  'absolute',
                transform: `translate(${enemy.col * cellPx}px, ${enemy.row * cellPx}px)`,
                width:     cellPx,
                height:    cellPx,
                display:   'flex', alignItems: 'center', justifyContent: 'center',
                fontSize,
                zIndex:    10,
                pointerEvents: 'none',
                transition: 'transform 0.12s ease-out',
              }}
            >
              <span className={ENEMY_ANIM[enemy.type]} style={{ lineHeight: 1 }}>
                {ENEMY_EMOJI[enemy.type]}
              </span>
            </div>
          );
        })}

        {/* ─ Player layer ─ */}
        {player?.isAlive && (
          <div
            style={{
              position:  'absolute',
              transform: `translate(${player.col * cellPx}px, ${player.row * cellPx}px)`,
              width:     cellPx,
              height:    cellPx,
              display:   'flex', alignItems: 'center', justifyContent: 'center',
              fontSize:  `${Math.max(16, Math.round(cellPx * 0.6))}px`,
              zIndex:    20,
              pointerEvents: 'none',
              transition: 'transform 0.1s ease-out',
            }}
          >
            <span
              className={inkActive ? 'anim-player-ink' : 'anim-player-idle'}
              style={{ lineHeight: 1 }}
            >
              🦸
            </span>
          </div>
        )}
      </div>

      {/* ── End-state overlays ───────────────────────────────────────────── */}
      {isOver && (
        <div style={{
          position: 'absolute', inset: 0,
          background: state.phase === 'VICTORY'
            ? 'rgba(5,46,22,0.88)' : 'rgba(69,10,10,0.88)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          color: '#fff', fontFamily: "'Courier New', monospace",
          fontWeight: 'bold', zIndex: 50, paddingBottom: 80,
        }}>
          <div style={{ fontSize: 52 }}>
            {state.phase === 'VICTORY' ? '🎉' : '💀'}
          </div>
          <div style={{ fontSize: 22 }}>
            {state.message ?? (state.phase === 'VICTORY' ? 'Victory!' : 'Defeated!')}
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8' }}>
            Score: {player?.score ?? 0}  ·  ⚡ {player?.energy ?? 0}
          </div>
        </div>
      )}

      {isPaused && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,23,42,0.82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 26,
          fontFamily: "'Courier New', monospace", fontWeight: 'bold',
          zIndex: 50, paddingBottom: 80,
        }}>
          ⏸ PAUSED
        </div>
      )}

      {/* ── Message banner ───────────────────────────────────────────────── */}
      {state.message && !isOver && !isPaused && (
        <div style={{
          position: 'absolute', top: 8, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.85)',
          color: '#7dd3fc', padding: '4px 14px', borderRadius: 20,
          fontSize: 13, fontWeight: 'bold',
          fontFamily: "'Courier New', monospace",
          pointerEvents: 'none', zIndex: 30, whiteSpace: 'nowrap',
        }}>
          {state.message}
        </div>
      )}

      {/* ── Pause button (top-right) ─────────────────────────────────────── */}
      <button
        onClick={onPause}
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 36, height: 36, borderRadius: 8,
          background: 'rgba(51,65,85,0.8)', border: 'none',
          color: '#cbd5e1', fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 30, WebkitTapHighlightColor: 'transparent',
        }}
        title="Pause (ESC)"
      >
        ⏸
      </button>

      {/* ── Ink button (bottom-left, above InventoryBar) ─────────────────── */}
      <button
        onPointerDown={e => { e.stopPropagation(); onUseInk(); }}
        disabled={inkCharges === 0 && !inkActive}
        style={{
          position: 'absolute', bottom: 82, left: 14,
          width: 52, height: 52, borderRadius: 12,
          background: inkActive ? '#0369a1' : inkCharges > 0 ? '#0284c7' : '#334155',
          border: 'none', color: '#fff',
          fontSize: 20, cursor: 'pointer',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 1,
          zIndex: 30, WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
          opacity: inkCharges === 0 && !inkActive ? 0.45 : 1,
          transition: 'background 0.2s, opacity 0.2s',
        }}
        title="Disappearing Ink (SPACE / I)"
      >
        🖊️
        <span style={{ fontSize: 9, lineHeight: 1, color: '#bae6fd' }}>
          {inkActive ? 'ACTIVE' : `×${inkCharges}`}
        </span>
      </button>

      {/* ── D-pad (bottom-right, above InventoryBar) ─────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 82, right: 10,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 42px)',
        gridTemplateRows:    'repeat(3, 42px)',
        gap: 3, zIndex: 30,
      }}>
        <span />
        <DPadBtn label="↑" onPress={() => onMove('N')} />
        <span />
        <DPadBtn label="←" onPress={() => onMove('W')} />
        <div style={{
          width: 42, height: 42, borderRadius: 8,
          background: 'rgba(51,65,85,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#475569', fontSize: 10,
        }}>•</div>
        <DPadBtn label="→" onPress={() => onMove('E')} />
        <span />
        <DPadBtn label="↓" onPress={() => onMove('S')} />
        <span />
      </div>

      {/* ── Pending portal indicator ─────────────────────────────────────── */}
      {state.pendingPortal && (
        <div style={{
          position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)',
          background: '#0369a1', color: '#fff', padding: '3px 12px',
          borderRadius: 14, fontSize: 11, fontWeight: 'bold', zIndex: 30,
          fontFamily: "'Courier New', monospace",
        }}>
          🖊️ Ink Blot placed — place second portal to link!
        </div>
      )}

      {/* ── InventoryBar ─────────────────────────────────────────────────── */}
      <InventoryBar
        inventory={player?.inventory ?? []}
        dragContextRef={dragContextRef}
      />
    </div>
  );
};

// ─── D-pad button ─────────────────────────────────────────────────────────────

const DPadBtn: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <button
    onPointerDown={e => { e.stopPropagation(); onPress(); }}
    style={{
      width: 42, height: 42, borderRadius: 8,
      background: 'rgba(51,65,85,0.85)', border: 'none',
      color: '#e2e8f0', fontSize: 20, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitTapHighlightColor: 'transparent',
      touchAction: 'manipulation',
    }}
  >
    {label}
  </button>
);
