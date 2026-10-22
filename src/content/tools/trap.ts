// Капкан: ставится у ног, замораживает наступившего врага; босс копит стойку.
import { TOOL } from '../../core/balance';
import { poiseAdd } from '../../core/bosses2';
import { defineTool, type Q } from '../../core/tool-kit';
import { freezeEnemy, liveBoss, tfxAdd } from '../../core/tools';
import type { World } from '../../core/world';
import { overlap } from '../../core/world';

function trapSnap(sc: World, q: Q, boss?: boolean): void {
  q['dead'] = true; sc.sfx('slam'); sc.shake(80, 0.004);
  sc.burst(14, q['x'] + q['w'] / 2, q['y'], 0xffe3a3); tfxAdd(sc, { f: 'snap', x: q['x'] + q['w'] / 2, y: q['y'] + q['h'], t: 0.35, T: 0.35 }, true);
  if (boss) sc.toastAll('Капкан! Стойка босса растёт');
}

export default defineTool({
  id: 'trap', order: 1, name: 'Капкан', desc: 'Ставится у ног на 8 с. Враг, наступивший на него, замирает на 2 с; босс копит стойку (+3), но не замирает. Не больше двух.',
  cost: 2, cd: 1.5, unlock: 'shop:50', castY: 26, castSnd: 'pickup',
  spawn: (sc, m) => {
    const tl = sc.tl as Q[];
    const mine = tl.filter((q) => q['kind'] === 'ttrap' && q['owner'] === m.i);
    if (mine.length >= TOOL.TRAP_MAX) mine[0]!['life'] = 0; // третий капкан заменяет самый старый
    tl.push({ kind: 'ttrap', x: m.x - 13, y: m.y - 10, w: 26, h: 10, vx: 0, vy: 0, life: TOOL.TRAP_LIFE, arm: 0.3, tick: 0, owner: m.i });
    sc.burst(6, m.x, m.y - 3, 0xe8d9a8);
  },
  entities: [{
    id: 'ttrap', netId: 9, size: [26, 10],
    netCh: (q) => [Math.round(q['life'] * 10) / 10, q['arm'] > 0 ? 1 : 0],
    step: (sc, q, dt, bosses) => {
      q['vy'] = Math.min(q['vy'] + 1100 * dt, 800); q['vx'] = 0; sc.moveBody(q as never, dt);
      if (q['arm'] > 0) { q['arm'] -= dt; return; }
      q['tick'] -= dt;
      const cx = q['x'] + q['w'] / 2, cy = q['y'] + q['h'] / 2;
      let near = false;
      for (const e of sc.enemies) {
        if (e.dead || e.type === 'lurker') continue;
        if (Math.abs(e.x + e.w / 2 - cx) < 200 && Math.abs(e.y + e.h / 2 - cy) < 100) near = true;
        if (overlap(q as never, { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 2 }) && !((e['frozenT'] as number) > 0)) {
          freezeEnemy(sc, e, TOOL.TRAP_FREEZE); return trapSnap(sc, q);
        }
      }
      for (const [b] of bosses) {
        if (!liveBoss(b)) continue;
        if (overlap(q as never, { x: b.x + 4, y: b.y + 4, w: b.w - 8, h: b.h - 4 })) { poiseAdd(sc, b, TOOL.TRAP_POISE); return trapSnap(sc, q, true); }
      }
      if (near && q['tick'] <= 0) { q['tick'] = 0.8; sc.sfx('clink'); } // предупреждающий щелчок, когда враг рядом
    },
  }],
});
