// Хранительница Печатей: тело (балахон, бумажная маска, кисть и парящие печати). Только рисунок: телеграф (контур замаха, коробки ударов,
// окно наказания) рисует общий код поверх, поэтому читаемость от арта не зависит. Поза берётся из tell.cue.pose текущей атаки.
import { attackOf } from '../../../core/boss/exec';
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { BossDrawSet, DrawCtx } from '../bossdraw';
import { type G, pts } from '../common';
import { activeEnd } from '../../../core/boss/schema';
import { keeperPose, type KeeperStage } from '../keeper-motion';

const PAPER = 0xefe6cf, INK = 0x1a1420, SEAL = 0xb8323a, GOLD = 0xe3c46a;

function base(_w: World, b: Boss, g: G, now: number, c: DrawCtx): void {
  const f = b.face, cx = b.x + b.w / 2, fy = b.y + b.h, fl = b.flash > 0;
  const body = fl ? 0xffffff : c.e.color, trim = fl ? 0xffffff : 0x8d78c8, lean = c.lean, h = b.h;
  const atk = c.d.atk ? attackOf(c.def, c.d.atk) : null;
  const end = atk ? activeEnd(atk) : 0, t = c.d.af - 1 - (atk?.tell.frames ?? 0);
  const stage: KeeperStage = ['tell', 'active', 'recover'].includes(b.state) ? b.state as KeeperStage : 'idle';
  const progress = stage === 'tell' ? c.k : stage === 'active' ? t / Math.max(1, end) : (t - end - 1) / Math.max(1, atk?.recovery.frames ?? 1);
  const pose = keeperPose(atk?.tell.cue.pose ?? '', stage, progress), ph = b.phase || 1;
  if (b.stagger > 0) { pose.a = 1.6; pose.reach = 20; }
  const sway = Math.sin(now * 2.2) * 1.5, crouch = pose.a > 0.9 && b.state !== 'idle' ? 8 : 0;
  // тень и подол
  g.fillStyle(0x15121f, 0.55); g.fillEllipse(cx, fy - 2, b.w + 18, 8);
  g.fillStyle(body, 1);
  g.fillPoints(pts([{ x: cx + lean * 1.2 + sway * 0.4, y: b.y + 26 + crouch }, { x: cx - b.w / 2 - 4, y: fy - 2 }, { x: cx + b.w / 2 + 4, y: fy - 2 }]), true);
  g.fillStyle(trim, 1); g.fillRect(cx - b.w / 2 - 2, fy - 8, b.w + 4, 3);
  g.fillStyle(fl ? 0xffffff : 0x342840, 1);
  g.fillPoints(pts([{ x: cx + lean, y: b.y + 29 + crouch }, { x: cx - 12, y: fy - 9 }, { x: cx + 3, y: fy - 17 }, { x: cx + 14, y: fy - 5 }]), true);
  // Бумажный воротник и вышитые швы удерживают силуэт на тёмном фоне.
  g.lineStyle(3, fl ? 0xffffff : PAPER, 0.9);
  g.lineBetween(cx - 12 + lean, b.y + 27 + crouch, cx + lean, b.y + 42 + crouch);
  g.lineBetween(cx + 12 + lean, b.y + 27 + crouch, cx + lean, b.y + 42 + crouch);
  g.lineStyle(1.5, GOLD, 0.9);
  g.lineBetween(cx - 11 + lean, b.y + 44 + crouch, cx - 18, fy - 11);
  g.lineBetween(cx + 11 + lean, b.y + 44 + crouch, cx + 18, fy - 11);
  g.fillStyle(0x2c2346, 1); g.fillRect(cx - 5 + lean * 0.8, b.y + 30 + crouch, 10, h - 36 - crouch); // лента-оби
  g.fillStyle(SEAL, 1); g.fillRect(cx - 3 + lean * 0.8, b.y + 36 + crouch, 6, 10);
  // Ленты тянутся за движением; три разрыва ткани показывают номер фазы.
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * 10, lag = Math.max(-18, Math.min(18, -b.vx * 0.025));
    g.lineStyle(3, i < ph ? GOLD : SEAL, 0.75);
    g.lineBetween(x + lean, b.y + 40, x + lag + Math.sin(now * 5 + i) * 4, fy - 8 - i * 3);
  }
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
  const tipX = hxp + Math.cos(ang) * f * 42, tipY = hyp + Math.sin(ang) * 42;
  g.fillStyle(PAPER, 0.95); g.fillPoints(pts([{ x: tipX - Math.sin(ang) * 4, y: tipY + Math.cos(ang) * 4 }, { x: tipX + Math.sin(ang) * 4, y: tipY - Math.cos(ang) * 4 }, { x: tipX + Math.cos(ang) * f * 12, y: tipY + Math.sin(ang) * 12 }]), true);
  if (b.state === 'active') {
    // След туши: проводка следует тем же ключам, что и рука, не хранит историю в ядре.
    for (let i = 1; i <= 8; i++) {
      const a0 = ang - i * 0.13, a1 = a0 + 0.13;
      g.lineStyle(4 - i * 0.35, ph === 3 ? GOLD : SEAL, (9 - i) / 18);
      g.lineBetween(sx + Math.cos(a0) * f * 66, sy + Math.sin(a0) * 66, sx + Math.cos(a1) * f * 66, sy + Math.sin(a1) * 66);
    }
  }
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
