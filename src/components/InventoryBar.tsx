/**
 * InventoryBar — horizontal supply inventory strip with drag-and-drop.
 *
 * Desktop: HTML Drag and Drop API.
 * Mobile:  Pointer Events — long-press → drag ghost → drop on cell.
 *
 * The parent (App) holds `dragContextRef` and passes it down to both
 * InventoryBar (sets it on drag start) and MazeCanvas (reads it on drop).
 */

import React, { useRef, useCallback } from 'react';
import type { InventorySupply, SupplyType, SupplyTier } from '../types/supplies';
import { SUPPLY_STATS } from '../engine/SupplySystem';

// ─── Tier colors ──────────────────────────────────────────────────────────────

const TIER_COLOR: Record<SupplyTier, string> = {
  1: '#94a3b8',  // slate-400
  2: '#60a5fa',  // blue-400
  3: '#fbbf24',  // amber-400
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  inventory:      InventorySupply[];
  dragContextRef: React.MutableRefObject<{ type: SupplyType; tier: SupplyTier } | null>;
  /** Called when drag ends over a valid cell (the cell dispatches PLACE_SUPPLY via its own handlers). */
  onDragStateChange?: (dragging: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InventoryBar: React.FC<Props> = ({ inventory, dragContextRef, onDragStateChange }) => {
  const ghostRef = useRef<HTMLDivElement | null>(null);

  // ── Create / move / destroy ghost (mobile pointer-drag) ─────────────────
  const createGhost = useCallback((emoji: string, x: number, y: number) => {
    const ghost = document.createElement('div');
    ghost.id = 'supply-drag-ghost';
    ghost.textContent = emoji;
    ghost.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:9999',
      'font-size:28px',
      'line-height:1',
      'transform:translate(-50%,-50%)',
      `left:${x}px`,
      `top:${y}px`,
      'background:rgba(51,65,85,0.9)',
      'border-radius:8px',
      'padding:6px',
      'border:2px solid #0284c7',
    ].join(';');
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
  }, []);

  const moveGhost = useCallback((x: number, y: number) => {
    if (ghostRef.current) {
      ghostRef.current.style.left = `${x}px`;
      ghostRef.current.style.top  = `${y}px`;
    }
  }, []);

  const destroyGhost = useCallback(() => {
    ghostRef.current?.remove();
    ghostRef.current = null;
  }, []);

  // ── Mobile pointer handlers ───────────────────────────────────────────────
  const onPointerDown = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    item: InventorySupply,
  ) => {
    if (e.button !== 0) return; // left / touch only
    e.stopPropagation();
    dragContextRef.current = { type: item.type, tier: item.tier };
    createGhost(SUPPLY_STATS[item.type].emoji, e.clientX, e.clientY);
    onDragStateChange?.(true);
  }, [dragContextRef, createGhost, onDragStateChange]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragContextRef.current) return;
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
  }, [dragContextRef, moveGhost]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragContextRef.current) return;
    destroyGhost();
    onDragStateChange?.(false);

    // Find the maze cell under the pointer
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest('[data-row]') as HTMLElement | null;
    if (cell) {
      const row = parseInt(cell.dataset['row'] ?? '', 10);
      const col = parseInt(cell.dataset['col'] ?? '', 10);
      if (!isNaN(row) && !isNaN(col)) {
        // Dispatch via custom event so MazeCanvas can react without prop drilling
        cell.dispatchEvent(new CustomEvent('supply-drop', {
          bubbles: true,
          detail: { ...dragContextRef.current, row, col },
        }));
      }
    }

    dragContextRef.current = null;
  }, [dragContextRef, destroyGhost, onDragStateChange]);

  const onPointerCancel = useCallback(() => {
    if (!dragContextRef.current) return;
    destroyGhost();
    dragContextRef.current = null;
    onDragStateChange?.(false);
  }, [dragContextRef, destroyGhost, onDragStateChange]);

  // ── Desktop HTML DnD handlers ─────────────────────────────────────────────
  const onDragStart = useCallback((
    e: React.DragEvent<HTMLDivElement>,
    item: InventorySupply,
  ) => {
    e.dataTransfer.setData('application/supply', JSON.stringify({ type: item.type, tier: item.tier }));
    dragContextRef.current = { type: item.type, tier: item.tier };
    onDragStateChange?.(true);
  }, [dragContextRef, onDragStateChange]);

  const onDragEnd = useCallback(() => {
    dragContextRef.current = null;
    onDragStateChange?.(false);
  }, [dragContextRef, onDragStateChange]);

  if (inventory.length === 0) {
    return (
      <div style={barStyle}>
        <span style={{ color: '#475569', fontSize: 11, margin: 'auto' }}>
          No supplies — defeat enemies to collect!
        </span>
      </div>
    );
  }

  return (
    <div
      style={barStyle}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {inventory.map((item, idx) => {
        const stats = SUPPLY_STATS[item.type];
        return (
          <div
            key={`${item.type}-${item.tier}-${idx}`}
            title={`${stats.displayName} T${item.tier} — drag onto map to place`}
            draggable
            onDragStart={e => onDragStart(e, item)}
            onDragEnd={onDragEnd}
            onPointerDown={e => onPointerDown(e, item)}
            style={slotStyle}
          >
            {/* Emoji */}
            <span style={{ fontSize: 22, lineHeight: 1 }}>{stats.emoji}</span>
            {/* Count badge */}
            <div style={{
              position: 'absolute', bottom: 2, right: 2,
              background: '#0f172a', borderRadius: 4,
              fontSize: 9, color: '#e2e8f0', padding: '1px 3px',
              lineHeight: 1, fontWeight: 'bold',
            }}>
              ×{item.count}
            </div>
            {/* Tier dots */}
            <div style={{
              position: 'absolute', top: 2, left: 2,
              display: 'flex', gap: 2,
            }}>
              {Array.from({ length: item.tier }, (_, i) => (
                <span key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: TIER_COLOR[item.tier],
                  display: 'inline-block',
                }} />
              ))}
            </div>
            {/* Name (tiny, below emoji) */}
            <span style={{
              fontSize: 8, color: '#94a3b8', lineHeight: 1,
              maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', textAlign: 'center',
            }}>
              {stats.displayName}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const barStyle: React.CSSProperties = {
  position:        'absolute',
  bottom:          0,
  left:            0,
  right:           0,
  height:          72,
  background:      'rgba(15,23,42,0.92)',
  borderTop:       '1px solid #334155',
  display:         'flex',
  alignItems:      'center',
  gap:             6,
  paddingLeft:     8,
  paddingRight:    8,
  overflowX:       'auto',
  overflowY:       'hidden',
  zIndex:          35,
  scrollbarWidth:  'none',
  touchAction:     'pan-x',
};

const slotStyle: React.CSSProperties = {
  position:       'relative',
  width:          56,
  height:         56,
  flexShrink:     0,
  borderRadius:   10,
  background:     '#1e293b',
  border:         '1px solid #334155',
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  gap:            2,
  cursor:         'grab',
  WebkitTapHighlightColor: 'transparent',
  touchAction:    'none',
  userSelect:     'none',
};
