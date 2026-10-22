// Первый Кающийся: фигура в рясе с высоким колпаком. В первой фазе закован в вериги (тяжёлый, цепи тянутся к полу), во второй вериги сорваны:
// тело шире, колпак надорван, обрывки цепей мотаются на ходу. Телеграф (контур, коробки, окно наказания) рисует общий код поверх этого тела.
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { G } from '../common';
import { pts } from '../common';
import type { BossDrawFn, DrawCtx } from '../bossdraw';

const ROBE = 0x6e5a72, ROBE_DARK = 0x3d3243, CLOTH = 0xd8cdb4, IRON = 0x8a8f99, BLOOD = 0xa23a2e;

/** общий рисунок: broken — вериги сорваны (вторая фаза) */
function body(b: Boss, g: G, now: number, c: DrawCtx, broken: boolean): void {
  const f = b.face, cx = b.x + b.w / 2 + c.lean, fy = b.y + b.h, fl = b.flash > 0;
  const robe = fl ? 0xffffff : broken ? c.e.color : ROBE, dark = fl ? 0xffffff : ROBE_DARK;
  const atk = c.d.atk ?? '';
  const crouch = atk === 'thrust' || atk === 'rend' || atk === 'leap' || atk === 'kneel' ? 10 + (atk === 'kneel' ? 8 : 0) : 0;
  const sway = broken ? Math.sin(now * 9) * 2 : Math.sin(now * 3) * 1;
  const top = b.y + crouch;
  // тень
  g.fillStyle(0x000000, 0.3); g.fillEllipse(cx, fy - 2, b.w + 16, 8);
  // ряса: трапеция от плеч к подолу
  g.fillStyle(robe, 1);
  g.fillPoints(pts([{ x: cx - b.w * 0.28, y: top + b.h * 0.26 }, { x: cx + b.w * 0.28, y: top + b.h * 0.26 }, { x: cx + b.w * 0.5, y: fy - 2 }, { x: cx - b.w * 0.5, y: fy - 2 }]), true);
  g.fillStyle(dark, 1); g.fillRect(cx - b.w * 0.5, fy - 12, b.w, 10);
  g.fillStyle(CLOTH, 0.85); g.fillRect(cx - 3 + f * 2, top + b.h * 0.3, 6, b.h * 0.5 - crouch); // лента на груди
  // колпак: высокий конус, во второй фазе надорван
  const hy = top + b.h * 0.26;
  g.fillStyle(CLOTH, 1);
  g.fillTriangle(cx - 13, hy, cx + 13, hy, cx + sway + (broken ? 6 : 0), top - b.h * 0.2);
  g.fillStyle(0x15121a, 1); g.fillEllipse(cx + f * 3, hy - 4, 14, 14); // тёмный провал лица
  g.fillStyle(broken ? BLOOD : 0xe9e1c8, 1); g.fillRect(cx + f * 5 - 5, hy - 7, 3, 3); g.fillRect(cx + f * 5 + 1, hy - 7, 3, 3);
  // руки с цепями
  const ang = c.tell ? -1.9 + c.k * 0.6 : b.state === 'active' ? 0.1 : b.state === 'recover' ? 1.2 : 0.9;
  g.lineStyle(6, dark, 1);
  for (const side of [-1, 1]) {
    const sx = cx + side * (b.w * 0.3), sy = top + b.h * 0.32, a = side * f > 0 ? ang : 0.95;
    const ex = sx + Math.cos(a) * f * 32, ey = sy + Math.sin(a) * 32;
    g.lineBetween(sx, sy, ex, ey);
    g.lineStyle(2.5, IRON, 1);
    if (broken) { // оборванная цепь мотается
      g.lineBetween(ex, ey, ex + Math.sin(now * 11 + side) * 7, ey + 14);
      g.lineStyle(6, dark, 1);
    } else { // цепь тянется к полу: кандалы
      g.lineBetween(ex, ey, ex, fy - 6); g.fillStyle(IRON, 1); g.fillRect(ex - 4, fy - 9, 8, 7);
      g.lineStyle(6, dark, 1);
    }
  }
  if (!broken) { g.lineStyle(3, IRON, 1); g.strokeEllipse(cx, top + b.h * 0.34, b.w * 0.8, 10); } // ошейник из железа
}

const base: BossDrawFn = (_w: World, b: Boss, g: G, now: number, c: DrawCtx): void => body(b, g, now, c, false);
const unchained: BossDrawFn = (_w: World, b: Boss, g: G, now: number, c: DrawCtx): void => body(b, g, now, c, true);

export default { base, unchained };
