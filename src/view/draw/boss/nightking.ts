// Король кошмаров: тёмная фигура в плаще с рогатым венцом и пламенем вместо рук. Телеграф (контур, коробки ударов, окно наказания) рисует общий код поверх тела.
// Во время «ухода в тень» (атаки warp_*) тело бледнеет: игрок смотрит не на него, а на красный круг, где он появится.
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { BossDrawFn, DrawCtx } from '../bossdraw';
import { pts, type G } from '../common';

const CLOAK = 0x2a1030, EDGE = 0x6a1b4d, FLAME = 0xff6a3a, EYE = 0xffd7a8;

/** прозрачность тела: в замахе/полёте «ухода» тает, перед выходом из тени проступает */
function bodyAlpha(b: Boss, c: DrawCtx): number {
  const d = c.d;
  if (b.state === 'dead' || !d.atk || !d.atk.startsWith('warp_')) return 1;
  if (b.state === 'tell') return 1 - 0.8 * c.k;
  if (b.state === 'active') return 0.2;
  return 0.2 + 0.8 * Math.min(1, d.f / 12);
}

const base: BossDrawFn = (_w: World, b: Boss, g: G, now: number, c: DrawCtx): void => {
  const f = b.face, cx = b.x + b.w / 2, fy = b.y + b.h, fl = b.flash > 0, a = bodyAlpha(b, c), lean = c.lean;
  const cloak = fl ? 0xffffff : CLOAK, edge = fl ? 0xffffff : EDGE;
  // тень на полу
  g.fillStyle(0x000000, 0.3 * a); g.fillEllipse(cx, fy - 2, b.w + 18, 8);
  // плащ: трапеция с рваным подолом
  const sway = Math.sin(now * 3) * 2;
  g.fillStyle(cloak, a);
  g.fillPoints(pts([
    { x: cx - 12 + lean, y: b.y + 22 }, { x: cx + 12 + lean, y: b.y + 22 },
    { x: cx + b.w / 2 + 4 + sway, y: fy - 4 }, { x: cx + b.w / 4, y: fy - 10 }, { x: cx, y: fy - 2 }, { x: cx - b.w / 4, y: fy - 10 }, { x: cx - b.w / 2 - 4 - sway, y: fy - 4 },
  ]), true);
  g.lineStyle(2, edge, a);
  g.lineBetween(cx - 12 + lean, b.y + 22, cx - b.w / 2 - 4 - sway, fy - 4); g.lineBetween(cx + 12 + lean, b.y + 22, cx + b.w / 2 + 4 + sway, fy - 4);
  // голова и венец
  const hx = cx + lean * 1.4, hy = b.y + 14;
  g.fillStyle(cloak, a); g.fillCircle(hx, hy, 14);
  g.fillStyle(edge, a);
  g.fillTriangle(hx - 12, hy - 8, hx - 6, hy - 8, hx - 14, hy - 26); g.fillTriangle(hx + 12, hy - 8, hx + 6, hy - 8, hx + 14, hy - 26);
  g.fillTriangle(hx - 4, hy - 12, hx + 4, hy - 12, hx, hy - 30);
  // глаза
  g.fillStyle(EYE, a); g.fillRect(hx + f * 3 - 6, hy - 2, 4, 3); g.fillRect(hx + f * 3 + 2, hy - 2, 4, 3);
  // руки-пламя: в замахе поднимаются, в ударе вытягиваются вперёд
  const ang = c.tell ? -1.9 + c.k * 0.4 : b.state === 'active' ? 0.05 : b.state === 'recover' ? 1.1 : 0.9;
  for (const side of [-1, 1]) {
    const sx = cx + side * 14 + lean, sy = b.y + 30, ar = side * f > 0 ? ang : 0.9;
    const ex = sx + Math.cos(ar) * f * 28, ey = sy + Math.sin(ar) * 28;
    g.lineStyle(6, cloak, a); g.lineBetween(sx, sy, ex, ey);
    const fk = 4 + Math.sin(now * 20 + side) * 2;
    g.fillStyle(FLAME, 0.9 * a); g.fillCircle(ex, ey, fk + 2);
    g.fillStyle(0xffd24a, 0.8 * a); g.fillCircle(ex, ey - 1, fk * 0.55);
  }
};

export default { base } satisfies Record<string, BossDrawFn>;
