/**
 * useGameSession — React integration layer.
 *
 * Wraps gameReducer in useReducer. Owns:
 *   • The RAF loop (real-time TICK dispatches)
 *   • Keyboard + touch input (MOVE, USE_INK)
 *   • Transport wiring (LocalTransport for now; swap in BLETransport for v2.x)
 *
 * The reducer itself has zero React knowledge — this hook is the only
 * place game logic touches React.
 */

import { useReducer, useEffect, useRef, useCallback } from 'react';
import { gameReducer, makeBlankState }  from './GameReducer';
import type { GameState, Direction, VictoryCondition, TurnOrder } from '../types/state';

// ─── Key map ──────────────────────────────────────────────────────────────────

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp:    'N', w: 'N', W: 'N',
  ArrowRight: 'E', d: 'E', D: 'E',
  ArrowDown:  'S', s: 'S', S: 'S',
  ArrowLeft:  'W', a: 'W',
};
// Fix the 'a' mapping correctly
KEY_TO_DIR['a'] = 'W';
KEY_TO_DIR['A'] = 'W';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGameSession() {
  const [state, dispatch] = useReducer(gameReducer, undefined, makeBlankState);
  const stateRef          = useRef<GameState>(state);
  const lastTimeRef       = useRef(0);
  const frameIdRef        = useRef(0);

  stateRef.current = state;

  // ── Real-time RAF tick ─────────────────────────────────────────────────────
  useEffect(() => {
    const loop = (ts: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = ts;
      const delta = Math.min((ts - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = ts;

      const cur = stateRef.current;
      if (cur.phase === 'PLAYING' && cur.turnOrder === 'SIMULTANEOUS') {
        dispatch({ type: 'TICK', delta });
      }

      frameIdRef.current = requestAnimationFrame(loop);
    };
    frameIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, []);

  // ── Keyboard input ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (e.target instanceof HTMLInputElement) return;

      const dir = KEY_TO_DIR[e.key];
      if (dir) {
        e.preventDefault();
        dispatch({ type: 'MOVE', playerId: 'p1', direction: dir });
        return;
      }
      if (e.key === ' ' || e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        dispatch({ type: 'USE_INK', playerId: 'p1' });
      }
      if (e.key === 'Escape') {
        dispatch(stateRef.current.phase === 'PLAYING' ? { type: 'PAUSE' } : { type: 'RESUME' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Public actions ─────────────────────────────────────────────────────────

  const startGame = useCallback((
    vc: VictoryCondition,
    to: TurnOrder,
    seed?: number,
  ) => {
    lastTimeRef.current = 0;
    dispatch({ type: 'START_GAME', victoryCondition: vc, turnOrder: to, seed });
  }, []);

  const movePlayer = useCallback((dir: Direction) => {
    dispatch({ type: 'MOVE', playerId: 'p1', direction: dir });
  }, []);

  const useInk = useCallback(() => {
    dispatch({ type: 'USE_INK', playerId: 'p1' });
  }, []);

  const reset = useCallback(() => {
    lastTimeRef.current = 0;
    dispatch({ type: 'RESET' });
  }, []);

  const pause    = useCallback(() => dispatch({ type: 'PAUSE' }),     []);
  const resume   = useCallback(() => dispatch({ type: 'RESUME' }),    []);
  const goToMenu = useCallback(() => dispatch({ type: 'GOTO_MENU' }), []);

  return { state, startGame, movePlayer, useInk, reset, pause, resume, goToMenu };
}
