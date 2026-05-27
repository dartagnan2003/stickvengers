import type { Direction, TurnOrder } from './state';
import type { SupplyType, SupplyTier, GameFormat } from './supplies';

/**
 * Every state transition goes through a Command.
 * Commands are plain objects — fully JSON-serializable for BLE transport.
 * The game reducer is a pure function: (GameState, Command) => GameState.
 */
export type Command =
  | { type: 'MOVE';         playerId: string; direction: Direction }
  | { type: 'USE_INK';      playerId: string }
  | { type: 'TICK';         delta: number }           // seconds; drives real-time mode
  | { type: 'START_GAME';   gameFormat: GameFormat; turnOrder: TurnOrder; seed?: number }
  | { type: 'RESET' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'GOTO_MENU' }
  // ── v3: supply system ─────────────────────────────────────────────────────
  | { type: 'PLACE_SUPPLY'; playerId: string; supplyType: SupplyType; tier: SupplyTier; row: number; col: number }
  | { type: 'OPEN_SHOP';    playerId: string }
  | { type: 'BUY_SUPPLY';   playerId: string; supplyType: SupplyType; tier: SupplyTier }
  | { type: 'CLOSE_SHOP' };
