// Угольная нить: тяжёлый удар вперёд поджигает.
import { defineCharm } from '../../core/charm-kit';
import { applyStatus } from '../../core/status';

export default defineCharm({
  id: 'ember', order: 1, name: 'Угольная нить', desc: 'Тяжёлый удар (третий в комбо) поджигает врага: 3 тика ожога, огонь перекидывается на соседей.', unlock: 'shop:45', slots: 1, col: 0xff8a3c,
  hitEnemy: (sc, e, p) => { if (!p['noSilkGain'] && p.atkT > 0 && !!p.atkHits && p['heavy'] && p.atkDir === 'f') applyStatus(sc, e, 'burn', null, p); },
  hitBoss: (sc, _key, b, p) => { if (!p['noSilkGain'] && p.atkT > 0 && !!p.atkHits && p['heavy'] && p.atkDir === 'f') applyStatus(sc, b, 'burn', null, p); },
});
