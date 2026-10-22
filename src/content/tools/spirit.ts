// Нитяной снаряд (навык нити, Vengeful Spirit): летящая волна нити вперёд.
import { KIT, T } from '../../core/balance';
import { spellMsg } from '../../core/kit/spells';
import { defineTool, type Q } from '../../core/tool-kit';
import { liveBoss, toolHurtBoss, toolHurtEnemy, toolOwner } from '../../core/tools';
import { inset, overlap } from '../../core/world';

const SIZE: [number, number] = [28, 22];
export default defineTool({
  id: 'spirit', order: 3, name: 'Нитяной снаряд', desc: 'Летящая волна нити вперёд на ~550 px: пробивает слабых врагов, крепких и босса бьёт на 3 и тает. Стоит 2 нити.',
  cost: KIT.SPIRIT.COST, cd: KIT.SPIRIT.CD, unlock: 'shop:80', nominalDmg: KIT.SPIRIT.DMG,
  use: (sc, p) => spellMsg(sc, p, 'spirit', p.y + 13, 'spirit'),
  spawn: (sc, m) => {
    const [w, h] = SIZE;
    (sc.tl as Q[]).push({ kind: 'tspirit', x: m.x + m.f * 12 - w / 2, y: m.y - h / 2, w, h, vx: m.f * KIT.SPIRIT.SPD, vy: 0, life: KIT.SPIRIT.LIFE, owner: m.i, hit: new Set(), f: m.f, age: 0 });
  },
  entities: [{
    id: 'tspirit', netId: 11, size: SIZE,
    netCh: (q) => [q['f'], Math.round(q['age'] * 100) / 100],
    step: (sc, q, dt, bosses) => {
      const owner = toolOwner(sc, q['owner']), f = q['f'] as number;
      q['age'] += dt;
      for (let s = 0; s < 2 && !q['dead']; s++) {
        q['x'] += q['vx'] * dt / 2;
        const cx = q['x'] + q['w'] / 2, cy = q['y'] + q['h'] / 2;
        if (sc.isSolid(Math.floor((cx + f * q['w'] / 2) / T), Math.floor(cy / T))) { q['dead'] = true; sc.sfx('clink'); sc.burst(8, cx, cy, 0xcfe8ff); break; }
        for (const e of sc.enemies) {
          if (e.dead || q['hit'].has(e) || !overlap(q as never, e)) continue;
          q['hit'].add(e);
          const ok = toolHurtEnemy(sc, e, KIT.SPIRIT.DMG, f, false);
          if (!ok || !e.dead) { q['dead'] = true; sc.burst(8, cx, cy, 0xcfe8ff); break; } // броня и крепких не пробивает; слабых (убитых) — насквозь
        }
        if (q['dead']) break;
        for (const [b, key] of bosses) {
          if (!liveBoss(b) || !overlap(q as never, inset(b, 4))) continue;
          if (b.state === 'rage') { sc.sfx('clink'); q['dead'] = true; sc.burst(6, cx, cy, 0xffffff); break; }
          toolHurtBoss(sc, key, owner, KIT.SPIRIT.DMG);
          q['dead'] = true; sc.sfx('clink'); sc.burst(14, cx, cy, 0xcfe8ff); break;
        }
      }
      if (!q['dead'] && Math.floor(q['age'] * 60) % 3 === 0) sc.parts(1, q['x'] + q['w'] / 2 - f * 10, q['y'] + q['h'] / 2, 0xcfe8ff);
    },
  }],
});
