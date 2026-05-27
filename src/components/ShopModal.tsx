/**
 * ShopModal — buy and upgrade supplies at a shop node.
 *
 * Displayed when `state.shopOpen === true` and the player is on a shop cell.
 * Rendered at App level (above MazeCanvas) so z-index is unambiguous.
 */

import React from 'react';
import type { ShopNode, SupplyType, SupplyTier } from '../types/supplies';
import { SUPPLY_STATS } from '../engine/SupplySystem';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  shopNode:     ShopNode;
  playerEnergy: number;
  onBuy:        (type: SupplyType, tier: SupplyTier) => void;
  onClose:      () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ShopModal: React.FC<Props> = ({ shopNode, playerEnergy, onBuy, onClose }) => {
  const isEmpty = shopNode.stock.length === 0;

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(2,6,23,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
      }}
    >
      {/* Card — stop propagation so clicking inside doesn't close */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '90%', maxWidth: 460,
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 16, padding: 20,
          display: 'flex', flexDirection: 'column', gap: 14,
          fontFamily: "'Courier New', monospace",
          maxHeight: '80vh', overflow: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🏪</span>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 'bold', fontSize: 16 }}>
                Supply Shop
              </div>
              <div style={{ color: '#64748b', fontSize: 11 }}>
                Drag purchased supplies onto the map
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#4ade80', fontSize: 14, fontWeight: 'bold' }}>
              ⚡ {playerEnergy}
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: '#94a3b8',
                fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
              }}
              title="Close shop"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: '#1e293b' }} />

        {isEmpty ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '20px 0', fontSize: 14 }}>
            This shop is sold out. Come back after defeating more enemies.
          </div>
        ) : (
          <>
            <div style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 1 }}>
              AVAILABLE SUPPLIES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shopNode.stock.map((item, i) => {
                const stats     = SUPPLY_STATS[item.type];
                const tierStats = stats.tiers[item.tier];
                const canAfford = playerEnergy >= tierStats.energyCost;
                const tierLabel = item.tier === 1 ? 'Basic'
                                : item.tier === 2 ? 'Upgraded'
                                : 'Elite';
                const tierColor = item.tier === 1 ? '#94a3b8'
                                : item.tier === 2 ? '#60a5fa'
                                : '#fbbf24';

                return (
                  <div
                    key={`${item.type}-${item.tier}-${i}`}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      gap:            12,
                      padding:        '10px 12px',
                      background:     '#1e293b',
                      borderRadius:   10,
                      border:         `1px solid ${canAfford ? '#334155' : '#1e293b'}`,
                      opacity:        canAfford ? 1 : 0.55,
                    }}
                  >
                    {/* Emoji */}
                    <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>
                      {stats.emoji}
                    </span>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#f1f5f9', fontWeight: 'bold', fontSize: 13 }}>
                          {stats.displayName}
                        </span>
                        <span style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 4,
                          background: tierColor + '22', color: tierColor,
                          fontWeight: 'bold', letterSpacing: 0.5,
                        }}>
                          {tierLabel.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                        {buildEffectDesc(item.type, item.tier)}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 1 }}>
                        In stock: {item.count}
                      </div>
                    </div>

                    {/* Cost + Buy */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{
                        color: canAfford ? '#4ade80' : '#ef4444',
                        fontWeight: 'bold', fontSize: 13,
                      }}>
                        ⚡ {tierStats.energyCost}
                      </span>
                      <button
                        disabled={!canAfford}
                        onClick={() => onBuy(item.type, item.tier)}
                        style={{
                          padding:      '5px 14px',
                          borderRadius: 6,
                          background:   canAfford ? '#0284c7' : '#334155',
                          border:       'none',
                          color:        '#fff',
                          fontSize:     12,
                          cursor:       canAfford ? 'pointer' : 'not-allowed',
                          fontFamily:   "'Courier New', monospace",
                          fontWeight:   'bold',
                        }}
                      >
                        BUY
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ color: '#334155', fontSize: 10, textAlign: 'center' }}>
          ESC or tap outside to close
        </div>
      </div>
    </div>
  );
};

// ─── Effect descriptions ──────────────────────────────────────────────────────

function buildEffectDesc(type: SupplyType, tier: SupplyTier): string {
  const t = SUPPLY_STATS[type].tiers[tier];
  switch (type) {
    case 'PAPERCLIP':   return `Builds a ${t.chainLength ?? 1}-cell wall`;
    case 'STAPLER':     return tier >= 2 ? 'Removes 2 adjacent walls' : 'Removes a wall segment';
    case 'RED_TAPE':    return `${tier >= 2 ? tier >= 3 ? '3× + dmg' : '3×' : '2×'} movement cost zone`;
    case 'RUBBER_BAND': return `Launches you ${t.launchDist ?? 2} cells forward`;
    case 'INK_BLOT':    return tier >= 2 ? 'Two-way teleport + reveals destination' : 'Two-way teleport portal pair';
    case 'HIGHLIGHTER': return `Reveals r=${t.revealRadius} cells for ${t.revealDuration === -1 ? '∞' : t.revealDuration + 's'}`;
    case 'WHITEOUT':    return tier >= 3 ? 'Removes supply + full energy refund' : tier >= 2 ? 'Removes supply + ½ refund' : 'Removes any placed supply';
    case 'SHARPIE':     return `Permanent wall${tier >= 3 ? ' (Whiteout-immune)' : ''}`;
    case 'STICKY_NOTE': return `Trap: ${t.damage ?? 3} dmg${tier >= 2 ? ' + slow' : ''}${tier >= 3 ? ' + respawns' : ''}`;
    case 'CRAYON':      return tier >= 3 ? 'Glowing trail + fog reveal' : 'Breadcrumb trail marker';
    case 'ERASER':      return tier >= 2 ? 'Removes 2 walls' : 'Removes a wall from adjacent cell';
    default:            return '';
  }
}
