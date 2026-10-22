// Быстрая нить: нить копится на 50 % быстрее.
import { BAL } from '../../core/balance';
import { defineCharm } from '../../core/charm-kit';

export default defineCharm({
  id: 'swift', order: 3, name: 'Быстрая нить', desc: 'Нить копится на 50 % быстрее: каждый второй набор даёт лишнюю единицу.', unlock: 'boss:penitent', slots: 1, col: 0x9ff0c8,
  silkGain: (sc, p, boss) => {
    const gained = !boss || ((p['bossHits'] as number) | 0) % BAL.silkEvery === 0;
    if (!gained) return;
    p['_sf'] = ((p['_sf'] as number) || 0) + 0.5;
    if ((p['_sf'] as number) >= 1) { (p['_sf'] as number) -= 1; if (p.remote) sc.sendEv({ k: 'silk', i: p.i }); else p.silk = Math.min(sc.silkMax, p.silk + 1); }
  },
});
