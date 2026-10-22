// Рисунок Владика на данных (vladik2): тело-скрипка со смычком по позе замаха. Его снаряды (ключи, ноты, эхо) рисует src/view/content/projectiles.
// Телеграф (контур замаха, места ударов, окно наказания) рисует общий код поверх тела — этот файл только вид.
import type { Boss } from '../../../core/types';
import type { World } from '../../../core/world';
import type { DrawCtx } from '../bossdraw';
import type { G } from '../common';

/** тело: скрипка с головой в очках и смычком; поза замаха меняет руку и осанку */
function base(w: World, b: Boss, g: G, now: number, c: DrawCtx): void {
  const f = b.face, fl = b.flash > 0, cx = b.x + b.w / 2 + (c.tell ? Math.sin(now * 70) * 1.2 : 0) + c.lean, fy = b.y + b.h;
  const walk = Math.abs(b.vx) > 5, legA = walk ? Math.sin(now * 14) * 5 : 0;
  const cur = c.tell ? (c.def.attacks.find((a) => a.id === c.d.atk)?.tell.cue.pose ?? '') : '';
  const squat = cur === 'crouch' || cur === 'crouch_thrust' ? 6 : 0, armUp = cur === 'raise_bow' || cur === 'clef_up' || cur === 'clef_up3' || cur === 'staff_low' || cur === 'staff_high' || cur === 'echo_wind' || cur === 'overhead' || cur === 'smear';
  g.lineStyle(3, 0x1a1410, 1); g.lineBetween(cx - 6, fy - 20, cx - 6 + legA, fy); g.lineBetween(cx + 6, fy - 20, cx + 6 - legA, fy);
  g.fillStyle(0x1a1410, 1); g.fillEllipse(cx - 6 + legA + 3 * f, fy - 1, 11, 5); g.fillEllipse(cx + 6 - legA + 3 * f, fy - 1, 11, 5);
  const by = fy - 20 + squat;
  const wood = fl ? 0xffffff : c.e.color, woodHi = fl ? 0xffffff : 0xc0712f;
  g.fillStyle(wood, 1); g.fillEllipse(cx, by - 14, 38, 30); g.fillEllipse(cx, by - 40, 30, 26); g.fillRect(cx - 10, by - 36, 20, 16);
  g.fillStyle(woodHi, 0.6); g.fillEllipse(cx - 6, by - 18, 14, 18); g.fillEllipse(cx - 5, by - 44, 10, 12);
  g.fillStyle(0x24302e, 1); g.fillEllipse(cx - 17, by - 27, 7, 10); g.fillEllipse(cx + 17, by - 27, 7, 10);
  g.lineStyle(1.6, 0x2a140a, 1);
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 9, by - 30); g.lineTo(cx + s * 7, by - 22); g.lineTo(cx + s * 9, by - 14); g.strokePath(); }
  g.fillStyle(0x1a1410, 1); g.fillRect(cx - 4, by - 8, 8, 8);
  g.fillStyle(0xe8d9b0, 1); g.fillRect(cx - 7, by - 22, 14, 3);
  g.lineStyle(0.8, 0xf4efe0, 0.9); for (let i = 0; i < 4; i++) g.lineBetween(cx - 3 + i * 2, by - 52, cx - 3 + i * 2, by - 6);
  g.fillStyle(0x1a1410, 1); g.fillRect(cx - 3, by - 58, 6, 12);
  const hx = cx + 3 * f, hy = by - 68;
  g.fillStyle(fl ? 0xffffff : 0xd9b98f, 1); g.fillCircle(hx, hy, 13);
  g.lineStyle(4, 0x3b2215, 1); g.beginPath(); g.arc(hx - 2 * f, hy - 16, 6, 0, Math.PI * 1.6, false); g.strokePath();
  g.fillStyle(0x3b2215, 1); g.fillEllipse(hx - 3 * f, hy - 10, 26, 8);
  g.lineStyle(1.8, 0x1a1410, 1); g.strokeCircle(hx + 4 * f, hy + 1, 4.5); g.strokeCircle(hx + 12 * f, hy + 1, 4);
  g.fillStyle(0x1a1410, 1); g.fillCircle(hx + 5 * f, hy + 1.5, 1.6); g.fillCircle(hx + 12.5 * f, hy + 1.5, 1.5);
  if (c.tell || b.state === 'active') g.fillEllipse(hx + 8 * f, hy + 9, 6, 4 + Math.abs(Math.sin(now * 14)) * 3); else g.fillRect(Math.min(hx + 5 * f, hx + 11 * f), hy + 9, 6, 1.5);
  // рука со смычком: поднята в замахе, вытянута в ударе
  const hx2 = cx + f * (b.state === 'active' ? 36 : armUp ? 30 : 20), hy2 = by - (b.state === 'active' ? 36 : armUp ? 50 : 30);
  g.lineStyle(3, 0x1a1410, 1); g.lineBetween(cx + 12 * f, by - 44, hx2, hy2);
  g.lineStyle(2, 0xe8d9b0, 1); g.lineBetween(hx2, hy2, hx2 - f * 34, hy2 + (armUp ? 28 : 18));
}

export default { base };
