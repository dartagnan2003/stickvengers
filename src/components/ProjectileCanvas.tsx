/**
 * ProjectileCanvas — Area 3
 *
 * A single <canvas> element that owns its own RAF loop and draws all
 * projectiles every frame using 2D context primitives.
 *
 * CONTRACT:
 *   - Receives `projectiles` as a prop (pure data, no game logic here).
 *   - Reads the prop via a ref so the RAF loop never needs to restart.
 *   - Never writes back to game state — rendering only.
 *   - DPR-aware: canvas pixel buffer matches device pixel ratio so the
 *     canvas is crisp on Retina / high-DPI mobile screens.
 */

import { useRef, useEffect } from 'react';
import type { Projectile } from '../types/entities';
import { GRID_COLS, ROW_HEIGHT_PX } from '../engine/GridSystem';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  projectiles: Projectile[];
  /** CSS pixel width of the grid container */
  width: number;
  /** CSS pixel height of the grid container */
  height: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectileCanvas({ projectiles, width, height }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const ctxRef     = useRef<CanvasRenderingContext2D | null>(null);
  const projRef    = useRef<Projectile[]>(projectiles);
  const sizeRef    = useRef({ width, height });

  // Keep refs current every render — the RAF loop reads from them.
  projRef.current = projectiles;
  sizeRef.current = { width, height };

  // ── Canvas resize + DPR setup ──────────────────────────────────────────────
  // Runs when grid dimensions change (initial mount + window resize).
  // Sets the backing-store size to CSS pixels × devicePixelRatio so lines
  // are never blurry on high-DPI screens (every modern phone).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const dpr = Math.round(window.devicePixelRatio || 1);
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale all draw calls up by dpr so we still use CSS-pixel coordinates.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxRef.current = ctx;
  }, [width, height]);

  // ── Persistent RAF draw loop ───────────────────────────────────────────────
  // Starts once on mount, reads from refs each frame.
  // Stopped via the cleanup function when the component unmounts.
  useEffect(() => {
    let frameId: number;

    const draw = (timestamp: number) => {
      const ctx = ctxRef.current;
      const { width: w, height: h } = sizeRef.current;

      if (ctx && w > 0 && h > 0) {
        ctx.clearRect(0, 0, w, h);
        for (const proj of projRef.current) {
          drawProjectile(ctx, proj, w, timestamp);
        }
      }

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, []); // intentionally empty — loop reads only from refs

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}

// ─── Per-projectile draw dispatch ─────────────────────────────────────────────

function drawProjectile(
  ctx: CanvasRenderingContext2D,
  proj: Projectile,
  gridWidth: number,
  timestamp: number,
): void {
  // Grid-space → CSS-pixel coordinates
  const cx  = (proj.x / GRID_COLS) * gridWidth;
  const cy  = proj.lane * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;
  const dir = proj.speed >= 0 ? 1 : -1; // 1 = moving right, -1 = moving left

  ctx.save();

  switch (proj.type) {

    // ── Graphite dart ──────────────────────────────────────────────────────
    // A short pencil-shaped dart: rectangular body + angled tip.
    // A faded shadow trail extends behind it in the direction of travel.
    case 'GRAPHITE': {
      const bodyLen = 10;
      const tipLen  = 4;

      // Trail (faded behind the dart)
      ctx.globalAlpha = 0.15;
      ctx.fillStyle   = '#64748b';
      ctx.fillRect(
        cx - dir * (bodyLen * 1.8),
        cy - 1.5,
        dir * (bodyLen * 1.8),
        3,
      );

      // Slate body
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#1e293b';
      ctx.fillRect(cx - dir * (bodyLen / 2), cy - 2, dir * bodyLen, 4);

      // Amber graphite tip (triangle pointing in travel direction)
      const tipBase = cx + dir * (bodyLen / 2);
      ctx.beginPath();
      ctx.moveTo(tipBase,               cy - 2);
      ctx.lineTo(tipBase + dir * tipLen, cy    );
      ctx.lineTo(tipBase,               cy + 2);
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      break;
    }

    // ── Ink blot ───────────────────────────────────────────────────────────
    // A pulsing deep-blue circle with a lighter halo ring.
    // The pulse radius uses sin(timestamp) — smoothly oscillates each frame
    // without any game-state dependency.
    case 'INK_BLOT': {
      const pulse = Math.sin(timestamp / 90) * 1.4;
      const r     = 5 + pulse;

      // Core fill
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle   = '#1e40af';
      ctx.globalAlpha = 0.92;
      ctx.fill();

      // Halo ring (opacity-based glow — no shadowBlur, which is slow on iOS)
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#60a5fa';
      ctx.globalAlpha = 0.28;
      ctx.lineWidth   = 2;
      ctx.stroke();
      break;
    }

    // ── Laser bolt ─────────────────────────────────────────────────────────
    // An amber diamond-shaped bolt with a glowing trail.
    // The trail is drawn as overlapping opacity layers — no shadowBlur
    // (unreliable on WKWebView; hits main thread instead of compositor).
    case 'LASER': {
      const trailLen = 18 * dir;

      // Outer glow trail
      ctx.globalAlpha = 0.12;
      ctx.fillStyle   = '#fbbf24';
      ctx.fillRect(cx - trailLen, cy - 4, trailLen, 8);

      // Mid trail
      ctx.globalAlpha = 0.22;
      ctx.fillStyle   = '#f59e0b';
      ctx.fillRect(cx - trailLen * 0.6, cy - 2.5, trailLen * 0.6, 5);

      // Diamond bolt head
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(cx - dir * 5, cy    );
      ctx.lineTo(cx,            cy - 4);
      ctx.lineTo(cx + dir * 5, cy    );
      ctx.lineTo(cx,            cy + 4);
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.fill();

      // Bright white core streak
      ctx.globalAlpha = 0.55;
      ctx.fillStyle   = '#fff';
      ctx.fillRect(cx - dir * 3, cy - 1, dir * 6, 2);
      break;
    }

    // ── Lobbed arc (Highlighter) ───────────────────────────────────────────
    // Draws the projectile dot at a parabolic Y offset based on progress
    // (0 → 1 over the flight). A ghost arc shows the predicted trajectory.
    case 'LOBBED': {
      const progress = proj.progress ?? 0;
      const arcLift  = Math.sin(progress * Math.PI) * 36;
      const dotY     = cy - arcLift;

      // Ghost trajectory arc (from startX to targetX if available)
      if (
        proj.startX  !== undefined &&
        proj.targetX !== undefined
      ) {
        const sx    = (proj.startX  / GRID_COLS) * gridWidth;
        const ex    = (proj.targetX / GRID_COLS) * gridWidth;
        const arcCy = cy - 36; // arc control point (peak height)

        ctx.beginPath();
        ctx.moveTo(sx, cy);
        ctx.quadraticCurveTo((sx + ex) / 2, arcCy, ex, cy);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.18;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Warm amber dot riding the arc
      ctx.beginPath();
      ctx.arc(cx, dotY, 6, 0, Math.PI * 2);
      ctx.fillStyle   = '#f59e0b';
      ctx.globalAlpha = 1;
      ctx.fill();

      // Inner bright highlight
      ctx.beginPath();
      ctx.arc(cx - 1.5, dotY - 1.5, 2, 0, Math.PI * 2);
      ctx.fillStyle   = '#fff';
      ctx.globalAlpha = 0.45;
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}
