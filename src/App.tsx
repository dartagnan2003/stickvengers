/**
 * App — top-level shell for the v2.0 Stickvengers Maze game.
 *
 * Owns:
 *   • Menu screen (choose VictoryCondition + TurnOrder, start)
 *   • In-game layout (PlayerHUD + MazeCanvas stacked vertically)
 *   • Post-game buttons (Play Again / New Game)
 *
 * All game logic lives in useGameSession / GameReducer — this file
 * is purely layout + wiring.
 */

import React, { useState } from 'react';
import { useGameSession }  from './engine/useGameSession';
import { PlayerHUD }       from './components/PlayerHUD';
import { MazeCanvas }      from './components/MazeCanvas';
import type { VictoryCondition, TurnOrder } from './types/state';

// ─── VC / TurnOrder option data ───────────────────────────────────────────────

interface VCOption {
  value:   VictoryCondition;
  label:   string;
  emoji:   string;
  desc:    string;
}

const VC_OPTIONS: VCOption[] = [
  { value: 'REACH_EXIT',    emoji: '🚪', label: 'Reach the Exit',   desc: 'Navigate from start to exit through the fog.' },
  { value: 'COLLECT_PRIZE', emoji: '🏆', label: 'Collect Prizes',   desc: 'Gather all prizes, then reach the exit.' },
  { value: 'SURVIVE_WAVES', emoji: '🌊', label: 'Survive Waves',    desc: 'Hold out as waves of enemies flood the maze.' },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { state, startGame, movePlayer, useInk, reset, pause, resume, goToMenu } = useGameSession();

  // Menu selections
  const [selVC, setSelVC] = useState<VictoryCondition>('REACH_EXIT');
  const [selTO, setSelTO] = useState<TurnOrder>('SEQUENTIAL');

  const player     = state.players['p1'];
  const isInGame   = state.phase === 'PLAYING' || state.phase === 'PAUSED';
  const isTerminal = state.phase === 'GAMEOVER' || state.phase === 'VICTORY';
  const isMenu     = state.phase === 'MENU';

  const handlePause = () => {
    if (state.phase === 'PLAYING') pause();
    else if (state.phase === 'PAUSED') resume();
  };

  // ── Menu ──────────────────────────────────────────────────────────────────
  if (isMenu || (!isInGame && !isTerminal)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0f172a', padding: 24, gap: 32,
        fontFamily: "'Courier New', monospace",
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🦸🖊️</div>
          <h1 style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 'bold', letterSpacing: 2 }}>
            STICKVENGERS
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Maze Edition · v2.0
          </p>
        </div>

        {/* Goal selector */}
        <div style={{ width: '100%', maxWidth: 440 }}>
          <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10, letterSpacing: 1 }}>
            SELECT GOAL
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {VC_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelVC(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 10,
                  background: selVC === opt.value ? '#1e3a5f' : '#1e293b',
                  border: selVC === opt.value ? '2px solid #0284c7' : '2px solid #334155',
                  color: '#f1f5f9', cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{ fontSize: 28, lineHeight: 1 }}>{opt.emoji}</span>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>{opt.label}</div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Turn order toggle */}
        <div style={{ width: '100%', maxWidth: 440 }}>
          <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10, letterSpacing: 1 }}>
            MOVEMENT MODE
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { value: 'SEQUENTIAL'   as TurnOrder, label: 'Turn-Based',  emoji: '🎲', desc: 'Enemies move after you.' },
              { value: 'SIMULTANEOUS' as TurnOrder, label: 'Real-Time',   emoji: '⚡', desc: 'Everyone moves at once.' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelTO(opt.value)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 6,
                  padding: '12px 8px', borderRadius: 10,
                  background: selTO === opt.value ? '#1e3a5f' : '#1e293b',
                  border: selTO === opt.value ? '2px solid #7c3aed' : '2px solid #334155',
                  color: '#f1f5f9', cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{ fontSize: 24 }}>{opt.emoji}</span>
                <div style={{ fontWeight: 'bold', fontSize: 13 }}>{opt.label}</div>
                <div style={{ color: '#94a3b8', fontSize: 10, textAlign: 'center' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={() => startGame(selVC, selTO)}
          style={{
            width: '100%', maxWidth: 440, padding: '16px 0',
            background: '#0284c7', color: '#fff',
            fontFamily: "'Courier New', monospace",
            fontWeight: 'bold', fontSize: 18, letterSpacing: 2,
            border: 'none', borderRadius: 12, cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#0369a1')}
          onMouseOut={e  => (e.currentTarget.style.background = '#0284c7')}
        >
          START GAME
        </button>

        <p style={{ color: '#334155', fontSize: 11, textAlign: 'center' }}>
          WASD / ↑↓←→ move · SPACE / I = disappearing ink · ESC = pause
        </p>
      </div>
    );
  }

  // ── In-game + post-game ───────────────────────────────────────────────────
  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#0f172a', overflow: 'hidden',
    }}>
      {/* HUD */}
      <div style={{ padding: '6px 8px 0', flexShrink: 0 }}>
        <PlayerHUD
          player={player}
          victoryCondition={state.victoryCondition}
          turnOrder={state.turnOrder}
          waveNumber={state.waveNumber}
          nextWaveIn={state.nextWaveIn}
          message={isInGame ? state.message : undefined}
          inkActive={player?.inkActive ?? false}
          inkTimer={player?.inkTimer   ?? 0}
        />
      </div>

      {/* Maze canvas — fills remaining height */}
      <MazeCanvas
        state={state}
        onMove={movePlayer}
        onUseInk={useInk}
        onPause={handlePause}
      />

      {/* Post-game action bar */}
      {isTerminal && (
        <div style={{
          padding: '10px 16px', flexShrink: 0,
          display: 'flex', gap: 10, justifyContent: 'center',
          background: '#0f172a',
        }}>
          <button
            onClick={reset}
            style={postBtnStyle('#0284c7')}
          >
            ↩ Play Again
          </button>
          <button
            onClick={goToMenu}
            style={postBtnStyle('#334155')}
          >
            🏠 Main Menu
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Style helper ─────────────────────────────────────────────────────────────

function postBtnStyle(bg: string): React.CSSProperties {
  return {
    flex: 1, maxWidth: 200, padding: '12px 0',
    background: bg, color: '#f1f5f9',
    fontFamily: "'Courier New', monospace",
    fontWeight: 'bold', fontSize: 14,
    border: 'none', borderRadius: 10, cursor: 'pointer',
  };
}
