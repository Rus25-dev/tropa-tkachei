// Жук: отрисовка.
import type { Enemy } from '../../../core/types';
import type { G } from '../../draw/common';
import { defineEnemyView } from '../regs';

function draw(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0;
  const cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1;
  const angry = e['state'] === 'wind' || e['state'] === 'charge';
  const shake = e['state'] === 'wind' ? Math.sin(now * 60) * 1.5 : 0;
  const x = cx + shake;
  g.lineStyle(2, 0x15161c, 1);
  const legs = e['state'] === 'charge' ? Math.sin(now * 30) * 3 : Math.sin(now * 10) * 2;
  for (let i = -1; i <= 1; i++) g.lineBetween(x + i * 10, fy - 6, x + i * 10 + legs * (i % 2 ? 1 : -1), fy);
  g.fillStyle(fl ? 0xffffff : 0x3d4a5c, 1); g.fillEllipse(x, fy - 12, 38, 22);
  g.fillStyle(fl ? 0xffffff : 0x56667d, 1); g.fillEllipse(x - 4 * f, fy - 16, 22, 8);
  g.fillStyle(0xcfc6a8, 1); g.fillTriangle(x + 14 * f, fy - 14, x + 30 * f, fy - 22, x + 16 * f, fy - 8);
  g.fillStyle(angry ? 0xff4d3c : 0xffb347, 1); g.fillCircle(x + 12 * f, fy - 10, 2.6);
  if (e['state'] === 'stun') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 12, fy - 30 + Math.sin(now * 6 + i * 2.1) * 4, 2); }
}

export default defineEnemyView({ id: 'beetle', draw });
