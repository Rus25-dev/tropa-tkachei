// Рисунок «Трёх Богомолов»: общий каркас фигуры-богомола, три раскраски (Ила — жница, Орс — прыгун, Вьюн — метательница).
// Телеграф (контур замаха, места ударов, окно наказания) рисует общий код поверх, поэтому здесь только тело и поза по состоянию босса.
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import { pts, type G } from '../common';
import type { BossDrawFn, DrawCtx } from '../bossdraw';

/** раскраска и пропорции одного богомола */
export interface MantisLook {
  /** тело, тень, клинок, глаза */
  body: number; dark: number; blade: number; eye: number;
  /** длина клинка относительно высоты тела; число пар клинков (1 — метательница держит один) */
  bladeLen: number; pairs: number;
  /** крылья за спиной (метательница) */
  wings: boolean;
  /** наклон тела вперёд в покое, px */
  stoop: number;
}

const dir = (a: number, f: number): { x: number; y: number } => ({ x: Math.cos(a) * f, y: Math.sin(a) });

/** Нарисовать богомола. Начало отсчёта — тело босса b; взгляд b.face; поза — по c.tell / b.state. */
export function drawMantis(_w: World, b: Boss, g: G, now: number, c: DrawCtx, look: MantisLook): void {
  const f = b.face || 1, cx = b.x + b.w / 2, fy = b.y + b.h, h = b.h, flash = b.flash > 0;
  const body = flash ? 0xffffff : look.body, dark = flash ? 0xe0e0e0 : look.dark, blade = flash ? 0xffffff : look.blade;
  const lean = c.lean + look.stoop * f, sway = Math.sin(now * 3 + b.x * 0.01) * 1.5;
  // тень на полу
  g.fillStyle(0x000000, 0.25); g.fillEllipse(cx, fy - 2, b.w + 16, 7);
  // ноги: четыре тонких «колена назад»
  g.lineStyle(3, dark, 1);
  for (const s of [-1, 1]) {
    const hx = cx + s * b.w * 0.18 + lean * 0.4, hipY = b.y + h * 0.68;
    g.lineBetween(hx, hipY, hx + s * b.w * 0.34, hipY + h * 0.12);
    g.lineBetween(hx + s * b.w * 0.34, hipY + h * 0.12, hx + s * b.w * 0.28, fy - 2);
  }
  // крылья
  if (look.wings) {
    const open = c.tell ? 0.5 + 0.5 * c.k : 0.2 + Math.abs(Math.sin(now * 2)) * 0.08;
    g.fillStyle(0xcfeee6, 0.35 + open * 0.25);
    g.fillPoints(pts([{ x: cx - f * 4, y: b.y + h * 0.3 }, { x: cx - f * (18 + 22 * open), y: b.y - 4 + h * 0.05 }, { x: cx - f * (8 + 18 * open), y: b.y + h * 0.56 }]), true);
  }
  // брюшко и грудь: вытянутые трапеции
  g.fillStyle(dark, 1);
  g.fillPoints(pts([{ x: cx - f * 4, y: b.y + h * 0.5 }, { x: cx - f * (b.w * 0.62) + lean * 0.2, y: b.y + h * 0.58 + sway }, { x: cx - f * (b.w * 0.5), y: b.y + h * 0.78 }, { x: cx + f * 2, y: b.y + h * 0.74 }]), true);
  g.fillStyle(body, 1);
  g.fillPoints(pts([{ x: cx - f * b.w * 0.3 + lean * 0.5, y: b.y + h * 0.3 }, { x: cx + f * b.w * 0.28 + lean, y: b.y + h * 0.3 }, { x: cx + f * b.w * 0.22 + lean * 0.4, y: b.y + h * 0.74 }, { x: cx - f * b.w * 0.2, y: b.y + h * 0.78 }]), true);
  g.fillStyle(dark, 1); g.fillRect(cx - b.w * 0.18 + lean * 0.5, b.y + h * 0.46, b.w * 0.36, 2); g.fillRect(cx - b.w * 0.18 + lean * 0.4, b.y + h * 0.56, b.w * 0.36, 2);
  // голова-треугольник и глаза
  const hx = cx + lean * 1.3 + f * 3, hy = b.y + h * 0.17;
  g.fillStyle(body, 1);
  g.fillPoints(pts([{ x: hx - f * 9, y: hy - 9 }, { x: hx + f * 11, y: hy - 4 }, { x: hx + f * 3, y: hy + 12 }, { x: hx - f * 8, y: hy + 6 }]), true);
  const eyeOn = c.tell ? 0.7 + 0.3 * Math.sin(now * 40) : 1;
  g.fillStyle(c.tell ? c.rgb : look.eye, eyeOn); g.fillCircle(hx + f * 4, hy - 1, 3.2); g.fillCircle(hx - f * 3, hy, 2.4);
  g.lineStyle(1.5, dark, 1); g.lineBetween(hx - f * 2, hy - 8, hx - f * 8 + sway, hy - 20); g.lineBetween(hx + f * 4, hy - 6, hx + f * 12 - sway, hy - 18);
  // клинки-руки: поднимаются в замахе, рубят в ударе, опущены в покое и восстановлении
  const L = h * look.bladeLen, sx = cx + f * b.w * 0.22 + lean, sy = b.y + h * 0.34;
  const a = c.tell ? 0.9 - 2.8 * c.k : b.state === 'active' ? 0.25 : b.state === 'recover' ? 1.15 : 0.95 + sway * 0.02;
  for (let i = 0; i < look.pairs; i++) {
    const off = i === 0 ? 0 : -0.5, ar = a + off, el = dir(ar - 0.45, f), tip = dir(ar + 0.55, f);
    const ex = sx + el.x * L * 0.5, ey = sy + el.y * L * 0.5, tx = ex + tip.x * L * 0.75, ty = ey + tip.y * L * 0.75;
    g.lineStyle(i === 0 ? 4 : 3, dark, 1); g.lineBetween(sx, sy, ex, ey);
    g.fillStyle(blade, i === 0 ? 1 : 0.7);
    const n = dir(ar + 0.55 + Math.PI / 2, f);
    g.fillPoints(pts([{ x: ex, y: ey }, { x: tx, y: ty }, { x: ex + tip.x * L * 0.4 + n.x * 5, y: ey + tip.y * L * 0.4 + n.y * 5 }]), true);
    if (b.state === 'active') { g.lineStyle(2, 0xffffff, 0.7); g.lineBetween(ex, ey, tx, ty); }
  }
}

const ILA: MantisLook = { body: 0x7fb34a, dark: 0x3f5e24, blade: 0xdfe8c8, eye: 0xffe9a0, bladeLen: 0.75, pairs: 2, wings: false, stoop: 2 };
const base: BossDrawFn = (w, b, g, now, c) => drawMantis(w, b, g, now, c, ILA);
export default { base };
