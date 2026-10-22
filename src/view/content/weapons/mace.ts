// Колотушка: булава за спиной, тяжёлые дуги со вспышкой, ударная волна заряда.
import { band, edge, ease } from '../../draw/common';
import { defineWeaponView } from '../regs';

export default defineWeaponView({
  id: 'mace', chargePitch: 110,
  back: (g, f, y0, bob) => {
    g.lineStyle(2.6, 0x8a6a46, 1); g.lineBetween(-6 * f, y0 + 1, -14 * f, -24 - bob);
    g.fillStyle(0xd0b080, 1); g.fillCircle(-15 * f, -27 - bob, 4.6); g.lineStyle(1.2, 0x6b4f2a, 1); g.strokeCircle(-15 * f, -27 - bob, 4.6);
    g.fillStyle(0x6b4f2a, 1); g.fillCircle(-17 * f, -28 - bob, 1); g.fillCircle(-13 * f, -26 - bob, 1);
  },
  pull: (g, f, jx) => { g.fillStyle(0xd0b080, 1); g.fillCircle(-26 * f + jx, -15, 6); g.lineStyle(1.2, 0x6b4f2a, 1); g.strokeCircle(-26 * f + jx, -15, 6); },
  charge: (fx, { sw, el, k, col }) => { // удар оземь: ударная волна по земле в обе стороны
    const half = 200 * Math.min(1, el / 0.5) + 10, fy = sw.fy;
    for (const s of [-1, 1]) {
      const x = sw.x0 + s * half;
      fx.fillStyle(col, 0.85 * k); fx.fillTriangle(x, fy, x - s * 30, fy - 8, x - s * 18, fy - 34 * (0.4 + 0.6 * k));
      fx.fillStyle(0xffffff, 0.6 * k); fx.fillTriangle(x - s * 34, fy, x - s * 56, fy - 6, x - s * 46, fy - 22 * k);
    }
    fx.lineStyle(3, 0xffffff, 0.8 * k); fx.lineBetween(sw.x0 - half, fy - 1, sw.x0 + half, fy - 1);
    fx.fillStyle(col, 0.3 * k); fx.fillEllipse(sw.x0, fy - 4, half * 2, 26);
  },
  swing: (fx, { sw, el, k, cx, cy, ox, oy, th, f, dir, col, box }) => {
    if (sw.k === 'a2') { band(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.9, 46, 24, col, 0.88 * k); fx.lineStyle(3, 0xffffff, 0.7 * k); fx.strokeCircle(cx, cy, 46 + 8 * el); }
    else {
      const cur = -1.1 + 2.2 * ease(Math.min(1, el * 2)), R = 44 + (dir === 'f' ? 0 : 6);
      band(fx, ox, oy, th, f, -1.1, cur, R, 28, col, 0.92 * k + 0.08); edge(fx, ox, oy, th, f, -1.1, cur, R + 1, 3, 0xffffff, 0.9 * k);
      if (el > 0.25) { // вспышка в точке удара
        const hx = box.x + (dir === 'f' ? (f > 0 ? box.w : 0) : box.w / 2), hy = box.y + (dir === 'u' ? 6 : dir === 'd' ? box.h - 6 : box.h / 2);
        fx.lineStyle(3, 0xffffff, 0.8 * k); for (let i = 0; i < 6; i++) { const an = i * 1.05 + el * 2; fx.lineBetween(hx + Math.cos(an) * 6, hy + Math.sin(an) * 6, hx + Math.cos(an) * 18, hy + Math.sin(an) * 18); }
      }
    }
  },
});
