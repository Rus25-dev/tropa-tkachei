// Плевальщик: отрисовка.
import { clamp } from '../../../core/balance';
import type { Enemy } from '../../../core/types';
import type { G } from '../../draw/common';
import { defineEnemyView } from '../regs';

function draw(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0, cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1;
  const wind = e['state'] === 'wind', k = wind ? clamp(1 - e['st'] / 0.65, 0, 1) : 0, flee = e['state'] === 'flee' || e['state'] === 'hop';
  const sx = e['state'] === 'hop' ? 0.9 : 1, sh = wind ? Math.sin(now * 50) * k : 0;
  g.lineStyle(2, 0x2a3414, 1);
  const lg = flee ? Math.sin(now * 28) * 4 : 0;
  g.lineBetween(cx - 5, fy - 5, cx - 7 + lg, fy); g.lineBetween(cx + 5, fy - 5, cx + 7 - lg, fy);
  g.fillStyle(fl ? 0xffffff : 0x6f8a34, 1); g.fillEllipse(cx + sh, fy - 9, 22 * sx, 16 / sx + k * 2);
  g.fillStyle(fl ? 0xffffff : 0xa9bf5a, 1); g.fillEllipse(cx + sh - 2 * f, fy - 6, 14, 8);
  g.fillStyle(fl ? 0xffffff : (wind ? 0xd5f26a : 0x86a342), 1); g.fillCircle(cx + sh + 7 * f, fy - 10, 6 + k * 5); // щёки раздуваются
  g.fillStyle(0x15200a, 1); g.fillCircle(cx + sh + 8 * f, fy - 16, 3.2);
  g.fillStyle(flee ? 0xffffff : 0xffe36b, 1); g.fillCircle(cx + sh + 8 * f, fy - 16, 2.2);
  g.fillStyle(0x15200a, 1); g.fillCircle(cx + sh + 9 * f, fy - 16, flee ? 0.7 : 1.1);
  if (wind) { // светящийся рот и кольцо-предупреждение
    g.fillStyle(0xc7f08a, 0.5 + 0.4 * k); g.fillCircle(cx + sh + 13 * f, fy - 9, 2 + 3 * k);
    g.lineStyle(1.5, 0xc7f08a, 0.3 + 0.4 * Math.abs(Math.sin(now * 24))); g.strokeCircle(cx + 13 * f, fy - 9, 6 + 10 * k);
  }
  if (e['state'] === 'recover') { g.fillStyle(0xc7f08a, 0.7); g.fillCircle(cx + 15 * f, fy - 7 + Math.sin(now * 20), 1.6); }
}

export default defineEnemyView({ id: 'spitter', draw });
