import React from 'react';
import type { HeroId } from '../types/entities';
import { HERO_BLUEPRINTS } from '../data/unitRegistry';

const PLAYABLE_HEROES: HeroId[] = ['pencil', 'eraser', 'clicky_pen', 'highlighter', 'sharpie', 'crayon', 'marker'];

const UPGRADE_COST_PER_LEVEL = [0, 0, 150, 250, 400, 600, 900, 1300, 1800, 2500, 3500];

interface Props {
  ink: number;
  heroLevels: Record<HeroId, number>;
  onUpgrade: (id: HeroId) => boolean;
  onClose: () => void;
}

export const UpgradeModal: React.FC<Props> = ({ ink, heroLevels, onUpgrade, onClose }) => {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Peripheral Upgrades</h2>

        {PLAYABLE_HEROES.map(id => {
          const bp      = HERO_BLUEPRINTS[id];
          const lvl     = heroLevels[id] ?? 1;
          const nextLvl = lvl + 1;
          const cost    = UPGRADE_COST_PER_LEVEL[nextLvl] ?? null;
          const maxed   = lvl >= 10;

          return (
            <div key={id} className="upgrade-row">
              <span style={{ fontSize: 16 }}>{bp.emoji}</span>
              <span style={{ flex: 1, marginLeft: 8 }}>
                <strong>{bp.name}</strong>
                <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>Lvl {lvl}</span>
              </span>

              {maxed ? (
                <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 'bold' }}>MAX</span>
              ) : (
                <button
                  disabled={ink < (cost ?? Infinity)}
                  onClick={() => onUpgrade(id)}
                  style={{ opacity: ink < (cost ?? Infinity) ? 0.45 : 1 }}
                >
                  Lvl {nextLvl} — {cost} mL
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
