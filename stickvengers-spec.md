# Project Specification: Stickvengers Mobile Game (MVP)

## 1. Project Vision & Identity
Stickvengers is a lightweight, minimalistic mobile lane-defense game inspired by the mechanics of *Plants vs. Zombies 2*. The game features a playful "Office Supply vs. Corporate Bureaucracy" theme. All protagonists are minimalist stick figures wielding writing peripherals, while enemies are office supply obstacles marching to destroy the user's notebook grid.

### Visual Aesthetic & Budget Guardrails
* **Minimalism First:** Zero high-fidelity textures. The canvas should mimic white lined notebook paper or grid graph paper.
* **Art Style:** Stylized, clean vector lines or basic hand-drawn stick figure aesthetics. Minimalist styling ensures immediate performance and zero asset-bloat.
* **Animations:** Linear movements, basic scaling, rotations (e.g., a pen clicking or a pencil shaving darts), and programmatic CSS/SVG adjustments. No complex frame-by-frame sprite sheets required.

---

## 2. Technical Architecture & Architecture Tree
The MVP should be structured as a decoupled web application using React + TypeScript, suitable for wrapper deployment (Capacitor/Cordova) or direct web play.

### Directory Layout
```text
stickvengers-core/
├── public/                 # Static assets (minimal svgs)
├── src/
│   ├── components/         # UI Elements
│   │   ├── GameCanvas.tsx  # Main 5x9 layout grid controller
│   │   ├── SidePanel.tsx   # Card selection & Ink bar display
│   │   └── UpgradeModal.tsx# Progression and stat upgrades menu
│   ├── engine/             # Loop and state management
│   │   ├── useGameLoop.ts  # RequestAnimationFrame delta-time driver
│   │   ├── GridSystem.ts   # Node occupancy, placement, entity lists
│   │   └── Collision.ts    # Box-intersection formulas for elements
│   ├── types/
│   │   ├── entities.ts     # Interfaces for Hero, Enemy, Projectile
│   │   └── skills.ts       # Progression definitions for levels 1-10
│   └── data/
│       ├── unitRegistry.ts # Configuration arrays for units & upgrades
│       └── waveConfig.ts   # Level-by-level enemy spawning definitions