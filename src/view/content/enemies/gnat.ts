// Комар: отрисовка.
import type { Enemy } from '../../../core/types';
import type { G } from '../../draw/common';
import { defineEnemyView } from '../regs';

function draw(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0;
  const cx = e.x + e.w / 2, f = e.face || 1;
  const cy = e.y + 9, wing = Math.sin(now * 50 + e.t) > 0;
  g.fillStyle(0xd8f0e8, wing ? 0.55 : 0.25); g.fillEllipse(cx - 5, cy - 9, 12, 7); g.fillEllipse(cx + 5, cy - 9, 12, 7);
  g.fillStyle(fl ? 0xffffff : 0x6b4a6e, 1); g.fillCircle(cx, cy, 8);
  g.fillStyle(fl ? 0xffffff : 0x8d6a90, 1); g.fillEllipse(cx - 2 * f, cy - 3, 8, 4);
  g.fillStyle(0x2a1c2c, 1); g.fillTriangle(cx - 6 * f, cy + 2, cx - 14 * f, cy + 6, cx - 5 * f, cy + 6);
  g.fillStyle(0xff7a6b, 1); g.fillCircle(cx + 4 * f, cy - 1, 2.2);
}

export default defineEnemyView({ id: 'gnat', draw });
