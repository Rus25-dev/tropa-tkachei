// Нитяная бомба: значок, бомба с фитилём, взрыв.
import { defineToolView } from '../regs';

export default defineToolView({
  id: 'threadbomb',
  icon: (g, cx, cy) => { g.strokeCircle(cx, cy + 2, 6); g.lineBetween(cx + 3, cy - 3, cx + 6, cy - 8); g.fillCircle(cx + 7, cy - 9, 1.6); },
  ents: {
    tbomb: (fx, q, now, x, y) => {
      const fuse = q['fuse'], pul = 1 + Math.sin(now * (14 + (0.9 - fuse) * 30)) * 0.12;
      fx.fillStyle(0xffd47a, 0.2); fx.fillCircle(x, y, 11 * pul);
      fx.fillStyle(0xe9e2cf, 1); fx.fillCircle(x, y, 6.5 * pul);
      fx.lineStyle(1.5, 0x8a7a55, 1); fx.beginPath(); fx.arc(x, y, 5, 0.3, 2.6, false); fx.strokePath(); fx.beginPath(); fx.arc(x, y, 5, 3.4, 5.7, false); fx.strokePath();
      fx.fillStyle(0xff9a3c, 1); fx.fillCircle(x + 3, y - 8, 2 + Math.sin(now * 30) * 0.6);
    },
  },
  fx: {
    boom: (fx, f, k) => {
      const r = 90 * (1 - k * k);
      fx.fillStyle(0xffe3a3, 0.22 * k); fx.fillCircle(f['x'], f['y'], r);
      fx.lineStyle(4, 0xffffff, k); fx.strokeCircle(f['x'], f['y'], r);
      fx.lineStyle(2, 0xffd47a, k); fx.strokeCircle(f['x'], f['y'], r * 0.7);
    },
  },
});
