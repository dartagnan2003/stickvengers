import React from 'react';
import type { HeroId } from '../types/entities';
import { HERO_BLUEPRINTS } from '../data/unitRegistry';

const PLAYABLE_HEROES: HeroId[] = ['pencil', 'eraser', 'clicky_pen', 'highlighter', 'sharpie', 'crayon', 'marker'];

interface Props {
  ink: number;
  selectedHeroId: HeroId | null;
  heroLevels: Record<HeroId, number>;
  onSelectHero: (id: HeroId) => void;
  onOpenUpgrade: () => void;
}

const INK_MAX = 500;

export const SidePanel: React.FC<Props> = ({ ink, selectedHeroId, heroLevels, onSelectHero, onOpenUpgrade }) => {
  return (
    <aside className="side-panel">
      {/* Ink reservoir */}
      <div style={{ fontSize: 11, fontWeight: 'bold', color: '#0369a1', marginBottom: 2 }}>
        INK: {ink} mL
      </div>
      <div className="ink-bar-wrap">
        <div className="ink-bar-fill" style={{ width: `${Math.min(100, (ink / INK_MAX) * 100)}%` }} />
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: '#64748b' }}>SELECT UNIT</div>

      {PLAYABLE_HEROES.map(id => {
        const bp  = HERO_BLUEPRINTS[id];
        const lvl = heroLevels[id] ?? 1;
        const canAfford = ink >= bp.inkCost;
        return (
          <div
            key={id}
            className={`hero-card${selectedHeroId === id ? ' selected' : ''}${!canAfford ? ' unaffordable' : ''}`}
            onClick={() => canAfford && onSelectHero(id)}
            style={{ opacity: canAfford ? 1 : 0.45 }}
            title={bp.description}
          >
            <div style={{ fontSize: 20 }}>{bp.emoji}</div>
            <div style={{ fontWeight: 'bold' }}>{bp.name}</div>
            <div className="cost">{bp.inkCost} mL · Lvl {lvl}</div>
            {!canAfford && <div className="affordability">Need {bp.inkCost - ink} more</div>}
          </div>
        );
      })}

      <button
        onClick={onOpenUpgrade}
        style={{
          marginTop: 4, padding: '6px 0', width: '100%',
          border: '1px solid #94a3b8', borderRadius: 4,
          background: '#f8fafc', cursor: 'pointer', fontSize: 11,
        }}
      >
        ⬆ Upgrades
      </button>
    </aside>
  );
};
