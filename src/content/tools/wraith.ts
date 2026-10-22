// Вопль (навык нити, Howling Wraiths): столб нити вверх, четыре удара по всем внутри, сбивает снаряды.
import { KIT } from '../../core/balance';
import { spellMsg } from '../../core/kit/spells';
import { defineTool, type Q } from '../../core/tool-kit';
import { liveBoss, toolHurtBoss, toolHurtEnemy, toolOwner } from '../../core/tools';
import { inset, overlap } from '../../core/world';

const kdirOf = (e: { x: number; w: number }, cx: number): number => Math.sign(e.x + e.w / 2 - cx) || 1;
export default defineTool({
  id: 'wraith', order: 5, name: 'Вопль', desc: 'Столб нити вверх на 200 px над вами: четыре удара подряд по всем внутри, подбрасывает врагов и сбивает снаряды (кроме фиолетовых). Стоит 3 нити.',
  cost: KIT.WRAITH.COST, cd: KIT.WRAITH.CD, unlock: 'shop:120', nominalDmg: KIT.WRAITH.DMG * KIT.WRAITH.PULSES,
  use: (sc, p) => spellMsg(sc, p, 'wraith', p.y + p.h, 'wraith'),
  spawn: (sc, m) => {
    const life = KIT.WRAITH.PULSES * KIT.WRAITH.GAP + 0.3;
    (sc.tl as Q[]).push({ kind: 'twraith', x: m.x - KIT.WRAITH.W / 2, y: m.y - KIT.WRAITH.H, w: KIT.WRAITH.W, h: KIT.WRAITH.H, vx: 0, vy: 0, life, T: life, owner: m.i, n: 0, gap: 0 });
    sc.burst(10, m.x, m.y - 6, 0xcfe8ff);
  },
  entities: [{
    id: 'twraith', netId: 12, size: [KIT.WRAITH.W, KIT.WRAITH.H],
    netCh: (q) => [Math.round(q['life'] * 100) / 100, q['n'] | 0],
    step: (sc, q, dt, bosses) => {
      const owner = toolOwner(sc, q['owner']);
      q['gap'] -= dt;
      if (q['gap'] > 0 || q['n'] >= KIT.WRAITH.PULSES) return;
      q['gap'] += KIT.WRAITH.GAP; q['n']++;
      const cx = q['x'] + q['w'] / 2;
      sc.sfx('hit');
      for (const e of sc.enemies) {
        if (e.dead || !overlap(q as never, e)) continue;
        if (toolHurtEnemy(sc, e, KIT.WRAITH.DMG, kdirOf(e, cx), false) && !e.dead) { e.kby = -260; e.kbx *= 0.3; }
      }
      for (const [b, key] of bosses) if (liveBoss(b) && b.state !== 'rage' && overlap(q as never, inset(b, 2))) toolHurtBoss(sc, key, owner, KIT.WRAITH.DMG, { weak: 'geometry', shape: { type: 'rect', rect: q as never } });
      for (const pr of sc.projs) {
        if (pr.dead || pr.kind === 'bomb' || pr.hk === 'unblockable' || (pr.delay ?? 0) > 0 || !overlap(q as never, pr)) continue;
        pr.dead = true; sc.burst(5, pr.x + pr.w / 2, pr.y + pr.h / 2, 0xcfe8ff);
      }
      sc.burst(6, cx + (q['n'] % 2 ? -8 : 8), q['y'] + q['h'] - 24 * q['n'], 0xcfe8ff);
    },
  }],
});
