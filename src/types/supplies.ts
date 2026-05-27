/**
 * supplies.ts — v3.0 supply type system.
 *
 * Office supplies are now deployable map tools, not just enemies.
 * This file defines the types used across the engine and components.
 * No React / DOM imports — safe for pure reducer use.
 */

// ─── Supply identity ──────────────────────────────────────────────────────────

export type SupplyType =
  | 'PAPERCLIP'    // builds an impassable wall (temporary)
  | 'STAPLER'      // bridges / removes a wall segment
  | 'RED_TAPE'     // creates a slow zone (movement costs extra)
  | 'RUBBER_BAND'  // one-directional launch portal
  | 'INK_BLOT'     // two-way teleport (placed in pairs)
  | 'HIGHLIGHTER'  // reveals fog beyond walls (timed)
  | 'WHITEOUT'     // removes any placed supply (and reverses its wall changes)
  | 'SHARPIE'      // permanent impassable wall (WHITEOUT-immune at T3)
  | 'STICKY_NOTE'  // trap — damages next entity to step on it
  | 'CRAYON'       // cosmetic trail / breadcrumb marker
  | 'ERASER';      // removes one wall segment on an adjacent cell

export type SupplyTier = 1 | 2 | 3;

// ─── Cell effects (what a placed supply does) ─────────────────────────────────

export type CellEffectType =
  | 'WALL'       // PAPERCLIP: impassable temporary wall
  | 'PERM_WALL'  // SHARPIE: impassable, cannot be removed by WHITEOUT (T1/T2; T3 enforces)
  | 'BRIDGE'     // STAPLER / ERASER: opens a wall between two cells
  | 'SLOW'       // RED_TAPE: movement through this cell costs extra actions/time
  | 'PORTAL_IN'  // RUBBER_BAND source or INK_BLOT side-A
  | 'PORTAL_OUT' // RUBBER_BAND target or INK_BLOT side-B
  | 'REVEAL'     // HIGHLIGHTER: extends fog visibility from supply position
  | 'TRAP'       // STICKY_NOTE: damages next entity to step on cell
  | 'MARK';      // CRAYON: purely cosmetic breadcrumb

// ─── Game formats (replace v2 VictoryConditions) ─────────────────────────────

export type GameFormat =
  | 'JOURNEY'    // Navigate fog-of-war maze from start to exit
  | 'ATTACK'     // Breach enemy fortifications to capture the base
  | 'DEFEND';    // Fortify your base and survive 5 enemy waves

// ─── Inventory ────────────────────────────────────────────────────────────────

/** A stack of supplies of the same type and tier in a player's inventory. */
export interface InventorySupply {
  type:  SupplyType;
  tier:  SupplyTier;
  count: number;
}

// ─── Placed on the map ────────────────────────────────────────────────────────

/**
 * A supply that has been deployed onto a maze cell.
 * Stored in GameState.placedSupplies — plain JSON-serializable for BLE.
 */
export interface PlacedSupply {
  /** Unique ID: `ps_${Date.now()}_${rand4}` */
  id:           string;
  type:         SupplyType;
  tier:         SupplyTier;
  row:          number;
  col:          number;
  effect:       CellEffectType;
  /**
   * Portal linkage / launch target:
   *   INK_BLOT — ID of the linked PlacedSupply (other portal end)
   *   RUBBER_BAND — stringified target cell as "row,col"
   */
  linkedId?:    string;
  /**
   * Seconds remaining for timed effects (HIGHLIGHTER).
   * -1 means permanent (HIGHLIGHTER T3).
   * undefined means no timer.
   */
  turnsLeft?:   number;
  /**
   * Snapshot of the walls that were modified when this supply was placed.
   * Used by WHITEOUT to restore the maze to its prior state.
   * Key format: `"r,c:SIDE"` where SIDE is N/E/S/W.
   */
  wallSnapshot?: Record<string, boolean>;
  /** Player ID who placed this supply. */
  ownerId:      string;
}

// ─── Shop node ────────────────────────────────────────────────────────────────

/** A shop location on the maze. Stock depletes as the player buys. */
export interface ShopNode {
  row:   number;
  col:   number;
  /** Available supplies; count decrements on purchase. */
  stock: InventorySupply[];
}
