// Игла — стартовое оружие.
import { clipLen, defineWeapon, fr, waveBox } from '../../core/weapon-kit';

export default defineWeapon({
  id: 'needle', order: 0, name: 'Игла', desc: 'Лёгкая и быстрая. Третий удар подряд — тяжёлый. В прыжке — взмах и разворот, с зарядом — волна.', reach: 1, thick: 1, atkT: 0.12, cd: 0.26, combo: 3, comboWin: 0.6, finisher: true, finT: 0.16, finCd: 0.42, dmg: 1, unlock: 'start', col: 0xf6f3e8,
  sw: {
    a1: { t: 0.14, cd: 0.3, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(58 * rm), 46, cy - 36) },
    a2: { t: 0.14, cd: 0.3, dm: 1.1, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(60 * rm), 44, cy - 26) },
    c: { t: 0.5, cd: 0.5, tot: 4.6, hits: 2, noRecoil: true, snd: 'wave', start: (sc, p, sw) => { sw.len = clipLen(sc, sw.x0, sw.y0, sw.f0, 250); }, box: waveBox },
  },
});
