/**
 * LocalTransport — single-device stub.
 *
 * In solo mode every command is dispatched locally.
 * send() is a no-op (the hook dispatches directly).
 * BLETransport will replace this for multiplayer.
 */

import type { Transport } from './TransportInterface';
import type { Command }   from '../types/commands';

export class LocalTransport implements Transport {
  private _handler: ((cmd: Command) => void) | null = null;

  send(_cmd: Command): void {
    // No-op in local mode — the caller already applied the command.
  }

  onReceive(handler: (cmd: Command) => void): void {
    this._handler = handler;
  }

  /** Simulate receiving a remote command (useful for testing). */
  simulateReceive(cmd: Command): void {
    this._handler?.(cmd);
  }

  destroy(): void {
    this._handler = null;
  }
}
