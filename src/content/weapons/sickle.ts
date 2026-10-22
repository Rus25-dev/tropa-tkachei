// Серп — длинная дуга, рубит летящие снаряды.
import { ctr, defineWeapon, fr } from '../../core/weapon-kit';

export default defineWeapon({
  id: 'sickle', order: 2, name: 'Серп', col: 0xd9f2a8,
  desc: 'Длинная широкая дуга вверх-вперёд, рубит и летящие снаряды. Медленный замах. Заряд — «жатва» вокруг героя.',
  reach: 1.6, thick: 1.8, atkT: 0.2, cd: 0.52, combo: 2, comboWin: 0.9, finisher: true, finT: 0.24, finCd: 0.66, dmg: 1.62,
  pm: 1.6, kb: 1.15, recoil: 1, hs: 0.05, cutAll: true, unlock: 'boss:vladik2',
  geo: { f: [80, 62, -46], fh: [102, 68, -50], u: [66, 70, 62], d: [40, 46] },
  sw: {
    f: { hits: 2, snd: 'reap' },
    a1: { t: 0.2, cd: 0.4, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(74 * rm), 66, cy - 12) },
    a2: { t: 0.2, cd: 0.45, dm: 1.1, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(128 * rm), 80, cy - 46) },
    c: { t: 0.34, cd: 0.5, tot: 4.8, hits: 2, noRecoil: true, cutAll: true, snd: 'reap', box: (sc, p, sw, el, rm, cx, cy) => ({ x: sw.f0 > 0 ? cx - 14 : cx + 14 - Math.round(168 * rm), y: cy - 104, w: Math.round(168 * rm), h: 132 }) },
  },
});
