// Жало: удары оружия отравляют.
import { defineCharm } from '../../core/charm-kit';
import { applyStatus } from '../../core/status';

export default defineCharm({
  id: 'sting', order: 0, name: 'Жало', desc: 'Удары иглы отравляют: 1 урона раз в 1.2 с, 4 раза. Боссов яд берёт вдвое слабее.', unlock: 'boss:misha2', slots: 1, col: 0x86e05a,
  hitEnemy: (sc, e, p) => { if (!p['noSilkGain'] && p.atkT > 0 && !!p.atkHits) applyStatus(sc, e, 'poison', null, p); },
  hitBoss: (sc, _key, b, p) => { if (!p['noSilkGain'] && p.atkT > 0 && !!p.atkHits) applyStatus(sc, b, 'poison', null, p); },
});
