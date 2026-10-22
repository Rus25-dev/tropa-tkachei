// Засадник: отрисовка.
import { E2_UNDER, clamp } from '../../../core/balance';
import type { Enemy } from '../../../core/types';
import type { G } from '../../draw/common';
import { defineEnemyView } from '../regs';

function draw(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0, cx = e.x + e.w / 2, st = e['state'], f = e.face || 1;
  const fy: number = E2_UNDER.includes(st) ? e.y - 50 : e['fy']; // уровень пола (view не меняет состояние ядра)
  if (st === 'hidden') { // еле заметные трещинки и пыль
    g.lineStyle(1.5, 0x1b120a, 0.5); g.lineBetween(cx - 12, fy, cx - 4, fy - 1.5); g.lineBetween(cx + 3, fy - 1, cx + 13, fy);
    g.fillStyle(0x6b5a44, 0.35); g.fillEllipse(cx, fy - 1, 22, 3);
    return;
  }
  if (st === 'track') { // ползущий бугор
    const w = 30 + Math.sin(now * 20) * 3;
    g.fillStyle(0x4a3a2a, 0.9); g.fillEllipse(cx, fy - 2, w, 8); g.fillStyle(0x7a6850, 0.8); g.fillEllipse(cx, fy - 4, w * 0.6, 4);
    g.lineStyle(1.5, 0x2a1d10, 0.8); for (let i = -2; i <= 2; i++) g.lineBetween(cx + i * 7, fy - 1, cx + i * 9, fy + 2);
    return;
  }
  if (st === 'warn') { // красная печать, трещины, камешки
    const k = clamp(1 - e['st'] / 0.75, 0, 1), p = Math.abs(Math.sin(now * (14 + 14 * k)));
    g.fillStyle(0xd23a2a, 0.15 + 0.25 * p); g.fillEllipse(cx, fy - 1, 54, 12);
    g.lineStyle(2, 0xff5a3a, 0.5 + 0.5 * p); g.strokeEllipse(cx, fy - 1, 54 * (0.6 + 0.4 * k), 12);
    g.lineStyle(2, 0x1b120a, 1); for (let i = 0; i < 5; i++) { const a = i * 1.25 - 2.5; g.lineBetween(cx, fy, cx + Math.cos(a) * 26, fy + Math.sin(a) * 5); }
    g.fillStyle(0x7a6850, 1); for (let i = 0; i < 4; i++) g.fillRect(cx - 14 + i * 9, fy - 3 - k * 10 * ((i * 37) % 5 / 5 + 0.3) - Math.abs(Math.sin(now * 18 + i)) * 3, 3, 3);
    return;
  }
  // тело: присел перед броском / дигинг (сплющивается в землю) / обычное
  let sy = 1, by = e.y + e.h;
  if (st === 'dig') { sy = clamp(e['st'] / 0.5, 0.05, 1); by = fy; }
  if (st === 'tell') sy = 0.8 + 0.1 * Math.sin(now * 50);
  const h = 24 * sy, y0 = by - h, sh = st === 'tell' ? Math.sin(now * 60) * 1.4 : 0, x = cx + sh;
  g.fillStyle(fl ? 0xffffff : 0x7a5434, 1); g.fillEllipse(x, y0 + h * 0.6, 28, h * 0.9);
  g.fillStyle(fl ? 0xffffff : 0xa87a4c, 1); g.fillEllipse(x - 3 * f, y0 + h * 0.4, 16, h * 0.35);
  g.fillStyle(fl ? 0xffffff : 0x4a3220, 1); for (let i = -1; i <= 1; i++) g.fillTriangle(x + i * 8 - 3, y0 + h * 0.3, x + i * 8 + 3, y0 + h * 0.3, x + i * 8, y0 - 5 * sy);
  g.fillStyle(0x1b120a, 1); g.fillEllipse(x + 8 * f, y0 + h * 0.65, 9, 7 * sy); // пасть
  g.fillStyle(st === 'tell' || st === 'pounce' || st === 'erupt' ? 0xff3a2a : 0xffe36b, 1); g.fillCircle(x + 7 * f, y0 + h * 0.35, 2.2);
  if (st === 'tired') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 12, y0 - 8 + Math.sin(now * 6 + i * 2.1) * 3, 2); }
}

export default defineEnemyView({ id: 'lurker', draw });
