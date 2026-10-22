// Хранительница Печатей: тело (балахон, бумажная маска, кисть и парящие печати). Только рисунок: телеграф (контур замаха, коробки ударов,
// окно наказания) рисует общий код поверх, поэтому читаемость от арта не зависит. Поза берётся из tell.cue.pose текущей атаки.
import { attackOf } from '../../../core/boss/exec';
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { BossDrawSet, DrawCtx } from '../bossdraw';
import { type G, pts } from '../common';

const PAPER = 0xefe6cf, INK = 0x1a1420, SEAL = 0xb8323a, GOLD = 0xe3c46a;

/** поза руки с кистью: угол в радианах относительно взгляда (0 — вперёд, отрицательный — вверх), вытянутость руки и вторая рука */
function armPose(pose: string, k: number, state: string): { a: number; reach: number; both: boolean } {
  const swing = state === 'active';
  switch (pose) {
    case 'raise_seal': case 'overhead': return { a: swing ? 0.9 : -2.0 + k * 0.4, reach: 30, both: false };
    case 'brush_up': return { a: swing ? 0.2 : -1.6 + k * 0.5, reach: 34, both: false };
    case 'wrist': return { a: swing ? 0.1 : -0.9, reach: 30, both: false };
    case 'low_sweep': case 'crouch': case 'crouch_white': return { a: swing ? 0.1 : 1.0 - k * 0.2, reach: 34, both: false };
    case 'palms_raise': case 'palms_out': case 'brace': return { a: swing ? 0 : -0.5, reach: 26, both: true };
    case 'card_throw': return { a: swing ? -0.1 : -1.2 + k * 0.6, reach: 26, both: false };
    case 'lean': return { a: 0.3, reach: 30, both: false };
    default: return { a: 0.6, reach: 26, both: false };
  }
}

function base(_w: World, b: Boss, g: G, now: number, c: DrawCtx): void {
  const f = b.face, cx = b.x + b.w / 2, fy = b.y + b.h, fl = b.flash > 0;
  const body = fl ? 0xffffff : c.e.color, trim = fl ? 0xffffff : 0x8d78c8, lean = c.lean, h = b.h;
  const atk = c.d.atk ? attackOf(c.def, c.d.atk) : null;
  const pose = armPose(atk?.tell.cue.pose ?? '', c.k, b.state), ph = b.phase || 1;
  const sway = Math.sin(now * 2.2) * 1.5, crouch = pose.a > 0.9 && b.state !== 'idle' ? 8 : 0;
  // тень и подол
  g.fillStyle(0x15121f, 0.55); g.fillEllipse(cx, fy - 2, b.w + 18, 8);
  g.fillStyle(body, 1);
  g.fillPoints(pts([{ x: cx + lean * 1.2 + sway * 0.4, y: b.y + 26 + crouch }, { x: cx - b.w / 2 - 4, y: fy - 2 }, { x: cx + b.w / 2 + 4, y: fy - 2 }]), true);
  g.fillStyle(trim, 1); g.fillRect(cx - b.w / 2 - 2, fy - 8, b.w + 4, 3);
  g.fillStyle(0x2c2346, 1); g.fillRect(cx - 5 + lean * 0.8, b.y + 30 + crouch, 10, h - 36 - crouch); // лента-оби
  g.fillStyle(SEAL, 1); g.fillRect(cx - 3 + lean * 0.8, b.y + 36 + crouch, 6, 10);
  // голова: бумажная маска с печатью на лбу и узел волос
  const hx = cx + lean * 1.5 + sway * 0.3, hy = b.y + 15 + crouch * 0.6;
  g.fillStyle(INK, 1); g.fillCircle(hx - f * 5, hy - 10, 6);
  g.fillStyle(PAPER, 1); g.fillEllipse(hx, hy, 24, 27);
  g.fillStyle(SEAL, 1); g.fillRect(hx - 2, hy - 11, 4, 7);
  g.fillStyle(INK, 1); g.fillRect(hx + f * 3 - 5, hy - 1, 3, 6); g.fillRect(hx + f * 3 + 2, hy - 1, 3, 6);
  // кисть: рука от плеча, длинное древко с тушью
  const sx = cx + f * 8 + lean, sy = b.y + 32 + crouch, ang = pose.a;
  const hxp = sx + Math.cos(ang) * f * pose.reach, hyp = sy + Math.sin(ang) * pose.reach;
  g.lineStyle(5, trim, 1); g.lineBetween(sx, sy, hxp, hyp);
  g.lineStyle(3, 0x6b4a2a, 1); g.lineBetween(hxp - Math.cos(ang) * f * 10, hyp - Math.sin(ang) * 10, hxp + Math.cos(ang) * f * 34, hyp + Math.sin(ang) * 34);
  g.fillStyle(INK, 1); g.fillCircle(hxp + Math.cos(ang) * f * 36, hyp + Math.sin(ang) * 36, 4);
  if (pose.both) { g.lineStyle(5, trim, 1); g.lineBetween(cx - f * 6 + lean, sy, hxp - f * 6, hyp + 6); }
  // парящие печати: чем дальше фаза, тем больше; в замахе вращаются быстрее
  const n = 2 + ph * 2, spin = now * (c.tell ? 4.5 : 1.4);
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2, px = cx + Math.cos(a) * 34, py = b.y + 36 + Math.sin(a) * 12 + Math.sin(now * 3 + i) * 3, s = 5;
    g.fillStyle(PAPER, 0.9); g.fillPoints(pts([{ x: px, y: py - s * 1.4 }, { x: px + s, y: py }, { x: px, y: py + s * 1.4 }, { x: px - s, y: py }]), true);
    g.fillStyle(i % 2 ? SEAL : GOLD, 1); g.fillRect(px - 1, py - 2, 2, 4);
  }
}

export default { base } satisfies BossDrawSet;
