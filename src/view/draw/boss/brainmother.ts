// Рисунок «Мозг-матери»: колонна-механизм, стеклянный купол с мозгом (base), разбитый купол (shattered), исступление (frenzy), кольцо-страж.
// Телеграф, места ударов, окно наказания и уязвимое ядро рисует общий код поверх тела: здесь только облик.
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { BossDrawFn, CreatureDrawFn, DrawCtx } from '../bossdraw';
import type { G } from '../common';

/** общая часть: основание, колонна, провода, мозг под куполом; glass — прозрачность стекла (0 — купол разбит), glow — яркость пульса */
function body(b: Boss, g: G, now: number, c: DrawCtx, glass: number, glow: number): void {
  const cx = b.x + b.w / 2, fy = b.y + b.h, fl = b.flash > 0, hot = c.tell ? c.rgb : 0xb877ff;
  const metal = fl ? 0xffffff : 0x3a3f4d, trim = fl ? 0xffffff : 0x59607a;
  // основание и колонна
  g.fillStyle(0x1b1e27, 1); g.fillRect(cx - b.w / 2 - 8, fy - 14, b.w + 16, 14);
  g.fillStyle(metal, 1); g.fillRoundedRect(cx - b.w / 2 + 6, b.y + 78, b.w - 12, b.h - 90, 6);
  g.fillStyle(trim, 1); g.fillRect(cx - b.w / 2 + 6, b.y + 98, b.w - 12, 4); g.fillRect(cx - b.w / 2 + 6, b.y + 172 - 20, b.w - 12, 4);
  // провода к полу
  g.lineStyle(3, 0x23262e, 1);
  for (const s of [-1, 1]) { g.lineBetween(cx + s * 20, fy - 14, cx + s * 54, fy - 4); g.lineBetween(cx + s * 40, b.y + 90, cx + s * 64, fy - 30); }
  // мозг: две дольки, пульсирует
  const pul = 1 + Math.sin(now * (c.tell ? 14 : 4)) * 0.05 * (1 + glow), by = b.y + 46;
  g.fillStyle(fl ? 0xffffff : c.e.color, 1);
  g.fillEllipse(cx - 14, by, 46 * pul, 40 * pul); g.fillEllipse(cx + 14, by, 46 * pul, 40 * pul);
  g.lineStyle(2, 0x3d2a5a, 0.8); g.lineBetween(cx, by - 18, cx, by + 16);
  for (let i = -1; i <= 1; i++) { g.lineBetween(cx - 26, by + i * 8, cx - 4, by + i * 8 + 3); g.lineBetween(cx + 4, by + i * 8 + 3, cx + 26, by + i * 8); }
  // глаз на колонне, смотрит на героя
  g.fillStyle(0x10141a, 1); g.fillCircle(cx, b.y + 128, 12);
  g.fillStyle(hot, 0.6 + 0.4 * Math.sin(now * 6) * 0.5); g.fillCircle(cx + b.face * -3, b.y + 128, 6);
  // стекло
  if (glass > 0) {
    g.fillStyle(0x9fd8ff, 0.14 * glass); g.fillEllipse(cx, by, 84, 76);
    g.lineStyle(3, 0xcfeaff, 0.7 * glass); g.strokeEllipse(cx, by, 84, 76);
    g.lineStyle(1, 0xffffff, 0.5 * glass); g.lineBetween(cx - 26, by - 22, cx - 12, by - 30);
  } else {
    g.lineStyle(2, 0xcfeaff, 0.6); // осколки купола
    g.lineBetween(cx - 42, by + 4, cx - 30, by - 22); g.lineBetween(cx + 42, by + 4, cx + 30, by - 20); g.lineBetween(cx - 42, by + 4, cx - 34, by + 20);
  }
}

const base: BossDrawFn = (_w: World, b, g, now, c) => body(b, g, now, c, 1, 0);
const shattered: BossDrawFn = (_w: World, b, g, now, c) => body(b, g, now, c, 0, 0.5);
const frenzy: BossDrawFn = (_w: World, b, g, now, c) => {
  body(b, g, now, c, 0, 1.5);
  const cx = b.x + b.w / 2; // вихрь искр вокруг мозга
  g.fillStyle(0xff9ac8, 0.8);
  for (let i = 0; i < 6; i++) { const a = now * 3 + i * 1.05; g.fillCircle(cx + Math.cos(a) * 52, b.y + 46 + Math.sin(a) * 30, 3); }
};

/** кольцо-страж: светящийся обруч с зрачком; перед выстрелом ярче */
const ring: CreatureDrawFn = (e, g, now, c) => {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2, al = c.alpha, fl = e.flash > 0;
  g.lineStyle(5, fl ? 0xffffff : c.color, al); g.strokeCircle(cx, cy, r);
  g.lineStyle(2, 0xffffff, 0.5 * al); g.strokeCircle(cx, cy, r - 5 + Math.sin(now * 8) * 1.5);
  g.fillStyle(c.tell ? c.rgb : 0x10141a, al); g.fillCircle(cx, cy, c.tell ? 6 : 4);
};

export default { base, shattered, frenzy, 'creature:ring': ring };
