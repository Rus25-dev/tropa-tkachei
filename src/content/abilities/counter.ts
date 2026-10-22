// Контрудар: удар вплотную в последние кадры жёлтого или красного замаха босса срывает атаку (логика — core/kit/counter.ts).
import { defineAbility } from '../../core/ability-kit';
import { kitHas } from '../../core/kit/abilities';
import { COUNTER, counterStep } from '../../core/kit/counter';

export default defineAbility({
  id: 'counter', order: 40, name: 'Контрудар', col: 0xbfe9ff, unlock: 'boss:keeper',
  desc: 'Ударьте вплотную к боссу в последние 0,15 с его жёлтого или красного замаха: удар сорвёт атаку, босс оглушён, а ваш удар станет усиленной контратакой. Фиолетовые и белые замахи не берутся. Откат 1,5 с.',
  pre: (sc, p, dt) => counterStep(sc, p, dt),
  clear: (p) => { p['cxCd'] = 0; p['cxFx'] = 0; },
  hud: (sc, p) => { if (!kitHas(sc, p, 'counter')) return null; const cd = (p['cxCd'] as number) | 0; return { frac: Math.min(1, cd / COUNTER.CD_F), ready: cd <= 0, active: (p['cxFx'] as number) > 0 }; },
});
