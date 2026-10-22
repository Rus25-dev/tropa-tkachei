// Нитяной снаряд: значок, светящийся клубок с хвостом.
import { defineToolView } from '../regs';

export default defineToolView({
  id: 'spirit',
  icon: (g, cx, cy, col) => { g.fillCircle(cx + 3, cy, 4); g.lineStyle(2, col, 0.7); g.lineBetween(cx - 8, cy - 3, cx - 2, cy - 1); g.lineBetween(cx - 8, cy + 3, cx - 2, cy + 1); },
  ents: {
    tspirit: (fx, q, now, x, y) => {
      const f = q['f'] as number, pul = 1 + Math.sin(now * 30) * 0.1;
      for (let i = 1; i <= 4; i++) { fx.fillStyle(0xcfe8ff, 0.32 - i * 0.06); fx.fillEllipse(x - f * i * 11, y, 22 - i * 3, 12 - i * 1.6); }
      fx.fillStyle(0x9fd0ff, 0.28); fx.fillCircle(x, y, 17 * pul);
      fx.fillStyle(0xffffff, 1); fx.fillCircle(x, y, 7 * pul);
      fx.lineStyle(1.6, 0xcfe8ff, 0.9); fx.beginPath(); fx.arc(x, y, 11, now * 9, now * 9 + 4, false); fx.strokePath();
    },
  },
});
