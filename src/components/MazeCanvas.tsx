/**
 * MazeCanvas — visual renderer for the v2.0 maze game.
 *
 * Layout strategy:
 *   • A ResizeObserver measures the available container space each frame.
 *   • cellPx = floor( min(containerW/cols, containerH/rows) ) — largest square
 *     cells that fit without scrolling.
 *   • Cells are absolutely positioned at (col*cellPx, row*cellPx) — no CSS
 *     grid, no flexbox reflow, sub-pixel-safe on iOS.
 *   • Entities (player, enemies) float in their own layer above cells so their
 *     CSS transition:transform animates independently from fog changes.
 *   • All transforms use translate(x,y) — GPU-composited on WKWebView/Android.
 *   • Touch swipe detection + D-pad overlay for mobile play.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { GameState, FogState, Direction, EnemyType, ItemType } from '../types/state';

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

// Map EnemyType → animation class (must match src/styles.css)
const ENEMY_ANIM: Record<EnemyType, string> = {
  PAPERCLIP:   'anim-enemy-paperclip',
  STAPLER:     'anim-enemy-stapler',
  RED_TAPE:    'anim-enemy-red-tape',
  SHREDDER:    'anim-enemy-shredder',
  RUBBER_BAND: 'anim-enemy-rubber-band',
};

// ─── Fog opacity ──────────────────────────────────────────────────────────────

const FOG_OPACITY: Record<FogState, number> = {
  dark:     0.93,
  explored: 0.56,
  lit:      0,
};

// ─── Cell colours ─────────────────────────────────────────────────────────────

function cellBg(isExit: boolean, isStart: boolean): string {
  if (isExit)  return '#052e16'; // deep green
  if (isStart) return '#172554'; // deep blue
  return '#1e293b';              // dark slate
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  state:     GameState;
  onMove:    (dir: Direction) => void;
  onUseInk: () => void;
  onPause:  () => void;
}

export const MazeCanvas: React.FC<Props> = ({ state, onMove, onUseInk, onPause }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx]   = useState(44);

  const { maze, enemies } = state;
  const player = state.players['p1'];

  // ── Resize — recompute cell size whenever container changes ──────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const cw = Math.floor(width  / maze.cols);
      const ch = Math.floor(height / maze.rows);
      setCellPx(Math.max(28, Math.min(cw, ch)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maze.rows, maze.cols]);

  // ── Touch swipe ──────────────────────────────────────────────────────────
  const swipeStart = useRef<[number, number] | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore if target is a button (D-pad / ink)
    if ((e.target as HTMLElement).closest('button')) return;
    swipeStart.current = [e.clientX, e.clientY];
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
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
  }, [onMove]);

  const onPointerCancel = useCallback(() => { swipeStart.current = null; }, []);

  // ── Derived sizing ────────────────────────────────────────────────────────
  const gridW = cellPx * maze.cols;
  const gridH = cellPx * maze.rows;
  const iconSz = Math.max(14, Math.round(cellPx * 0.52));
  const fontSize = `${iconSz}px`;

  const isOver    = state.phase === 'GAMEOVER' || state.phase === 'VICTORY';
  const isPaused  = state.phase === 'PAUSED';
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
        background: '#0f172a', userSelect: 'none', touchAction: 'none',
      }}
    >

      {/* ── Maze grid ────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', width: gridW, height: gridH, flexShrink: 0 }}>

        {/* ─ Cell layer ─ */}
        {maze.cells.map((rowArr, r) =>
          rowArr.map((cell, c) => {
            const fog = player?.fogMap?.[r]?.[c] ?? 'dark';
            const isLit      = fog === 'lit';
            const isExplored = fog === 'explored';
            const showContent = isLit || isExplored;

            return (
              <div
                key={`${r}-${c}`}
                style={{
                  position:  'absolute',
                  top:       r * cellPx,
                  left:      c * cellPx,
                  width:     cellPx,
                  height:    cellPx,
                  background: cellBg(cell.isExit, cell.isStart),
                  // Walls — each side independently
                  borderTop:    cell.walls.N ? '2px solid #475569' : '1px solid rgba(71,85,105,0.12)',
                  borderRight:  cell.walls.E ? '2px solid #475569' : '1px solid rgba(71,85,105,0.12)',
                  borderBottom: cell.walls.S ? '2px solid #475569' : '1px solid rgba(71,85,105,0.12)',
                  borderLeft:   cell.walls.W ? '2px solid #475569' : '1px solid rgba(71,85,105,0.12)',
                  display:  'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                  fontSize,
                }}
              >
                {/* Exit marker */}
                {cell.isExit && showContent && (
                  <span style={{ opacity: isLit ? 1 : 0.45, lineHeight: 1 }}>🚪</span>
                )}
                {/* Start marker (shown when explored/lit) */}
                {cell.isStart && showContent && !cell.isExit && (
                  <span style={{ opacity: isLit ? 0.6 : 0.25, fontSize: Math.max(10, iconSz * 0.7), lineHeight: 1 }}>★</span>
                )}
                {/* Item — show emoji when lit, '?' shadow when explored */}
                {cell.item && isLit && (
                  <span style={{ lineHeight: 1 }}>{ITEM_EMOJI[cell.item]}</span>
                )}
                {cell.item && isExplored && !isLit && (
                  <span style={{ opacity: 0.3, fontSize: Math.max(10, iconSz * 0.7), lineHeight: 1 }}>❓</span>
                )}

                {/* Fog overlay — absolutely fills the cell, transitions on opacity */}
                <div style={{
                  position:   'absolute',
                  inset:      0,
                  background: '#0f172a',
                  opacity:    FOG_OPACITY[fog],
                  transition: 'opacity 0.3s ease',
                  pointerEvents: 'none',
                  zIndex: 2,
                }} />
              </div>
            );
          })
        )}

        {/* ─ Enemy layer (only render when cell is lit) ─ */}
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
                zIndex: 10,
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
            ? 'rgba(5,46,22,0.88)'
            : 'rgba(69,10,10,0.88)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          color: '#fff', fontFamily: "'Courier New', monospace",
          fontWeight: 'bold', zIndex: 50,
        }}>
          <div style={{ fontSize: 52 }}>
            {state.phase === 'VICTORY' ? '🎉' : '💀'}
          </div>
          <div style={{ fontSize: 22 }}>
            {state.message ?? (state.phase === 'VICTORY' ? 'You escaped!' : 'You were caught.')}
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8' }}>
            Score: {player?.score ?? 0}
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
          zIndex: 50,
        }}>
          ⏸ PAUSED
        </div>
      )}

      {/* ── Message banner (wave announcements, hints) ───────────────────── */}
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

      {/* ── Ink button (bottom-left) ─────────────────────────────────────── */}
      <button
        onPointerDown={e => { e.stopPropagation(); onUseInk(); }}
        disabled={inkCharges === 0 && !inkActive}
        style={{
          position: 'absolute', bottom: 14, left: 14,
          width: 56, height: 56, borderRadius: 12,
          background: inkActive
            ? '#0369a1'
            : inkCharges > 0 ? '#0284c7' : '#334155',
          border: 'none', color: '#fff',
          fontSize: 22, cursor: 'pointer',
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
        <span style={{ fontSize: 10, lineHeight: 1, color: '#bae6fd' }}>
          {inkActive ? 'ACTIVE' : `×${inkCharges}`}
        </span>
      </button>

      {/* ── D-pad (bottom-right) ─────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 10, right: 10,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 44px)',
        gridTemplateRows:    'repeat(3, 44px)',
        gap: 3, zIndex: 30,
      }}>
        {/* Row 1: blank, N, blank */}
        <span />
        <DPadBtn label="↑" onPress={() => onMove('N')} />
        <span />
        {/* Row 2: W, center dot, E */}
        <DPadBtn label="←" onPress={() => onMove('W')} />
        <div style={{
          width: 44, height: 44, borderRadius: 8,
          background: 'rgba(51,65,85,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#475569', fontSize: 10,
        }}>•</div>
        <DPadBtn label="→" onPress={() => onMove('E')} />
        {/* Row 3: blank, S, blank */}
        <span />
        <DPadBtn label="↓" onPress={() => onMove('S')} />
        <span />
      </div>
    </div>
  );
};

// ─── D-pad button ─────────────────────────────────────────────────────────────

const DPadBtn: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <button
    onPointerDown={e => { e.stopPropagation(); onPress(); }}
    style={{
      width: 44, height: 44, borderRadius: 8,
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
