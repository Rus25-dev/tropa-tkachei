// Игла-копьё: древко за спиной, длинные уколы, рывок-прокол заряда.
import { defineWeaponView } from '../regs';

export default defineWeaponView({
  id: 'lance', chargePitch: 260,
  back: (g, f, _y0, bob, col) => {
    g.lineStyle(1.8, 0xcfd6dc, 1); g.lineBetween(-7 * f, -4 - bob, -20 * f, -37 - bob);
    g.fillStyle(0xffffff, 1); g.fillTriangle(-20 * f, -37 - bob, -17 * f, -45 - bob, -23 * f, -42 - bob);
    g.lineStyle(1, col, 0.9); g.strokeCircle(-9 * f, -8 - bob, 2);
  },
  pull: (g, f) => { g.lineBetween(-4 * f, -15, 8 * f, -15); g.fillStyle(0xffffff, 1); g.fillTriangle(-26 * f, -17, -26 * f, -13, -34 * f, -15); },
  charge: (fx, { sw, k, col, acc, box }) => { // рывок-прокол — длинный росчерк
    const xa = sw.f0 > 0 ? box.x : box.x + box.w, xb = sw.f0 > 0 ? box.x + box.w : box.x, yy = box.y + box.h / 2;
    fx.fillStyle(col, 0.5 * k); fx.fillTriangle(xa, yy - 9, xa, yy + 9, xb, yy);
    fx.fillStyle(0xffffff, 0.9 * k); fx.fillTriangle(xa, yy - 3, xa, yy + 3, xb, yy);
    fx.lineStyle(2, acc, 0.8 * k); for (let i = -1; i <= 1; i += 2) fx.lineBetween(xa + sw.f0 * 10, yy + i * 14, xa + sw.f0 * 90, yy + i * 4);
  },
  swing: (fx, { sw, el, k, cx, f, dir, col, acc, box }) => {
    if (dir === 'f') {
      const xa = cx + f * 8, xb = box.x + (f > 0 ? box.w : 0), yy = box.y + box.h / 2, tx = xa + (xb - xa) * Math.min(1, el * 3.4 + 0.25), hh = (sw.k === 'f' ? 8 : 6) * (0.5 + 0.5 * k);
      fx.fillStyle(col, 0.7 * k + 0.1); fx.fillTriangle(xa, yy - hh, xa, yy + hh, tx, yy);
      fx.fillStyle(0xffffff, 0.95 * k); fx.fillTriangle(xa, yy - hh * 0.35, xa, yy + hh * 0.35, tx, yy);
      fx.fillStyle(acc, 0.8 * k); fx.fillCircle(tx, yy, 4 + 3 * k);
      if (sw.k === 'a1' || sw.k === 'a2') { fx.lineStyle(2, acc, 0.7 * k); fx.lineBetween(xa + f * 20, yy - 14, xa + f * 70, yy - 6); fx.lineBetween(xa + f * 20, yy + 14, xa + f * 70, yy + 6); }
    } else {
      const xm = box.x + box.w / 2, y0 = dir === 'u' ? box.y + box.h : box.y, y1 = dir === 'u' ? box.y : box.y + box.h, ty = y0 + (y1 - y0) * Math.min(1, el * 3.4 + 0.25);
      fx.fillStyle(col, 0.7 * k + 0.1); fx.fillTriangle(xm - 6, y0, xm + 6, y0, xm, ty); fx.fillStyle(0xffffff, 0.95 * k); fx.fillTriangle(xm - 2, y0, xm + 2, y0, xm, ty);
    }
  },
});
