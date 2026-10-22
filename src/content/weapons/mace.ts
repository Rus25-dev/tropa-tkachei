// Колотушка — медленная, тяжёлая, ломает броню; заряд — удар оземь.
import { ctr, defineWeapon, fr, shockBox } from '../../core/weapon-kit';

export default defineWeapon({
  id: 'mace', order: 3, name: 'Колотушка', col: 0xffc58a,
  desc: 'Очень медленная, зато каждый удар тяжёлый: огромный урон, втрое сильнее сбивает стойкость босса, ломает броню. Не отскакивает при ударе вниз. Заряд — удар оземь.',
  reach: 1, thick: 1.4, atkT: 0.22, cd: 0.7, combo: 1, comboWin: 0.6, finisher: false, finT: 0.22, finCd: 0.7, dmg: 3,
  pm: 3, kb: 1.8, recoil: 1.35, hs: 0.1, noPogo: true, unlock: 'shop:60',
  geo: { f: [58, 46, -26], u: [46, 52, 46], d: [48, 50] },
  sw: {
    g: { hits: 1, br: true, snd: 'hammer' },
    a1: { t: 0.24, cd: 0.6, dm: 1.0, hits: 1, br: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(58 * rm), 62, cy - 8) },
    a2: { t: 0.24, cd: 0.62, dm: 0.9, hits: 1, br: true, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(108 * rm), 58, cy - 30) },
    c: { t: 0.5, cd: 0.5, tot: 5.2, hits: 2, noRecoil: true, snd: 'quake', box: shockBox },
  },
  // удар оземь: сильнее трясёт, короткая заминка и пыль
  chargeShake: 0.012,
  onCharge: (sc, p) => { sc.hitstop = Math.max(sc.hitstop || 0, 0.06); sc.dustAt(12, p.x + 7, p.y + 26); },
});
