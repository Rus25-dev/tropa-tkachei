// Существа-приспешники боссов на данных: общий вид (тело цвета существа, глаза, контур замаха) или свой — src/view/draw/boss/<id>.ts → 'creature:<id>'.
// Бледнеющее существо (последние fade кадров жизни) безвредно и рисуется полупрозрачным мигающим.
import type { Enemy } from '../../core/types';
import type { MinionRt } from '../../core/boss/minions';
import { bossDef } from '../../core/boss/registry';
import { creatureDrawer } from './bossdraw';
import { CUE_RGB } from './bosses';
import type { G } from './common';

export function drawMinion(e: Enemy, g: G, now: number): void {
  g.clear();
  const m = e['m'] as MinionRt, cr = bossDef(m.bid)?.creatures.find((c) => c.id === m.cid);
  if (!cr) return;
  const alpha = m.fading ? 0.3 + 0.2 * Math.sin(now * 30) : 1, tell = !!m.cue, rgb = tell ? (CUE_RGB[m.cue!.color] ?? 0xffffff) : 0xffffff;
  g.setAlpha(alpha);
  const own = creatureDrawer(m.bid, m.cid);
  if (own) own(e as never, g, now, { color: cr.color, alpha, tell, rgb });
  else {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, f = e.face || 1, fl = e.flash > 0;
    if (cr.fly) { g.fillStyle(0xd8f0e8, 0.45); const wing = Math.sin(now * 40 + e.t) > 0 ? 1 : 0.5; g.fillEllipse(cx - e.w * 0.3, cy - e.h * 0.45, e.w * 0.5, e.h * 0.3 * wing); g.fillEllipse(cx + e.w * 0.3, cy - e.h * 0.45, e.w * 0.5, e.h * 0.3 * wing); }
    g.fillStyle(fl ? 0xffffff : cr.color, 1); g.fillEllipse(cx, cy, e.w, e.h);
    g.fillStyle(0x1a1410, 1); g.fillCircle(cx + f * e.w * 0.18, cy - e.h * 0.1, Math.max(2, e.w * 0.08)); g.fillCircle(cx + f * e.w * 0.36, cy - e.h * 0.1, Math.max(2, e.w * 0.08));
  }
  if (tell) { // контур замаха — цвет по типу удара, как у босса
    const on = Math.sin(now * (6 + (1 - m.cue!.left / m.cue!.total) * 16) * Math.PI * 2) > -0.2;
    if (on) { g.lineStyle(2.5, rgb, 0.95); g.strokeRoundedRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6, 8); }
  }
}
