// Нырок: значок и ударная волна приземления.
import { KIT } from '../../../core/balance';
import { defineToolView } from '../regs';

export default defineToolView({
  id: 'dive',
  icon: (g, cx, cy) => { g.lineBetween(cx, cy - 8, cx, cy + 3); g.fillTriangle(cx - 6, cy + 1, cx + 6, cy + 1, cx, cy + 9); },
  fx: {
    shock: (fx, f, k) => { // волна нырка: две стороны по земле
      const R = KIT.DIVE.R * (1 - k * k * 0.6), fy = f['y'];
      for (const s of [-1, 1]) {
        const x = f['x'] + s * R;
        fx.fillStyle(0xcfe8ff, 0.8 * k); fx.fillTriangle(x, fy, x - s * 30, fy - 6, x - s * 18, fy - 36 * (0.4 + 0.6 * k));
        fx.fillStyle(0xffffff, 0.6 * k); fx.fillTriangle(x - s * 34, fy, x - s * 56, fy - 5, x - s * 46, fy - 20 * k);
      }
      fx.lineStyle(3, 0xffffff, 0.8 * k); fx.lineBetween(f['x'] - R, fy - 1, f['x'] + R, fy - 1);
      fx.fillStyle(0xcfe8ff, 0.25 * k); fx.fillEllipse(f['x'], fy - 4, R * 2, 24);
    },
  },
});
