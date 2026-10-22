// Парные иглы: две рукояти за спиной, вихрь-финишер, шквал заряда.
import { band } from '../../draw/common';
import { defineWeaponView } from '../regs';

export default defineWeaponView({
  id: 'twin', chargePitch: 320,
  back: (g, f, y0, bob, col) => {
    g.lineStyle(1.7, 0xcfd6dc, 1); g.lineBetween(-6 * f, y0, -14 * f, -25 - bob); g.lineBetween(-6 * f, y0 - 3, -16 * f, -19 - bob);
    g.lineStyle(1, col, 0.95); g.strokeCircle(-14 * f, -26 - bob, 1.8); g.strokeCircle(-17 * f, -19 - bob, 1.8);
  },
  pull: (g, f, jx) => { g.lineBetween(-4 * f, -11, -20 * f + jx, -11); },
  charge: (fx, { el, k, cx, cy, col, acc }) => { // шквал: три вращающихся кольца
    const t0 = el * 26;
    for (let i = 0; i < 3; i++) band(fx, cx, cy, 0, 1, t0 + i * 2.09, t0 + i * 2.09 + 1.5, 50 + i * 2, 7, i === 1 ? acc : col, 0.8 * (0.4 + 0.6 * k));
    fx.lineStyle(2, 0xffffff, 0.6 * k); fx.strokeCircle(cx, cy, 36 + 22 * Math.sin(el * Math.PI));
  },
  swing: (fx, { p, sw, el, k, cx, cy, ox, oy, th, f, dir, col, acc }) => {
    if (sw.k === 'f') { // вихрь
      const t0 = el * 18;
      for (let i = 0; i < 3; i++) band(fx, cx, cy, 0, 1, t0 + i * 2.09, t0 + i * 2.09 + 1.45, 46, 8, i === 1 ? acc : col, 0.85 * k);
      fx.lineStyle(2, 0xffffff, 0.7 * k); fx.strokeCircle(cx, cy, 30 + 20 * el);
    } else if (sw.k === 'a2') {
      band(fx, cx, cy, 0, 1, el * 12, el * 12 + 3.6, 40, 9, col, 0.85 * k); fx.lineStyle(2, acc, 0.8 * k); fx.strokeCircle(cx, cy, 30 + 10 * el);
    } else {
      const j = (sw.k === 'a1' ? 0.7 : 0.25) * (((p['combo'] as number) || 0) % 2 ? 1 : -1);
      band(fx, ox, oy, th, f, -0.85 + j * 0.3, 0.85 + j * 0.3, 32, 9, col, 0.9 * k); band(fx, ox, oy + (dir === 'f' ? 7 : 0), th, f, -0.7, 0.7 - j * 0.3, 25, 6, acc, 0.75 * k);
      if (sw.k === 'a1') { fx.lineStyle(2, 0xffffff, 0.8 * k); fx.lineBetween(ox + f * 6, oy - 10, ox + f * 40, oy + 10); fx.lineBetween(ox + f * 6, oy + 10, ox + f * 40, oy - 10); }
    }
  },
});
