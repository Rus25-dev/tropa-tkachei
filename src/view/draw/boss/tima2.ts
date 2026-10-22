// Рисунок Тимы Пиво на каркасе: то же тело, что у прежнего автомата (треники, майка, наушники, щетина), но поза берётся из приёма, который идёт сейчас.
// Телеграф (контур замаха, места ударов, окно наказания) рисует общий код поверх; здесь только тело, круг пыли, метка «лага» и лужи.
//   base — первая фаза; angry — вторая (красные щёки, пар); fury — ярость (глаза горят, вокруг искры).
import { clamp } from '../../../core/balance';
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { BossDrawFn, BossDrawSet, DrawCtx } from '../bossdraw';
import type { G } from '../common';

const num = (b: Boss, k: string): number => (typeof b[k] === 'number' ? (b[k] as number) : 0);
const ARM_UP = new Set(['lob', 'ring', 'box', 'bank', 'trophy', 'collect']);

function body(w: World, b: Boss, g: G, now: number, c: DrawCtx, mood: 0 | 1 | 2): void {
  const d = c.d, f = b.face, fl = b.flash > 0, dead = b.state === 'dead';
  const atk = d.mode === 'attack' ? d.atk : null, hyper = num(b, 'hyper') > 0, sneeze = num(b, 'sneeze') > 0;
  // лужи пива на полу
  for (const q of w.puddles ?? []) {
    g.fillStyle(0xd9a53a, clamp(q.t / 1.2, 0, 0.5)); g.fillEllipse(q.x + q.w / 2, q.y - 2, q.w, 7);
    g.fillStyle(0xf4efe0, clamp(q.t / 1.2, 0, 0.35)); g.fillEllipse(q.x + q.w / 2 - 8, q.y - 4, q.w * 0.4, 3);
  }
  // «лаг»: метка на полу, куда упадёт Тима; в замахе он мерцает, в полёте его нет на месте
  const inLag = atk === 'lag';
  if (inLag && b.state !== 'tell') {
    const pulse = 0.55 + Math.sin(now * 16) * 0.3;
    g.lineStyle(3, 0xff4a3a, pulse); g.strokeEllipse(d.lock.x, d.floor - 3, 96, 14);
    g.lineBetween(d.lock.x - 40, d.floor - 3, d.lock.x + 40, d.floor - 3);
  }
  g.setAlpha(dead ? clamp(b.t / 2.6, 0, 1) : inLag && b.state === 'tell' ? 0.35 + Math.abs(Math.sin(now * 30)) * 0.6 : 1);
  const shake = c.tell && atk !== null && ARM_UP.has(atk) ? Math.sin(now * 70) * 1.5 : inLag && b.state === 'tell' ? Math.sin(now * 90) * 4 : 0;
  const cx = b.x + b.w / 2 + shake, fy = b.y + b.h;
  if (hyper) { g.fillStyle(0xffe38a, 0.12 + Math.sin(now * 12) * 0.05); g.fillEllipse(cx, fy - 40, 100, 110); }
  if (mood === 2) { g.fillStyle(0xff4a3a, 0.08 + Math.sin(now * 9) * 0.04); g.fillEllipse(cx, fy - 40, 120, 124); }
  const walk = Math.abs(b.vx) > 5, legA = walk ? Math.sin(now * (hyper ? 24 : 12)) * 5 : 0;
  // ноги в трениках
  g.lineStyle(7, 0x2a2f3a, 1); g.lineBetween(cx - 11, fy - 18, cx - 11 + legA, fy - 2); g.lineBetween(cx + 11, fy - 18, cx + 11 - legA, fy - 2);
  g.fillStyle(0xf4efe0, 1); g.fillEllipse(cx - 11 + legA + 3 * f, fy - 2, 15, 6); g.fillEllipse(cx + 11 - legA + 3 * f, fy - 2, 15, 6);
  // спина-панцирь и пузо в майке
  g.fillStyle(fl ? 0xffffff : 0x4b5a3c, 1); g.fillEllipse(cx - 6 * f, fy - 40, 58, 52);
  g.fillStyle(fl ? 0xffffff : 0xe9e4d4, 1); g.fillEllipse(cx + 6 * f, fy - 36, 46, 44);
  g.lineStyle(3, 0xcfc8b4, 1); g.lineBetween(cx - 4 + 6 * f, fy - 62, cx - 6 + 6 * f, fy - 50); g.lineBetween(cx + 14 + 6 * f, fy - 62, cx + 16 + 6 * f, fy - 50);
  g.fillStyle(0x3b2a1c, 0.35); g.fillCircle(cx + 10 * f, fy - 30, 2.5);
  // голова: щетина, наушники
  const hx = cx + 10 * f, hy = fy - 72;
  g.fillStyle(fl ? 0xffffff : mood ? 0x7f7f56 : 0x6f7f56, 1); g.fillEllipse(hx, hy, 34, 28);
  g.fillStyle(0x3b4a2c, 0.5); for (let i = 0; i < 8; i++) g.fillCircle(hx + f * (2 + (i % 4) * 4), hy + 6 + Math.floor(i / 4) * 3, 1);
  g.lineStyle(3, 0x1a1a22, 1); g.beginPath(); g.arc(hx - 2 * f, hy - 4, 17, Math.PI * 1.1, Math.PI * 1.9, false); g.strokePath();
  g.fillStyle(0x1a1a22, 1); g.fillRoundedRect(hx - 2 * f - 6 - 12 * f, hy - 6, 10, 14, 3);
  g.fillStyle(0x6bd36b, 0.9); g.fillCircle(hx - 2 * f - 1 - 12 * f, hy + 1, 1.6);
  if (sneeze || dead) { g.lineStyle(2, 0x1a1410, 1); g.lineBetween(hx + 3 * f, hy - 2, hx + 9 * f, hy); g.lineBetween(hx + 10 * f, hy - 2, hx + 15 * f, hy); }
  else {
    g.fillStyle(0xf4efe0, 1); g.fillEllipse(hx + 6 * f, hy - 1, 8, 7); g.fillEllipse(hx + 13 * f, hy - 1, 7, 6);
    g.fillStyle(mood === 2 ? 0xff3a2a : hyper ? 0xffb6f0 : 0x1a1410, 1); g.fillCircle(hx + 7 * f, hy, 2); g.fillCircle(hx + 14 * f, hy, 1.8);
    g.fillStyle(0xd9686a, mood ? 0.6 : 0.35); g.fillCircle(hx + 12 * f, hy + 6, 4); // румянец (во второй фазе гуще)
  }
  g.fillStyle(0x1a1410, 1);
  if (c.tell || b.state === 'active' || sneeze) g.fillEllipse(hx + 10 * f, hy + 9, 7, 4 + Math.abs(Math.sin(now * 14)) * 3); else g.fillRect(Math.min(hx + 7 * f, hx + 13 * f), hy + 9, 6, 1.6);
  if (mood && !sneeze) { g.lineStyle(2, 0xf4efe0, 0.45); for (let i = 0; i < 2; i++) g.lineBetween(hx - 8 + i * 14, hy - 20, hx - 11 + i * 14 + Math.sin(now * 8 + i) * 3, hy - 28 - Math.abs(Math.sin(now * 5 + i)) * 6); } // пар из ушей
  // волшебная пыль: светящийся круг, пока он чертит и стоит в нём
  if (atk === 'dust') {
    const total = c.d.cue ? c.d.cue.total : 1, prog = c.tell && c.d.cue ? clamp(1 - c.d.cue.left / total, 0, 1) : 1;
    const rx = cx + (c.tell ? f * 52 * (1 - prog) : 0), pulse = 0.6 + Math.sin(now * 10) * 0.25;
    g.lineStyle(3, 0xffe38a, c.tell ? 0.85 : pulse);
    g.beginPath(); g.arc(rx, fy - 3, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog, false); g.strokePath();
    g.lineStyle(1.5, 0xffb6f0, 0.7); g.strokeEllipse(rx, fy - 3, 52 * prog, 10 * prog);
    if (!c.tell) { g.fillStyle(0xffe38a, 0.12 + Math.sin(now * 8) * 0.05); g.fillRect(rx - 26, fy - 90, 52, 88); }
  }
  // рука с предметом
  g.lineStyle(5, fl ? 0xffffff : 0x6f7f56, 1);
  const up = c.tell && atk !== null && ARM_UP.has(atk), draw = atk === 'dust' && c.tell, swinging = atk === 'swing' || atk === 'pad';
  const ax = cx + f * (draw ? 50 + Math.sin(now * 9) * 10 : swinging && b.state === 'active' ? 46 : up ? 26 : 30), ay = draw ? fy - 8 : fy - (up ? 78 : swinging && c.tell ? 74 : 42);
  g.lineBetween(cx + 18 * f, fy - 54, ax, ay);
  if (atk === 'ring') {
    g.fillStyle(0x1e1e22, 1); g.fillRoundedRect(ax - 22, ay - 30, 44, 28, 5);
    g.lineStyle(3, 0xff3a2a, 0.5 + Math.abs(Math.sin(now * 16)) * 0.5); g.strokeCircle(ax, ay - 16, 8);
  } else if (atk === 'box' || atk === 'pad') {
    g.fillStyle(0x1e1e22, 1); g.fillRoundedRect(ax - 18, ay - 24, 36, 22, 5); g.fillStyle(0x6bd36b, 1); g.fillCircle(ax + 10, ay - 13, 2);
  } else if (atk === 'dust') {
    g.fillStyle(0xb98a52, 1); g.fillCircle(ax, ay, 7); g.fillStyle(0xffe38a, 0.9); g.fillCircle(ax, ay - 6, 3);
  } else if (atk === 'bank') {
    g.fillStyle(0x6b3d14, 1); g.fillRoundedRect(ax - 14, ay - 10, 28, 18, 3); g.fillStyle(0x1a1410, 1); g.fillRect(ax - 10, ay - 4, 20, 3);
  } else if (atk === 'trophy') {
    g.fillStyle(0xf0c040, 1); g.fillRoundedRect(ax - 8, ay - 22, 16, 14, 3); g.fillRect(ax - 2, ay - 9, 4, 8); g.fillRect(ax - 8, ay - 1, 16, 3);
  } else {
    const bx = ax, by = up ? ay - 18 : ay - 14;
    g.fillStyle(0x6b3d14, 1); g.fillRoundedRect(bx - 5, by, 10, 22, 3); g.fillRect(bx - 2, by - 7, 4, 8);
    g.fillStyle(0xf4efe0, 1); g.fillRect(bx - 5, by + 8, 10, 7);
  }
  if (mood === 2) { g.fillStyle(0xffd447, 0.8); for (let i = 0; i < 5; i++) g.fillCircle(cx + Math.cos(now * 4 + i * 1.3) * 40, fy - 40 + Math.sin(now * 5 + i * 1.7) * 44, 1.8); } // искры ярости
}

const base: BossDrawFn = (w, b, g, now, c) => body(w, b, g, now, c, 0);
const angry: BossDrawFn = (w, b, g, now, c) => body(w, b, g, now, c, 1);
const fury: BossDrawFn = (w, b, g, now, c) => body(w, b, g, now, c, 2);
export default { base, angry, fury } satisfies BossDrawSet;
