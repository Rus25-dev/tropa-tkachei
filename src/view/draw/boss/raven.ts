// Рисунок Ворона-тирана: base — наземное тело (фаза 1), wings — крылатая форма (фаза 2), fury — ярость (фаза 3), creature:silkorb — шар нити.
// Телеграф (контур замаха, места ударов, окно наказания) рисует общий код поверх тела: рисунок цветом замаха не подменяет сигнал.
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { DrawCtx } from '../bossdraw';
import { INK, pts, type G } from '../common';

const BLACK = 0x15131c, FEATHER = 0x2b2838, BEAK = 0xe0b04a;

/** общий торс и голова-клюв; wing — размах крыльев 0…1, rage — красные глаза и гребень */
function raven(b: Boss, g: G, now: number, c: DrawCtx, wing: number, rage: boolean, body: number): void {
  const f = b.face, cx = b.x + b.w / 2 + c.lean, fl = b.flash > 0;
  const fy = b.y + b.h, top = b.y;
  const main = fl ? 0xffffff : body, dark = fl ? 0xffffff : BLACK;
  const walk = Math.abs(b.vx) > 5 && b.state !== 'active' ? Math.sin(now * 12) * 4 : 0;
  const hunch = c.tell ? 6 * c.k : 0;
  if (wing < 0.5) { // ноги
    g.lineStyle(5, BLACK, 1);
    g.lineBetween(cx - 9, fy - 22, cx - 9 + walk, fy); g.lineBetween(cx + 9, fy - 22, cx + 9 - walk, fy);
  }
  // крылья за спиной: сложенные — низкая тень, раскрытые — веер пера
  const sp = wing * (b.w * 0.55) + 14, flap = Math.sin(now * (wing > 0.5 ? 9 : 2)) * (wing > 0.5 ? 12 : 2);
  for (const side of [-1, 1] as const) {
    const sx = cx - side * f * 6, sy = top + b.h * 0.36;
    const tipx = sx - side * f * sp, tipy = sy - (wing > 0.5 ? 20 : 4) - flap * side * 0.4;
    g.fillStyle(main, 1);
    g.fillPoints(pts([{ x: sx, y: sy - 8 }, { x: tipx, y: tipy }, { x: tipx + side * f * 8, y: tipy + 20 + flap }, { x: sx, y: sy + 14 }]), true);
    g.lineStyle(2, dark, 1);
    for (let i = 1; i <= 3; i++) g.lineBetween(sx - side * f * 2, sy + i * 2, tipx + side * f * (i * 3), tipy + 10 + i * 5 + flap * 0.5);
  }
  // тело
  g.fillStyle(main, 1); g.fillEllipse(cx, top + b.h * 0.58 + hunch * 0.3, b.w * (wing > 0.5 ? 0.72 : 0.9), b.h * 0.62);
  g.fillStyle(dark, 1); g.fillEllipse(cx + 3 * f, top + b.h * 0.66 + hunch * 0.3, b.w * 0.5, b.h * 0.34);
  // голова и клюв
  const hx = cx + 12 * f + c.lean * 0.5, hy = top + b.h * 0.2 + hunch;
  g.fillStyle(main, 1); g.fillCircle(hx, hy, 15);
  g.fillStyle(BEAK, 1); g.fillPoints(pts([{ x: hx + 10 * f, y: hy - 4 }, { x: hx + 30 * f, y: hy + 3 }, { x: hx + 10 * f, y: hy + 7 }]), true);
  g.fillStyle(rage ? 0xff4a3a : 0xffe08a, 1); g.fillCircle(hx + 5 * f, hy - 3, 3.2);
  g.fillStyle(INK, 1); g.fillCircle(hx + 6 * f, hy - 3, 1.4);
  if (rage) { // гребень и жар
    g.fillStyle(0xff7a3a, 0.9);
    for (let i = 0; i < 3; i++) g.fillPoints(pts([{ x: hx - (4 + i * 5) * f, y: hy - 12 }, { x: hx - (8 + i * 6) * f, y: hy - 26 - i * 2 - Math.sin(now * 14 + i) * 3 }, { x: hx - (12 + i * 5) * f, y: hy - 10 }]), true);
  }
  if (b.stagger > 0) { g.fillStyle(0xffe3a3, 0.9); for (let i = 0; i < 4; i++) g.fillCircle(cx + Math.cos(now * 5 + i * 1.6) * 28, top - 10 + Math.sin(now * 5 + i * 1.6) * 6, 2.5); }
}

export default {
  base(_w: World, b: Boss, g: G, now: number, c: DrawCtx): void { raven(b, g, now, c, 0, false, FEATHER); },
  wings(_w: World, b: Boss, g: G, now: number, c: DrawCtx): void { raven(b, g, now, c, 1, false, 0x3a3650); },
  fury(_w: World, b: Boss, g: G, now: number, c: DrawCtx): void { raven(b, g, now, c, 0.35, true, 0x4a2430); },
  'creature:silkorb'(e: { x: number; y: number; w: number; h: number; face: number; flash: number; hp: number; m: Record<string, unknown> }, g: G, now: number, c: { color: number; alpha: number; tell: boolean; rgb: number }): void {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, pulse = 0.5 + Math.sin(now * 6) * 0.5;
    g.fillStyle(c.color, 0.18 * c.alpha); g.fillCircle(cx, cy, 16 + pulse * 4);
    g.fillStyle(0xffffff, 0.9 * c.alpha); g.fillCircle(cx, cy, 8);
    g.fillStyle(c.color, c.alpha); g.fillCircle(cx, cy, 6);
    g.lineStyle(1.5, 0xffffff, 0.8 * c.alpha); g.strokeCircle(cx, cy, 11 + pulse * 2);
  },
};
