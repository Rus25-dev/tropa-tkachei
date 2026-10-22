// Охотник: +15 % урона по оглушённым; казнь даёт вдвое больше нити.
import { defineCharm } from '../../core/charm-kit';
import { killEnemy } from '../../core/combat';
import { bossDamage } from '../../core/status';

export default defineCharm({
  id: 'hunter', order: 8, name: 'Охотник', desc: '+15 % урона по оглушённым врагам и боссам; казнь даёт вдвое больше нити.', unlock: 'boss:tima2', slots: 1, col: 0xe8e2cf,
  hitEnemy: (sc, e, p, { stunned }) => {
    if (!stunned) return;
    p['_hf'] = ((p['_hf'] as number) || 0) + 0.15;
    if ((p['_hf'] as number) >= 1) { (p['_hf'] as number) -= 1; e.hp -= 1; if (e.hp <= 0) killEnemy(sc, e); }
  },
  hitBoss: (sc, key, _b, p, { stag }) => {
    if (!stag || p['noSilkGain']) return;
    p['_hf'] = ((p['_hf'] as number) || 0) + 0.15;
    if ((p['_hf'] as number) >= 1) { (p['_hf'] as number) -= 1; bossDamage(sc, key, p, 1); }
  },
  exec: (sc, p) => { if (p.remote) { for (let i = 0; i < 3; i++) sc.sendEv({ k: 'silk', i: p.i }); } else p.silk = Math.min(sc.silkMax, p.silk + 3); },
});
