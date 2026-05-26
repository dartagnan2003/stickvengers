/**
 * TransportInterface — abstract contract for command delivery.
 *
 * All game state changes travel as Commands.
 * The same interface is implemented by:
 *   LocalTransport  — single-device (instant, used now)
 *   BLETransport    — Capacitor BLE plugin (v2.x multiplayer)
 *
 * The game reducer never knows which transport is active.
 */

import type { Command } from '../types/commands';

export interface Transport {
  /** Send a command outbound (to remote peers). */
  send(cmd: Command): void;

  /** Register a handler for commands received from remote peers. */
  onReceive(handler: (cmd: Command) => void): void;

  /** Clean up connections. */
  destroy(): void;
}
