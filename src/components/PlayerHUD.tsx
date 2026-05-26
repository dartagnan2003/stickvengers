import React from 'react';
import type { PlayerState, VictoryCondition, TurnOrder } from '../types/state';

const VC_LABEL: Record<VictoryCondition, string> = {
  REACH_EXIT:     'REACH EXIT',
  COLLECT_PRIZE:  'COLLECT ALL PRIZES',
  SURVIVE_WAVES:  'SURVIVE WAVES',
};

interface Props {
  player:           PlayerState | undefined;
  victoryCondition: VictoryCondition;
  turnOrder:        TurnOrder;
  waveNumber:       number;
  nextWaveIn:       number;
  message?:         string;
  inkActive:        boolean;
  inkTimer:         number;
}

export const PlayerHUD: React.FC<Props> = ({
  player, victoryCondition, turnOrder, waveNumber, nextWaveIn, message, inkActive, inkTimer,
}) => {
  if (!player) return null;
  const hpPct     = (player.hp / player.maxHp) * 100;
  const hpColor   = hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#f59e0b' : '#ef4444';
  const inkPct    = inkActive ? (inkTimer / 4.5) * 100 : 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      padding: '8px 12px', background: '#e2e8f0', borderRadius: 4,
      marginBottom: 8, fontSize: 12, fontFamily: "'Courier New', monospace", fontWeight: 'bold',
    }}>
      {/* HP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#ef4444' }}>❤️</span>
        <div style={{ width: 60, height: 8, background: '#cbd5e1', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, transition: 'width 0.2s ease' }} />
        </div>
        <span style={{ color: '#334155' }}>{player.hp}/{player.maxHp}</span>
      </div>

      {/* Ink charges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>🖊️</span>
        {Array.from({ length: player.maxHp > 0 ? 5 : 0 }, (_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i < player.inkCharges ? '#0284c7' : '#cbd5e1',
            transition: 'background 0.2s',
          }} />
        ))}
        <span style={{ color: '#0284c7', marginLeft: 2 }}>{player.inkCharges}</span>
      </div>

      {/* Ink active timer */}
      {inkActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#0284c7', animation: 'inkPop 0.5s ease-in-out infinite alternate' }}>✨ INK</span>
          <div style={{ width: 50, height: 6, background: '#bae6fd', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${inkPct}%`, height: '100%', background: '#0284c7', transition: 'width 0.1s linear' }} />
          </div>
        </div>
      )}

      {/* Score / prizes */}
      {victoryCondition === 'COLLECT_PRIZE' && (
        <span>🏆 {player.prizesCollected} prizes</span>
      )}
      <span style={{ color: '#475569' }}>⭐ {player.score}</span>

      {/* Mode badges */}
      <span style={{
        marginLeft: 'auto', padding: '2px 6px', borderRadius: 3,
        background: '#334155', color: '#fff', fontSize: 10,
      }}>
        {VC_LABEL[victoryCondition]}
      </span>
      <span style={{
        padding: '2px 6px', borderRadius: 3,
        background: turnOrder === 'SEQUENTIAL' ? '#7c3aed' : '#0369a1',
        color: '#fff', fontSize: 10,
      }}>
        {turnOrder === 'SEQUENTIAL' ? 'TURN-BASED' : 'REAL-TIME'}
      </span>

      {/* Wave indicator (SURVIVE_WAVES) */}
      {victoryCondition === 'SURVIVE_WAVES' && (
        <span style={{ color: '#b91c1c' }}>
          🌊 Wave {waveNumber} — next in {Math.ceil(nextWaveIn)}s
        </span>
      )}

      {/* Message */}
      {message && (
        <div style={{
          width: '100%', textAlign: 'center', color: '#0284c7',
          fontSize: 11, marginTop: 2,
        }}>
          {message}
        </div>
      )}

      {/* Controls hint */}
      <div style={{ width: '100%', color: '#94a3b8', fontSize: 10, fontWeight: 'normal' }}>
        WASD / ↑↓←→ move · SPACE / I = disappearing ink · ESC = pause
      </div>
    </div>
  );
};
