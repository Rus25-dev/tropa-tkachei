// Метательная игла: значок, летящая/воткнутая игла.
import { defineToolView } from '../regs';

export default defineToolView({
  id: 'throwneedle',
  icon: (g, cx, cy, col) => { g.lineBetween(cx - 7, cy + 7, cx + 7, cy - 7); g.fillTriangle(cx + 8, cy - 8, cx + 3, cy - 6, cx + 6, cy - 3); g.lineStyle(1, col, 0.6); g.lineBetween(cx - 7, cy + 7, cx - 11, cy + 11); },
  ents: {
    tneedle: (fx, q, now, x, y) => {
      const st = q['st'], ang = q['ang'];
      const ux = Math.cos(ang), uy = Math.sin(ang), L = 13, vib = st === 2 ? Math.sin(now * 60) * 1.2 : 0;
      if (st === 1 || st === 4) { fx.fillStyle(0xffe3a3, 0.12 + Math.sin(now * 5) * 0.06); fx.fillCircle(x, y, 15); }
      if (st === 0) { fx.lineStyle(1.5, 0xffe3a3, 0.45); fx.lineBetween(x - ux * L, y - uy * L, x - ux * (L + 14), y - uy * (L + 14)); }
      fx.lineStyle(2.5, 0xf6f3e8, 1); fx.lineBetween(x - ux * L + vib, y - uy * L, x + ux * L + vib, y + uy * L);
      fx.fillStyle(0xffffff, 1); fx.fillCircle(x + ux * L + vib, y + uy * L, 2);
      fx.fillStyle(0xffd47a, 1); fx.fillCircle(x - ux * L, y - uy * L, 2);
    },
  },
});
