// Игла-копьё — колющий удар на огромную дистанцию; заряд — рывок-прокол.
import { defineWeapon, fr } from '../../core/weapon-kit';

export default defineWeapon({
  id: 'lance', order: 4, name: 'Игла-копьё', col: 0xcfe6ff,
  desc: 'Колющий удар на огромную дистанцию вперёд, узкий и пробивает всех на линии. Третий выпад — ещё длиннее. Заряд — рывок-прокол.',
  reach: 2.8, thick: 0.4, atkT: 0.14, cd: 0.38, combo: 3, comboWin: 0.7, finisher: true, finT: 0.18, finCd: 0.62, dmg: 1.4,
  pm: 1.05, kb: 0.85, recoil: 0.5, hs: 0.04, unlock: 'shop:40',
  geo: { f: [138, 13, -8], fh: [188, 15, -9], u: [20, 76, 70], d: [22, 62] },
  sw: {
    f: { hits: 2, snd: 'lunge' },
    a1: { t: 0.14, cd: 0.34, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(104 * rm), 44, cy - 4) },
    a2: { t: 0.14, cd: 0.34, dm: 1.0, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(126 * rm), 14, cy - 8) },
    c: { t: 0.26, cd: 0.5, tot: 4.8, hits: 2, noRecoil: true, snd: 'lunge', start: (sc, p, sw) => { p.kbx = sw.f0 * 1500; p.inv = Math.max(p.inv, 0.2); }, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(216 * rm), 17, cy - 9, 0) },
  },
});
