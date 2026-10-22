// Рисунок Миши Додика на данных (misha2): та же фигура, что у старого автомата (толстовка, кепка козырьком назад, оранжевый рюкзак), позы — из cue.pose.
// Телеграф (контур замаха, места ударов, окно наказания, уязвимая точка) рисует общий код поверх; здесь только тело.
// Вариант 'zipped' — последняя четверть боя: рюкзак застёгнут на замок и замок блестит, когда Миша выдохся (окно, в котором бить можно).
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { BossDrawFn, DrawCtx } from '../bossdraw';
import type { G } from '../common';

const BAG = { w: 30, h: 40 };

function drawMisha(zipped: boolean): BossDrawFn {
  return (_w: World, b: Boss, g: G, now: number, c: DrawCtx): void => {
    const f = b.face, fl = b.flash > 0, dead = b.state === 'dead', pose = c.def.attacks.find((a) => a.id === c.d.atk)?.tell.cue.pose ?? '';
    const cx = b.x + b.w / 2 + c.lean, fy = b.y + b.h;
    const walk = Math.abs(b.vx) > 5, charging = b.state === 'active' && pose === 'lean_back';
    const legA = walk || charging ? Math.sin(now * (charging ? 26 : 10)) * 5 : 0;
    const tired = b.state === 'recover' || b.stagger > 0, hunch = tired ? 5 : charging ? 3 : 0;
    const raised = c.tell && (pose.startsWith('arms_up') || pose === 'dictate' || pose === 'stamp_up' || pose === 'folder_up');
    // ноги
    g.lineStyle(5, 0x23262e, 1); g.lineBetween(cx - 10, fy - 14, cx - 10 + legA, fy); g.lineBetween(cx + 10, fy - 14, cx + 10 - legA, fy);
    g.fillStyle(0x23262e, 1); g.fillEllipse(cx - 10 + legA + 3 * f, fy - 1, 14, 6); g.fillEllipse(cx + 10 - legA + 3 * f, fy - 1, 14, 6);
    // рюкзак (сзади); на замахе валика Миша разворачивает его вперёд, поэтому рюкзак всегда за спиной по взгляду
    const bx = cx - 26 * f - BAG.w / 2, by = b.y + 12 + hunch;
    g.fillStyle(fl ? 0xffffff : 0xe08a2c, 1); g.fillRoundedRect(bx, by, BAG.w, BAG.h, 7);
    g.fillStyle(fl ? 0xffffff : 0xa85f17, 1); g.fillRoundedRect(bx + 2, by + 22, 26, 14, 4);
    g.lineStyle(1.5, 0x6a3a0c, 1); g.strokeRoundedRect(bx + 2, by + 22, 26, 14, 4); g.lineBetween(bx + 8, by + 29, bx + 22, by + 29);
    if (zipped) { // застёгнут на все замки; замок светится, пока Миша выдохся
      g.lineStyle(2, 0x6a3a0c, 1); g.lineBetween(bx + 3, by + 3, bx + 27, by + 3);
      for (let k = 0; k < 8; k++) g.lineBetween(bx + 4 + k * 3, by + 1, bx + 4 + k * 3, by + 5);
      const open = c.d.punish || b.stagger > 0, lock = open ? 0x7be39a : 0xc9a227;
      g.fillStyle(lock, 1); g.fillRoundedRect(bx + 11, by + 3, 8, 8, 2); g.lineStyle(1.5, lock, 1); g.strokeCircle(bx + 15, by + 2, 3);
      g.lineStyle(3, 0x7a2a22, 0.9); g.lineBetween(bx + 2, by + 18, bx + 28, by + 18); // ремень поперёк
    } else { g.fillStyle(0x1a1410, 1); g.fillEllipse(bx + 15, by + 2, 24, 8); } // открытая молния
    // толстовка
    g.fillStyle(fl ? 0xffffff : c.e.color, 1); g.fillEllipse(cx + 2 * f, fy - 32 + hunch * 0.5, 52, 46);
    g.lineStyle(2, 0x3a4560, 1);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx + 2 * f, fy - 50 + i * 12 + hunch * 0.5, 24, 0.35 * Math.PI, 0.65 * Math.PI, false); g.strokePath(); }
    // лямки
    g.lineStyle(4, 0xa85f17, 1); g.lineBetween(bx + 15 + 10 * f, by + 6, cx + 12 * f, fy - 22); g.lineBetween(bx + 15 + 8 * f, by + 30, cx + 6 * f, fy - 14);
    // руки: вверх в замахе «букв», вперёд при папке и печати, вниз в покое
    g.lineStyle(5, fl ? 0xffffff : c.e.color, 1);
    if (raised && pose !== 'folder_up' && pose !== 'stamp_up') { g.lineBetween(cx + 14 * f, fy - 44, cx + 22 * f, fy - 72); g.lineBetween(cx + 4 * f, fy - 46, cx - 4 * f, fy - 74); }
    else if (pose === 'folder_up' || pose === 'stamp_up' || b.state === 'active') { const up = c.tell ? -26 - 10 * c.k : 6; g.lineBetween(cx + 14 * f, fy - 44, cx + 34 * f, fy - 44 + up); }
    else g.lineBetween(cx + 18 * f, fy - 40, cx + 26 * f, fy - 24 + (tired ? -10 : 0));
    if (pose === 'push_roller' && c.tell) { g.fillStyle(0x9aa0b0, 1); g.fillRoundedRect(cx + 26 * f - 14, fy - 30, 28, 26, 6); } // валик перед собой
    if (pose === 'folder_up' && c.tell) { g.fillStyle(0xf4efe0, 1); g.fillRect(cx + 30 * f - 8, fy - 82 - 10 * c.k, 18, 24); }
    // голова
    const hx = cx + 8 * f, hy = fy - 66 + hunch;
    g.fillStyle(fl ? 0xffffff : 0x7c86a0, 1); g.fillCircle(hx, hy, 16);
    g.fillStyle(zipped ? 0x8a2a2a : 0xc8463c, 1); g.beginPath(); g.arc(hx, hy - 3, 16, Math.PI, 0, false); g.closePath(); g.fillPath();
    g.fillRect(Math.min(hx - 16 * f, hx - 28 * f), hy - 5, 12, 4);
    g.fillStyle(0xf4efe0, 1); g.fillCircle(hx, hy - 17, 2.5);
    // глаза: крестики, пока Миша выдохся или оглушён
    if (tired || dead) {
      g.lineStyle(2, 0x1a1410, 1);
      for (const ex of [hx + 4 * f, hx + 11 * f]) { g.lineBetween(ex - 3, hy - 1, ex + 3, hy + 5); g.lineBetween(ex + 3, hy - 1, ex - 3, hy + 5); }
    } else {
      g.fillStyle(0xf4efe0, 1); g.fillEllipse(hx + 4 * f, hy + 2, 8, 10); g.fillEllipse(hx + 11 * f, hy + 2, 7, 9);
      g.fillStyle(0x1a1410, 1); g.fillCircle(hx + 5 * f, hy + 3, 2.2); g.fillCircle(hx + 12 * f, hy + 3, 2);
      if (zipped || c.d.mode === 'rage' || charging) { g.lineStyle(2, 0x1a1410, 1); g.lineBetween(hx + 1 * f, hy - 5, hx + 8 * f, hy - 2); g.lineBetween(hx + 14 * f, hy - 4, hx + 9 * f, hy - 2); }
    }
    // рот
    g.fillStyle(0x1a1410, 1);
    if (c.tell || b.state === 'intro') g.fillEllipse(hx + 9 * f, hy + 11, 7, 5 + Math.abs(Math.sin(now * 14)) * 3); else g.fillRect(Math.min(hx + 6 * f, hx + 12 * f), hy + 11, 6, 1.6);
  };
}

export default { base: drawMisha(false), zipped: drawMisha(true) };
