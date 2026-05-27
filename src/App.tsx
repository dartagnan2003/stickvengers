/**
 * App — top-level shell for the v3.0 Stickvengers Maze game.
 *
 * Owns:
 *   • Menu screen (choose GameFormat + TurnOrder, start)
 *   • In-game layout (PlayerHUD + MazeCanvas stacked vertically)
 *   • ShopModal (rendered above MazeCanvas when state.shopOpen)
 *   • Post-game buttons (Play Again / New Game)
 *
 * All game logic lives in useGameSession / GameReducer — this file
 * is purely layout + wiring.
 */

import React, { useState, useRef } from 'react';
import { useGameSession }  from './engine/useGameSession';
import { PlayerHUD }       from './components/PlayerHUD';
import { MazeCanvas }      from './components/MazeCanvas';
import { ShopModal }       from './components/ShopModal';
import type { TurnOrder }  from './types/state';
import type { GameFormat, SupplyType, SupplyTier } from './types/supplies';

// ─── Format option data ───────────────────────────────────────────────────────

interface FormatOption {
  value:    GameFormat;
  label:    string;
  emoji:    string;
  desc:     string;
  supplies: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value:    'JOURNEY',
    emoji:    '🚪',
    label:    'Journey',
    desc:     'Navigate the fog-shrouded maze from start to exit.',
    supplies: 'Starts with: 📎×2  🖊️×1',
  },
  {
    value:    'ATTACK',
    emoji:    '⚔️',
    label:    'Attack',
    desc:     'Breach the enemy fortress at the far end of the maze.',
    supplies: 'Starts with: 🧹×2  💥×1  ✏️×2',
  },
  {
    value:    'DEFEND',
    emoji:    '🛡️',
    label:    'Defend',
    desc:     'Fortify your base and survive 5 waves of enemies.',
    supplies: 'Starts with: 📎×3  🗒️×2  🎀×1',
  },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const {
    state,
    startGame, movePlayer, useInk, reset, pause, resume, goToMenu,
    placeSupply, closeShop, buySupply,
  } = useGameSession();

  // Menu selections
  const [selGF, setSelGF] = useState<GameFormat>('JOURNEY');
  const [selTO, setSelTO] = useState<TurnOrder>('SEQUENTIAL');

  // Drag context — shared between InventoryBar and MazeCanvas
  const dragContextRef = useRef<{ type: SupplyType; tier: SupplyTier } | null>(null);

  const player     = state.players['p1'];
  const isInGame   = state.phase === 'PLAYING' || state.phase === 'PAUSED';
  const isTerminal = state.phase === 'GAMEOVER' || state.phase === 'VICTORY';
  const isMenu     = state.phase === 'MENU';

  const handlePause = () => {
    if (state.phase === 'PLAYING') pause();
    else if (state.phase === 'PAUSED') resume();
  };

  // Find the shop node the player is currently standing on
  const activeShopNode = state.shopOpen
    ? state.shopNodes.find(n => n.row === player?.row && n.col === player?.col) ?? null
    : null;

  // ── Menu ──────────────────────────────────────────────────────────────────
  if (isMenu || (!isInGame && !isTerminal)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0f172a', padding: 24, gap: 28,
        fontFamily: "'Courier New', monospace",
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🦸🖊️</div>
          <h1 style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 'bold', letterSpacing: 2, margin: 0 }}>
            STICKVENGERS
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Maze Edition · v3.0 — Supply Tactics
          </p>
        </div>

        {/* Format selector */}
        <div style={{ width: '100%', maxWidth: 440 }}>
          <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 10, letterSpacing: 1 }}>
            SELECT FORMAT
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelGF(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 10,
                  background: selGF === opt.value ? '#1e3a5f' : '#1e293b',
                  border: selGF === opt.value ? '2px solid #0284c7' : '2px solid #334155',
                  color: '#f1f5f9', cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s',
                  width: '100%',
                }}
              >
                <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{opt.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>{opt.label}</div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{opt.desc}</div>
                  <div style={{ color: '#4ade80', fontSize: 10, marginTop: 4 }}>{opt.supplies}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Turn order toggle */}
        <div style={{ width: '100%', maxWidth: 440 }}>
          <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 10, letterSpacing: 1 }}>
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
          onClick={() => startGame(selGF, selTO)}
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

        <p style={{ color: '#334155', fontSize: 10, textAlign: 'center', margin: 0 }}>
          WASD / ↑↓←→ move · SPACE/I = ink · ESC = pause · drag supplies from bar onto maze
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
      <div style={{ padding: '4px 8px 0', flexShrink: 0 }}>
        <PlayerHUD
          player={player}
          gameFormat={state.gameFormat}
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
        onPlaceSupply={placeSupply}
        dragContextRef={dragContextRef}
      />

      {/* Shop modal — rendered above everything */}
      {state.shopOpen && activeShopNode && (
        <ShopModal
          shopNode={activeShopNode}
          playerEnergy={player?.energy ?? 0}
          onBuy={buySupply}
          onClose={closeShop}
        />
      )}

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
