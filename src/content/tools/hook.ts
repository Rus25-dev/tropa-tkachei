// Нитяной крюк: нить на 260 px; стена или платформа — тянет героя, враг — подтягивает и оглушает мелкого, оглушённый босс — удар.
// Тягу героя к точке ведёт общий механизм ядра (tools.hookStep, p['hk']).
import type { BossRef } from '../../core/balance';
import { PLAT, SOLID, T, TOOL } from '../../core/balance';
import { bossRefs } from '../../core/bosses2';
import { enemyDef } from '../../core/enemies';
import { defineTool, toolAim } from '../../core/tool-kit';
import { freezeEnemy, liveBoss, tfxAdd, toolHurtBoss } from '../../core/tools';
import type { Boss, Enemy, Player } from '../../core/types';
import type { World } from '../../core/world';

function hookCast(sc: World, p: Player, a: { dx: number; dy: number; f: number }): void {
  const cx = p.x + 7, cy = p.y + 13;
  type Hit = { k: 'tile'; x: number; y: number; tx: number; ty: number; plat: boolean } | { k: 'enemy'; x: number; y: number; e: Enemy } | { k: 'boss'; x: number; y: number; b: Boss; key: BossRef };
  let hit: Hit | null = null, ex = cx + a.dx * TOOL.HOOK_R, ey = cy + a.dy * TOOL.HOOK_R;
  const bosses = bossRefs(sc).filter(([b]) => liveBoss(b));
  for (let d = 12; d <= TOOL.HOOK_R && !hit; d += 4) {
    const x = cx + a.dx * d, y = cy + a.dy * d, tx = Math.floor(x / T), ty = Math.floor(y / T), t = sc.tileAt(tx, ty);
    if (t === SOLID || t === PLAT) { hit = { k: 'tile', x, y, tx, ty, plat: t === PLAT }; break; }
    for (const e of sc.enemies) if (!e.dead && x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) { hit = { k: 'enemy', x, y, e }; break; }
    if (hit) break;
    for (const [b, key] of bosses) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { hit = { k: 'boss', x, y, b, key }; break; }
  }
  if (hit) { ex = hit.x; ey = hit.y; }
  sc.snd('throw');
  let pull: { x: number; y: number } | null = null;
  if (hit && hit.k === 'tile') {
    sc.snd('clink');
    pull = hit.plat ? { x: hit.x, y: hit.ty * T - 14 } : { x: hit.x - a.dx * 16, y: hit.y - a.dy * 16 };
  } else if (hit && hit.k === 'enemy') {
    const e = hit.e, small = e.hp <= 3 && !enemyDef(e)?.heavy;
    sc.snd('clink');
    if (sc.auth()) freezeEnemy(sc, e, small ? TOOL.HOOK_STUN : 0.2); else sc.sendEv({ k: 'thook', i: p.i, t: 'e', idx: sc.enemies.indexOf(e), s: small ? 1 : 0 });
    if (small) { const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2, k = e.w / 2 + 14; pull = { x: ecx - a.dx * k, y: ecy - a.dy * k }; }
  } else if (hit && hit.k === 'boss') {
    const b = hit.b;
    if (b.stagger > 0 && !b.executed) {
      sc.snd('hitCrit');
      if (sc.auth()) toolHurtBoss(sc, hit.key, p, 1); else sc.sendEv({ k: 'thook', i: p.i, t: 'b', key: hit.key });
      const k = b.w / 2 + 14; pull = { x: b.x + b.w / 2 - a.dx * k, y: b.y + b.h / 2 - a.dy * k };
    } else sc.snd('clink');
  }
  tfxAdd(sc, { f: 'hook', x: cx, y: cy, x1: ex, y1: ey, t: 0.28, T: 0.28, i: p.i }, true);
  if (pull) p['hk'] = { tx: pull.x, ty: pull.y, ax: ex, ay: ey, t: 0.5, stuck: 0 };
}

export default defineTool({
  id: 'hook', order: 6, name: 'Нитяной крюк', desc: 'Нить на 260 px в сторону ввода (↑, вперёд, диагональ). В стену или платформу — притянет героя, во врага — подтянет и оглушит мелкого, в оглушённого босса — удар.',
  cost: 1, cd: 0.9, unlock: 'boss:tima2',
  use: (sc, p) => { hookCast(sc, p, toolAim(p)); return true; },
});
