// Нитяная бомба: бросок дугой, взрыв радиусом 90.
import { TOOL } from '../../core/balance';
import { defineTool, type Q } from '../../core/tool-kit';
import { liveBoss, toolExplode, toolOwner } from '../../core/tools';
import { inset, overlap } from '../../core/world';

export default defineTool({
  id: 'threadbomb', order: 2, name: 'Нитяная бомба', desc: 'Бросок дугой. Взрыв радиусом 90: урон 3 врагам и боссу, отброс, сбивает снаряды.',
  cost: 0, legacyCost: 3, charges: 3, cd: 2, unlock: 'shop:70',
  spawn: (sc, m) => {
    const up = m.dy < 0, down = m.dy > 0, diag = m.dx !== 0;
    const vx = up || down ? (diag ? m.f * 240 : 0) : m.f * 340, vy = up ? (diag ? -520 : -680) : down ? 340 : -330;
    (sc.tl as Q[]).push({ kind: 'tbomb', x: m.x + m.f * 8 - 6, y: m.y - 8, w: 12, h: 12, vx, vy, fuse: TOOL.BOMB_FUSE, life: 5, owner: m.i });
  },
  entities: [{
    id: 'tbomb', netId: 10, size: [12, 12],
    step: (sc, q, dt, bosses) => {
      q['vy'] = Math.min(q['vy'] + 1100 * dt, 800); q['fuse'] -= dt;
      sc.moveBody(q as never, dt);
      if (q['onGround']) { q['vx'] *= 0.75; if (Math.abs(q['vy']) < 1) q['vy'] = 0; }
      if (q['hitL'] || q['hitR']) q['vx'] = 0;
      let boom = q['fuse'] <= 0;
      if (!boom) for (const e of sc.enemies) if (!e.dead && overlap(q as never, e)) { boom = true; break; }
      if (!boom) for (const [b] of bosses) if (liveBoss(b) && overlap(q as never, inset(b, 4))) { boom = true; break; }
      if (!boom) return;
      q['dead'] = true;
      toolExplode(sc, q['x'] + 6, q['y'] + 6, toolOwner(sc, q['owner']));
    },
  }],
});
