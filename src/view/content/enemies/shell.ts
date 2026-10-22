// Жук-панцирь: отрисовка.
import { clamp } from '../../../core/balance';
import type { Enemy } from '../../../core/types';
import type { G } from '../../draw/common';
import { defineEnemyView } from '../regs';

function draw(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0, cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1, cracked = e['armorT'] > 0, st = e['state'];
  const blink = cracked && Math.sin(now * 22) > 0;
  const plate = fl ? 0xffffff : (cracked ? 0x7a5a48 : 0x5a6470), shine = fl ? 0xffffff : (cracked ? 0xa07a5c : 0x8d9aab), rim = 0x20262e;
  if (st === 'spin') { // шар: вращающиеся швы
    const cy = fy - 16, a = now * 20 * f;
    g.fillStyle(plate, 1); g.fillCircle(cx, cy, 16); g.lineStyle(2.5, rim, 1); g.strokeCircle(cx, cy, 16);
    g.lineStyle(2, shine, 1); for (let i = 0; i < 3; i++) g.lineBetween(cx + Math.cos(a + i * 2.1) * 4, cy + Math.sin(a + i * 2.1) * 4, cx + Math.cos(a + i * 2.1) * 15, cy + Math.sin(a + i * 2.1) * 15);
    g.fillStyle(0xffe3a3, 0.5); g.fillEllipse(cx - f * 14, fy - 1, 22, 4); // след от искр
  } else {
    const wind = st === 'wind', rush = st === 'rush';
    const k = wind ? clamp(1 - e['st'] / 0.7, 0, 1) : 0, sh = wind ? Math.sin(now * 60) * 1.8 : 0, x = cx + sh;
    const lean = rush ? 3 * f : -k * 3 * f, rise = wind ? k * 5 : 0;
    g.lineStyle(2.4, rim, 1); const lg = rush ? Math.sin(now * 40) * 4 : st === 'walk' ? Math.sin(now * 9) * 2.5 : 0;
    for (let i = -1; i <= 1; i++) g.lineBetween(x + i * 12, fy - 7 - rise * 0.5, x + i * 12 + lg * (i % 2 ? 1 : -1), fy);
    g.fillStyle(plate, 1); g.fillEllipse(x + lean, fy - 14 - rise, 44, 26 + rise * 0.3);
    g.fillStyle(shine, 1); g.fillEllipse(x + lean - 4 * f, fy - 20 - rise, 26, 9);
    g.lineStyle(2, rim, 1); g.lineBetween(x + lean, fy - 26 - rise, x + lean - 2 * f, fy - 4 - rise);
    g.lineBetween(x + lean - 10, fy - 24 - rise, x + lean - 12, fy - 8 - rise); g.lineBetween(x + lean + 10, fy - 24 - rise, x + lean + 12, fy - 8 - rise);
    g.fillStyle(0xcfc6a8, 1); g.fillTriangle(x + lean + 18 * f, fy - 16 - rise, x + lean + 34 * f, fy - 22 - rise, x + lean + 20 * f, fy - 8 - rise); // рог
    g.fillStyle(wind || rush ? 0xff4d3c : 0xffb347, 1); g.fillCircle(x + lean + 15 * f, fy - 12 - rise, 2.8);
    if (st === 'stun' || st === 'tire') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 14, fy - 34 + Math.sin(now * 6 + i * 2.1) * 4, 2); }
  }
  if (cracked) { // раскалённые трещины: броню можно пробить
    g.lineStyle(2, blink ? 0xffffff : 0xffa040, 1);
    g.lineBetween(cx - 8, fy - 24, cx - 2, fy - 16); g.lineBetween(cx - 2, fy - 16, cx - 7, fy - 8); g.lineBetween(cx + 6, fy - 25, cx + 10, fy - 14);
  }
  if (e['blockT'] > 0) { g.lineStyle(2.5, 0xffffff, 0.9); g.strokeCircle(cx, fy - 14, 24 + (0.15 - e['blockT']) * 80); }
}

export default defineEnemyView({ id: 'shell', draw });
