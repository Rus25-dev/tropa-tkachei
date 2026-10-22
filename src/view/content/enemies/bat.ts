// Мышь: отрисовка.
import { clamp } from '../../../core/balance';
import type { Enemy } from '../../../core/types';
import type { G } from '../../draw/common';
import { defineEnemyView } from '../regs';

function draw(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0, cx = e.x + e.w / 2, cy = e.y + e.h / 2, f = e.face || 1, st = e['state'];
  if (st === 'roost') { // висит вниз головой, крылья сложены
    g.fillStyle(0x2a2233, 1); g.fillEllipse(cx, cy + 2, 10, 14); g.fillTriangle(cx - 5, cy - 4, cx - 12, cy + 8, cx - 1, cy + 8); g.fillTriangle(cx + 5, cy - 4, cx + 12, cy + 8, cx + 1, cy + 8);
    g.fillStyle(0x5a3f66, 1); g.fillCircle(cx, cy + 8, 4); g.fillStyle(0xff9a7a, 0.7); g.fillCircle(cx - 1.5, cy + 9, 1); g.fillCircle(cx + 1.5, cy + 9, 1);
    return;
  }
  const wind = st === 'wind', dive = st === 'dive', k = wind ? clamp(1 - e['st'] / 0.55, 0, 1) : 0;
  const flap = dive ? 0.3 : Math.sin(now * (wind ? 38 : 24) + e['k'] * 2), sh = wind ? Math.sin(now * 70) * 1.6 * k : 0, x = cx + sh;
  if (dive) { g.lineStyle(2, 0xff7a6b, 0.35); g.lineBetween(x, cy, x - (e.vx || 0) * 0.07, cy - (e.vy || 0) * 0.07); }
  g.fillStyle(fl ? 0xffffff : 0x3a2a48, 1);
  g.fillTriangle(x - 3, cy - 2, x - 20, cy - 8 - flap * 9, x - 14, cy + 6); g.fillTriangle(x + 3, cy - 2, x + 20, cy - 8 - flap * 9, x + 14, cy + 6);
  g.fillStyle(fl ? 0xffffff : 0x5a3f66, 1); g.fillEllipse(x, cy, 12, 14);
  g.fillTriangle(x - 5, cy - 6, x - 3, cy - 12, x - 1, cy - 6); g.fillTriangle(x + 5, cy - 6, x + 3, cy - 12, x + 1, cy - 6);
  g.fillStyle(wind || dive ? 0xff3a2a : 0xffb347, 1); g.fillCircle(x - 2 * f + 1, cy - 2, 1.8); g.fillCircle(x + 3 * f, cy - 2, 1.8);
  if (wind) { g.lineStyle(1.5, 0xff3a2a, 0.3 + 0.5 * k); g.strokeCircle(x, cy, 10 + 8 * k); }
}

export default defineEnemyView({ id: 'bat', draw });
