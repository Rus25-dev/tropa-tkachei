// Серп: лезвие за спиной, широкие дуги, «жатва» заряда.
import { band, edge, ease } from '../../draw/common';
import { defineWeaponView } from '../regs';

const PI = Math.PI;
export default defineWeaponView({
  id: 'sickle', chargePitch: 170,
  back: (g, f, y0, bob, col) => {
    g.lineStyle(2, 0xcfd6dc, 1); g.lineBetween(-6 * f, y0 + 2, -13 * f, -27 - bob);
    g.lineStyle(2.6, col, 1); g.beginPath(); g.moveTo(-13 * f, -27 - bob); g.lineTo(-10 * f, -33 - bob); g.lineTo(-3 * f, -35 - bob); g.lineTo(0, -31 - bob); g.strokePath();
  },
  pull: (g, f) => { g.lineBetween(-24 * f, -15, -30 * f, -23); g.lineBetween(-30 * f, -23, -24 * f, -29); },
  charge: (fx, { sw, el, k, cx, cy, th0, col, acc }) => { // жатва: гигантский взмах от затылка через верх вперёд
    const cur = -2.5 + 3.4 * ease(Math.min(1, el * 1.5)), r0 = Math.max(-2.5, cur - 1.9), cxx = cx - sw.f0 * 8, cyy = cy + 10;
    band(fx, cxx, cyy, th0, sw.f0, r0, cur, 88, 34, col, 0.9 * k + 0.1); band(fx, cxx, cyy, th0, sw.f0, r0 + 0.5, cur, 70, 10, 0xffffff, 0.7 * k);
    edge(fx, cxx, cyy, th0, sw.f0, r0, cur, 90, 3, acc, k);
  },
  swing: (fx, { sw, el, k, cx, cy, ox, oy, th, f, dir, col, acc }) => {
    if (sw.k === 'a2') { const cur = -PI / 2 + el * PI * 2; band(fx, cx, cy - 6, 0, 1, cur - 2.6, cur, 62, 20, col, 0.9 * k); edge(fx, cx, cy - 6, 0, 1, cur - 2.6, cur, 63, 2.5, 0xffffff, k); }
    else if (dir === 'f') {
      const a = sw.k === 'a1' ? [-1.2, 1.3] : [-2.2, 0.55], cur = a[0]! + (a[1]! - a[0]!) * ease(Math.min(1, el * 1.4)), r0 = Math.max(a[0]!, cur - 1.5);
      const cxx = cx - f * 6, cyy = cy + (sw.k === 'a1' ? -4 : 10), R = sw.k === 'f' ? 76 : 68;
      band(fx, cxx, cyy, th, f, r0, cur, R, 24, col, 0.92 * k + 0.08); band(fx, cxx, cyy, th, f, r0 + 0.3, cur, R - 6, 6, 0xffffff, 0.75 * k);
      edge(fx, cxx, cyy, th, f, r0, cur, R + 1, 2.4, acc, k);
    } else {
      const cur = -1.4 + 2.8 * ease(Math.min(1, el * 1.4)); band(fx, ox, oy, th, 1, -1.4, cur, 60, 20, col, 0.9 * k + 0.1); edge(fx, ox, oy, th, 1, -1.4, cur, 61, 2.4, acc, k);
    }
  },
});
