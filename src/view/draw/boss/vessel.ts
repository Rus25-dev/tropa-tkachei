// Рисунок «Пустого сосуда»: тонкая бледная фигура в плаще с двумя рожками и клинком-рукой. Поза зависит от замаха (cue.pose из data/bosses/vessel.json).
// Телеграф (контур, коробки ударов, окно наказания) рисует общий код поверх; здесь только тело.
import { boxRect } from '../../../core/boss/exec';
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { BossDrawFn, BossDrawSet } from '../bossdraw';
import { fillPolygon, strokePolygon, type G } from '../common';

const SHELL = 0xd8d4e8, SHADE = 0x6a6682, VOID = 0x0c0a14, BLADE = 0xf4f1ff;

/** угол клинка (рад., 0 — вперёд по горизонтали, вниз положительный) и приседание в замахе по позе */
function bladePose(pose: string, k: number): { ang: number; crouch: number; reach: number } {
  switch (pose) {
    case 'slash_h': return { ang: -1.4 + k * 0.6, crouch: 0, reach: 40 };
    case 'slash_up': return { ang: 0.9 - k * 0.6, crouch: 0, reach: 40 };
    case 'slash_x': return { ang: -1.9 + k * 0.5, crouch: 2, reach: 44 };
    case 'stab': case 'stab_low': return { ang: 0.1, crouch: 6 + k * 4, reach: 24 + k * 22 };
    case 'lean': case 'lean_back': return { ang: 0, crouch: 8 + k * 6, reach: 30 };
    case 'crouch_up': return { ang: 1.2 - k * 0.5, crouch: 10 + k * 4, reach: 34 };
    case 'crouch': case 'crouch_big': case 'crouch_low': return { ang: -0.2, crouch: 6 + k * 14, reach: 26 };
    case 'wind_up': case 'wind_up_big': return { ang: -1.6 + k * 0.4, crouch: 0, reach: 36 };
    case 'look_up': case 'look_up_big': return { ang: -2.4, crouch: -4, reach: 36 };
    case 'overhead_big': return { ang: -2.5 + k * 0.2, crouch: -6, reach: 46 };
    case 'dive': return { ang: Math.PI / 2, crouch: -2 + k * 5, reach: 23 + k * 2 };
    case 'guard': return { ang: -1.35, crouch: 2, reach: 48 };
    case 'void': return { ang: 1.4, crouch: -3, reach: 22 };
    case 'brace': return { ang: 0, crouch: 8, reach: 18 };
    default: return { ang: -0.5, crouch: 0, reach: 34 };
  }
}

const base: BossDrawFn = (_w: World, b: Boss, g: G, now: number, c): void => {
  if (c.d.atk === 'pillars' && c.tell) g.setAlpha(Math.min(1, c.d.af / 12));
  const f = b.face, cx = b.x + b.w / 2 + c.lean, fy = b.y + b.h, fl = b.flash > 0;
  const shell = fl ? 0xffffff : SHELL, shade = fl ? 0xffffff : SHADE;
  const idle = b.state === 'idle' || b.state === 'intro';
  let pose = c.d.atk ? c.def.attacks.find((a) => a.id === c.d.atk)?.tell.cue.pose ?? '' : '';
  const attack = c.def.attacks.find((a) => a.id === c.d.atk);
  const frame = c.d.af - 1 - (attack?.tell.frames ?? 0);
  if (c.d.atk === 'triple' && frame >= 0) pose = frame >= 29 ? 'slash_x' : frame >= 16 ? 'slash_up' : 'slash_h';
  const swingFrame = c.d.atk === 'triple' ? frame >= 29 ? frame - 29 : frame >= 16 ? frame - 16 : frame : frame;
  const swing = Math.min(1, Math.max(0, swingFrame) / 4);
  const bp = c.tell ? bladePose(pose, c.k)
    : b.state === 'active' && ['triple', 'cut3'].includes(c.d.atk ?? '') ? { ang: pose === 'slash_up' ? 1.2 - swing * 2.6 : -1.4 + swing * 2.8, crouch: 3, reach: 62 }
    : b.state === 'active' ? bladePose(pose, 1)
    : b.state === 'recover' ? { ang: 1.3, crouch: 6, reach: 30 } : { ang: 1.0, crouch: 0, reach: 28 };
  const bob = idle ? Math.sin(now * 3) * 1.5 : 0, cr = bp.crouch;
  // Эффекты привязаны к фактическим областям удара; прямоугольники отладки независимы.
  const special = ['pillars', 'focus', 'tendrils'].includes(c.d.atk ?? '');
  if (special && (c.tell || b.state === 'active')) for (const hit of attack?.active ?? []) {
    if (hit.previewFrom !== undefined ? frame < hit.previewFrom || frame > hit.to : !c.tell && (frame > hit.to || frame < hit.from - 20)) continue;
    const r = boxRect(b, c.d.dir, hit.hit, c.d.lock);
    const active = !c.tell && frame >= hit.from && frame <= hit.to;
    if (c.d.atk === 'pillars') {
      if (c.spriteBody) continue;
      if (!active) { g.lineStyle(2, SHELL, 0.55); g.strokeEllipse(r.x + r.w / 2, r.y + r.h - 3, r.w + 8, 7); }
      else if (hit.polygon) { const points = hit.polygon.map((v) => ({ x: r.x + v.x * r.w, y: r.y + v.y * r.h })); g.fillStyle(SHELL, 0.7); fillPolygon(g, points); g.lineStyle(2, BLADE, 0.9); strokePolygon(g, points); }
      else { g.fillStyle(SHELL, 0.18); g.fillRect(r.x, r.y, r.w, r.h); g.fillStyle(SHELL, 0.65); g.fillRect(r.x + 2, r.y + 12, r.w - 4, r.h - 12); g.fillTriangle(r.x + 2, r.y + 12, r.x + r.w - 2, r.y + 12, r.x + r.w / 2, r.y); g.lineStyle(3, BLADE, 0.95); g.lineBetween(r.x + r.w / 2, r.y + 12, r.x + r.w / 2, r.y + r.h); }
    } else if (c.d.atk === 'focus') {
      g.fillStyle(SHELL, active ? 0.32 : 0.06); g.fillCircle(r.x + r.w / 2, r.y + r.h / 2, r.w / 2);
      g.lineStyle(active ? 5 : 2, BLADE, active ? 0.95 : 0.45); g.strokeCircle(r.x + r.w / 2, r.y + r.h / 2, r.w / 2);
    } else {
      g.lineStyle(active ? 16 : 2, active ? VOID : SHADE, active ? 1 : 0.55);
      for (let i = 0; i < 3; i++) {
        const yy = r.y + 8 + i * 12;
        const mid = yy + Math.sin(now * 18 + i) * 5;
        if (active) { g.lineStyle(19, SHADE, 0.9); g.lineBetween(r.x, yy, r.x + r.w * 0.55, mid); g.lineBetween(r.x + r.w * 0.55, mid, r.x + r.w, yy); }
        g.lineStyle(active ? 12 : 2, active ? VOID : SHELL, active ? 1 : 0.55);
        g.lineBetween(r.x, yy, r.x + r.w * 0.55, mid);
        g.lineBetween(r.x + r.w * 0.55, mid, r.x + r.w, yy);
      }
    }
  }
  if (c.tell && c.d.atk === 'daggers') {
    const sx = cx + f * 26, sy = b.y + b.h / 2 - 6;
    const aim = Math.atan2(c.d.lock.y - sy, c.d.lock.x - sx);
    g.lineStyle(1, BLADE, 0.15 + c.k * 0.3);
    for (let i = -3; i <= 3; i++) {
      const angle = aim + i * Math.PI / 12;
      g.lineBetween(sx, sy, sx + Math.cos(angle) * 250, sy + Math.sin(angle) * 250);
    }
    g.fillStyle(BLADE, 0.4 + c.k * 0.5); g.fillCircle(sx, sy, 3 + c.k * 4);
  }
  if (pose === 'guard' && b.state === 'active') { g.lineStyle(2, BLADE, 0.9); g.strokeCircle(cx + f * 20, b.y + 25, 9); }
  if (c.d.atk === 'triple' && b.state === 'active') for (const hit of attack?.active ?? []) {
    if (!hit.polygon || frame < hit.from || frame > hit.to) continue;
    const r = boxRect(b, c.d.dir, hit.hit, c.d.lock);
    const points = hit.polygon.map((v) => ({ x: r.x + (c.d.dir < 0 ? 1 - v.x : v.x) * r.w, y: r.y + v.y * r.h }));
    g.fillStyle(BLADE, 0.16); fillPolygon(g, points); g.lineStyle(3, BLADE, 0.7); strokePolygon(g, points);
  }
  if (c.spriteBody) return;
  // тень на полу
  g.fillStyle(0x000000, 0.3); g.fillEllipse(cx, fy - 2, b.w + 10, 7);
  // плащ-юбка (клин) и тонкие ноги
  g.fillStyle(VOID, 1); g.fillTriangle(cx - 17, fy - 4, cx + 17, fy - 4, cx - f * (3 + Math.sin(now * 7) * 3), b.y + 34 + cr);
  g.lineStyle(4, shade, 1); g.lineBetween(cx - 5, fy - 24 + cr * 0.5, cx - 6, fy - 3); g.lineBetween(cx + 5, fy - 24 + cr * 0.5, cx + 6, fy - 3);
  // туловище
  g.fillStyle(shell, 1); g.fillRoundedRect(cx - 9, b.y + 30 + cr + bob, 18, 34 - cr * 0.5, 7);
  g.fillStyle(VOID, 1); g.fillRect(cx - 5, b.y + 44 + cr + bob, 10, 3);
  // голова-маска с двумя рожками и тёмными глазами
  const hx = cx + f * 2, hy = b.y + 18 + cr + bob;
  g.fillStyle(shell, 1); g.fillCircle(hx, hy, 13);
  g.fillTriangle(hx - 11, hy - 6, hx - 5, hy - 10, hx - 15 - f * 3, hy - 27); g.fillTriangle(hx + 11, hy - 6, hx + 5, hy - 10, hx + 15 - f * 3, hy - 27);
  g.fillStyle(VOID, 1); g.fillEllipse(hx + f * 4 - 4, hy + 1, 5, 8); g.fillEllipse(hx + f * 4 + 4, hy + 1, 5, 8);
  // рука-клинок
  const sx = cx + f * 6, sy = b.y + 38 + cr + bob, ex = sx + Math.cos(bp.ang) * f * bp.reach, ey = sy + Math.sin(bp.ang) * bp.reach;
  g.lineStyle(5, shade, 1); g.lineBetween(sx, sy, sx + (ex - sx) * 0.45, sy + (ey - sy) * 0.45);
  g.lineStyle(3, fl ? 0xffffff : BLADE, 1); g.lineBetween(sx + (ex - sx) * 0.45, sy + (ey - sy) * 0.45, ex + (ex - sx) * 0.6, ey + (ey - sy) * 0.6);
  // вторая рука — просто висит
  g.lineStyle(4, shade, 1); g.lineBetween(cx - f * 7, sy, cx - f * 10, sy + 20);
};

export default { base } satisfies BossDrawSet;
