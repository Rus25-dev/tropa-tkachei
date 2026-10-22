// Парные иглы — очень быстрые, короткие; четвёртый удар — вихрь.
import { ctr, defineWeapon, fr } from '../../core/weapon-kit';

export default defineWeapon({
  id: 'twin', order: 1, name: 'Парные иглы', col: 0xb8ecff,
  desc: 'Очень быстрые, но короткие и слабо отбрасывают. Четвёртый удар — вихрь вокруг героя. С зарядом — шквал.',
  reach: 0.8, thick: 0.9, atkT: 0.08, cd: 0.11, combo: 4, comboWin: 0.4, finisher: true, finT: 0.22, finCd: 0.45, dmg: 0.69,
  pm: 0.65, kb: 0.4, recoil: 0.4, hs: 0.018, unlock: 'boss:misha2',
  geo: { f: [40, 28, -14], fh: [96, 58, -29, 'c'], u: [34, 44, 40], d: [34, 40] },
  sw: {
    f: { hits: 2, snd: 'whirl' },
    a1: { t: 0.09, cd: 0.14, dm: 0.8, hits: 2, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(46 * rm), 38, cy - 20) },
    a2: { t: 0.12, cd: 0.2, dm: 1.15, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(80 * rm), 52, cy - 26) },
    c: { t: 0.56, cd: 0.45, tot: 4.8, hits: 1, pulses: 4, pulse: 0.13, noRecoil: true, snd: 'whirl', box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(116 * rm), 66, cy - 33) },
  },
});
