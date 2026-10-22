// Рисунок «Пустого сосуда»: тонкая бледная фигура в плаще с двумя рожками и клинком-рукой. Поза зависит от замаха (cue.pose из data/bosses/vessel.json).
// Телеграф (контур, коробки ударов, окно наказания) рисует общий код поверх; здесь только тело.
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { BossDrawFn, BossDrawSet } from '../bossdraw';
import type { G } from '../common';

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
    case 'brace': return { ang: 0, crouch: 8, reach: 18 };
    default: return { ang: -0.5, crouch: 0, reach: 34 };
  }
}

const base: BossDrawFn = (_w: World, b: Boss, g: G, now: number, c): void => {
  const f = b.face, cx = b.x + b.w / 2 + c.lean, fy = b.y + b.h, fl = b.flash > 0;
  const shell = fl ? 0xffffff : SHELL, shade = fl ? 0xffffff : SHADE;
  const idle = b.state === 'idle' || b.state === 'intro';
  const pose = c.d.atk ? c.def.attacks.find((a) => a.id === c.d.atk)?.tell.cue.pose ?? '' : '';
  const bp = c.tell ? bladePose(pose, c.k) : b.state === 'active' ? { ang: 0.05, crouch: 3, reach: 62 } : b.state === 'recover' ? { ang: 1.3, crouch: 6, reach: 30 } : { ang: 1.0, crouch: 0, reach: 28 };
  const bob = idle ? Math.sin(now * 3) * 1.5 : 0, cr = bp.crouch;
  // тень на полу
  g.fillStyle(0x000000, 0.3); g.fillEllipse(cx, fy - 2, b.w + 10, 7);
  // плащ-юбка (клин) и тонкие ноги
  g.fillStyle(VOID, 1); g.fillTriangle(cx - 17, fy - 4, cx + 17, fy - 4, cx - f * 3, b.y + 34 + cr);
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
