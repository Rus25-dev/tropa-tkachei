// Воздушная вспышка: значок-звезда, полосы против направления, голубой след.
import { defineAbilityView } from '../regs';

export default defineAbilityView({
  id: 'flash',
  icon: (g, cx, cy) => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const) g.lineBetween(cx + dx * 2.5, cy + dy * 2.5, cx + dx * 8, cy + dy * 8); g.fillCircle(cx, cy, 2); },
  trails: { 2: { col: 0x7fd8ff, a: 0.35 } },
  fx: {
    2: (g, p, now) => {
      const fl = p['fl'] as { dx: number; dy: number } | null; if (!fl) return;
      const pulse = 0.6 + 0.4 * Math.sin(now * 40), ux = fl.dx, uy = fl.dy;
      for (let i = -1; i <= 1; i++) { g.lineStyle(2.4, i ? 0x7fd8ff : 0xffffff, 0.8); g.lineBetween(-ux * 6 - uy * i * 7, -14 - uy * 6 + ux * i * 7, -ux * 34 - uy * i * 7, -14 - uy * 34 + ux * i * 7); }
      g.lineStyle(2, 0xffffff, 0.7); g.strokeCircle(0, -14, 15 + pulse * 3);
    },
  },
});
