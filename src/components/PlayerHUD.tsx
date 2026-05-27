import React from 'react';
import type { PlayerState, TurnOrder } from '../types/state';
import type { GameFormat } from '../types/supplies';

// ─── Format labels ────────────────────────────────────────────────────────────

const FORMAT_LABEL: Record<GameFormat, string> = {
  JOURNEY: 'JOURNEY',
  ATTACK:  'ATTACK',
  DEFEND:  'DEFEND',
};

const FORMAT_EMOJI: Record<GameFormat, string> = {
  JOURNEY: '🚪',
  ATTACK:  '⚔️',
  DEFEND:  '🛡️',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  player:      PlayerState | undefined;
  gameFormat:  GameFormat;
  turnOrder:   TurnOrder;
  waveNumber:  number;
  nextWaveIn:  number;
  message?:    string;
  inkActive:   boolean;
  inkTimer:    number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PlayerHUD: React.FC<Props> = ({
  player, gameFormat, turnOrder, waveNumber, nextWaveIn, message, inkActive, inkTimer,
}) => {
  if (!player) return null;

  const hpPct      = (player.hp / player.maxHp) * 100;
  const hpColor    = hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#f59e0b' : '#ef4444';
  const inkPct     = inkActive ? (inkTimer / 4.5) * 100 : 0;
  const energyPct  = (player.energy / player.maxEnergy) * 100;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
      padding: '6px 10px',
      background: '#1e293b',
      borderBottom: '1px solid #334155',
      borderRadius: 4,
      marginBottom: 4,
      fontSize: 12,
      fontFamily: "'Courier New', monospace",
      fontWeight: 'bold',
    }}>
      {/* HP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: '#ef4444' }}>❤️</span>
        <div style={{ width: 52, height: 7, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, transition: 'width 0.2s ease' }} />
        </div>
        <span style={{ color: '#cbd5e1', fontSize: 10 }}>{player.hp}/{player.maxHp}</span>
      </div>

      {/* Energy */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: '#4ade80', fontSize: 13 }}>⚡</span>
        <div style={{ width: 52, height: 7, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${energyPct}%`, height: '100%',
            background: '#4ade80',
            transition: 'width 0.2s ease',
          }} />
        </div>
        <span style={{ color: '#4ade80', fontSize: 10 }}>{player.energy}/{player.maxEnergy}</span>
      </div>

      {/* Ink charges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>🖊️</span>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: i < player.inkCharges ? '#0284c7' : '#1e3a5f',
            transition: 'background 0.2s',
          }} />
        ))}
        <span style={{ color: '#0284c7', marginLeft: 2, fontSize: 10 }}>{player.inkCharges}</span>
      </div>

      {/* Ink active timer */}
      {inkActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#0284c7', animation: 'inkPop 0.5s ease-in-out infinite alternate' }}>✨ INK</span>
          <div style={{ width: 44, height: 5, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${inkPct}%`, height: '100%', background: '#0284c7', transition: 'width 0.1s linear' }} />
          </div>
        </div>
      )}

      {/* Score */}
      <span style={{ color: '#94a3b8', fontSize: 10 }}>⭐ {player.score}</span>

      {/* Inventory count */}
      {player.inventory.length > 0 && (
        <span style={{ color: '#94a3b8', fontSize: 10 }}>
          🎒 {player.inventory.reduce((s, i) => s + i.count, 0)}
        </span>
      )}

      {/* Mode badges */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{
          padding: '2px 6px', borderRadius: 3,
          background: '#1e3a5f', color: '#93c5fd', fontSize: 10,
        }}>
          {FORMAT_EMOJI[gameFormat]} {FORMAT_LABEL[gameFormat]}
        </span>
        <span style={{
          padding: '2px 6px', borderRadius: 3,
          background: turnOrder === 'SEQUENTIAL' ? '#4c1d95' : '#0c4a6e',
          color: '#fff', fontSize: 10,
        }}>
          {turnOrder === 'SEQUENTIAL' ? 'TURN' : 'REAL-TIME'}
        </span>
      </div>

      {/* Wave indicator (DEFEND only) */}
      {gameFormat === 'DEFEND' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: '#fca5a5', fontSize: 10,
        }}>
          <span>🌊 Wave {waveNumber}</span>
          {nextWaveIn > 0 && (
            <span style={{ color: '#94a3b8' }}>next in {Math.ceil(nextWaveIn)}s</span>
          )}
        </div>
      )}

      {/* Message */}
      {message && (
        <div style={{
          width: '100%', textAlign: 'center', color: '#38bdf8',
          fontSize: 11, marginTop: 1,
        }}>
          {message}
        </div>
      )}

      {/* Controls hint */}
      <div style={{ width: '100%', color: '#475569', fontSize: 9, fontWeight: 'normal', marginTop: 1 }}>
        WASD / ↑↓←→ move · SPACE/I = ink · ESC = pause · drag supplies from bar onto map
      </div>
    </div>
  );
};
