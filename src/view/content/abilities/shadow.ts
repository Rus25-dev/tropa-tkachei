// Теневой рывок: значок, тёмный силуэт с фиолетовой каймой, тёмный след.
import { defineAbilityView } from '../regs';

export default defineAbilityView({
  id: 'shadow',
  icon: (g, cx, cy, c) => { g.strokeCircle(cx, cy, 6); g.fillStyle(0x140a2a, 1); g.fillCircle(cx + 1, cy, 4); g.lineStyle(1.5, c, 0.8); g.lineBetween(cx - 9, cy - 3, cx - 5, cy - 3); g.lineBetween(cx - 10, cy + 2, cx - 6, cy + 2); },
  trails: { 1: { col: 0x5a4aa8, a: 0.5 } },
  fx: {
    1: (g, p) => {
      g.fillStyle(0x140a2a, 0.55); g.fillEllipse(0, -14, 22, 32);
      g.lineStyle(2, 0xa28cff, 0.8); g.strokeEllipse(0, -14, 24, 34);
      for (let i = 0; i < 3; i++) { g.lineStyle(2, 0x6a5ac8, 0.5 - i * 0.12); g.lineBetween(-p.face * (14 + i * 9), -22 + i * 7, -p.face * (30 + i * 12), -20 + i * 8); }
    },
  },
});
