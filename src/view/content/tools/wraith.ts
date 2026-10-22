// Вопль: значок, столб нити вверх.
import { defineToolView } from '../regs';

export default defineToolView({
  id: 'wraith',
  icon: (g, cx, cy, col) => { g.lineBetween(cx, cy + 8, cx, cy - 7); g.lineStyle(1.5, col, 0.8); g.lineBetween(cx - 5, cy + 7, cx - 3, cy - 4); g.lineBetween(cx + 5, cy + 7, cx + 3, cy - 4); g.fillTriangle(cx - 4, cy - 5, cx + 4, cy - 5, cx, cy - 10); },
  ents: {
    twraith: (fx, q, now) => { // вспыхивает на каждом ударе
      const k = Math.max(0, q['life'] / (q['T'] || 1)), hit = (q['gap'] as number) > 0.06 ? 1 : 0.5;
      const cx = q['x'] + q['w'] / 2, top = q['y'], bot = q['y'] + q['h'];
      fx.fillStyle(0x9fd0ff, 0.14 * k * hit); fx.fillRect(q['x'], top, q['w'], q['h']);
      for (let i = -2; i <= 2; i++) { fx.lineStyle(i ? 1.5 : 3, i ? 0xcfe8ff : 0xffffff, 0.75 * k * hit); fx.lineBetween(cx + i * 9, bot, cx + i * 9 + Math.sin(now * 12 + i) * 5, top + (i % 2 ? 30 : 0)); }
      fx.lineStyle(2, 0xffffff, 0.8 * k); fx.strokeEllipse(cx, bot - 4, q['w'] * (1.3 - k * 0.3), 12);
    },
  },
});
