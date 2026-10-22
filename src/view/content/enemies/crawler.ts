// Ползун: отрисовка.
import type { Enemy } from '../../../core/types';
import type { G } from '../../draw/common';
import { defineEnemyView } from '../regs';

function draw(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0;
  const cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1;
  const legs = Math.sin(now * 12 + e.t) * 2;
  g.lineStyle(1.6, 0x1a1a14, 1);
  for (let i = -1; i <= 1; i++) g.lineBetween(cx + i * 7, fy - 5, cx + i * 7 + (i % 2 ? legs : -legs), fy);
  g.fillStyle(fl ? 0xffffff : 0x4d6b3a, 1); g.fillEllipse(cx, fy - 9, 28, 17);
  g.fillStyle(fl ? 0xffffff : 0x6f9a4e, 1); g.fillEllipse(cx - 2 * f, fy - 12, 18, 7);
  g.fillStyle(0x3b7448, 1); g.fillCircle(cx - 6, fy - 16, 3); g.fillCircle(cx + 2, fy - 17, 2.5);
  g.fillStyle(0xffb347, 1); g.fillCircle(cx + 11 * f, fy - 7, 2.2);
}

export default defineEnemyView({ id: 'crawler', draw });
