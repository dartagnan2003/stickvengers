import type { Direction, VictoryCondition, TurnOrder } from './state';

/**
 * Every state transition goes through a Command.
 * Commands are plain objects — fully JSON-serializable for BLE transport.
 * The game reducer is a pure function: (GameState, Command) => GameState.
 */
export type Command =
  | { type: 'MOVE';        playerId: string; direction: Direction }
  | { type: 'USE_INK';     playerId: string }
  | { type: 'TICK';        delta: number }          // seconds; drives real-time mode
  | { type: 'START_GAME';  victoryCondition: VictoryCondition; turnOrder: TurnOrder; seed?: number }
  | { type: 'RESET' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'GOTO_MENU' };   // return to the main menu / goal selector
