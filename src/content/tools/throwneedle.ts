// Метательная игла: летит по прямой, пробивает слабых врагов, втыкается в стену и в босса; подобрать — вернёт нить.
import { T, TOOL } from '../../core/balance';
import { defineTool } from '../../core/tool-kit';
import { liveBoss, toolHurtBoss, toolHurtEnemy, toolOwner } from '../../core/tools';
import { inset, overlap } from '../../core/world';

export default defineTool({
  id: 'throwneedle', order: 0, name: 'Метательная игла', desc: 'Летит по прямой (↑ или ↑+→ — вверх и по диагонали), пробивает слабых врагов, втыкается в стену и в босса на 3 с. Урон 2. Подбери — вернёт нить.',
  cost: 1, cd: 0.5, unlock: 'boss:penitent',
  spawn: (sc, m) => {
    (sc.tl as Record<string, unknown>[]).push({ kind: 'tneedle', x: m.x + m.dx * 14 - 6, y: m.y + m.dy * 14 - 6, w: 12, h: 12, vx: m.dx * TOOL.NEEDLE_SPD, vy: m.dy * TOOL.NEEDLE_SPD, st: 0, ft: 0.65, life: 25, owner: m.i, hit: new Set(), ang: Math.atan2(m.dy, m.dx) });
  },
  entities: [{
    // st: 0 полёт, 1 в стене, 2 в боссе, 3 падает, 4 лежит
    id: 'tneedle', netId: 8, size: [12, 12],
    netCh: (q) => [q['st'], Math.round(q['ang'] * 100) / 100, q['st'] === 2 ? Math.round(q['stuckT'] * 10) / 10 : 0],
    step: (sc, q, dt, bosses) => {
      const owner = toolOwner(sc, q['owner']);
      if (q['st'] === 0) { // полёт: два подшага, чтобы не пролетать сквозь тонкие стены
        q['ft'] -= dt; if (q['ft'] <= 0) { q['st'] = 3; q['vx'] *= 0.2; q['vy'] = 0; }
        for (let s = 0; s < 2 && q['st'] === 0; s++) {
          const px = q['x'], py = q['y'];
          q['x'] += q['vx'] * dt / 2; q['y'] += q['vy'] * dt / 2;
          const cx = q['x'] + 6, cy = q['y'] + 6;
          if (sc.isSolid(Math.floor(cx / T), Math.floor(cy / T))) {
            q['x'] = px; q['y'] = py; q['st'] = 1; q['vx'] = q['vy'] = 0; q['life'] = 25;
            sc.sfx('clink'); sc.burst(5, cx, cy, 0xffe3a3); break;
          }
          for (const e of sc.enemies) {
            if (e.dead || q['hit'].has(e) || !overlap(q as never, e)) continue;
            q['hit'].add(e);
            const ok = toolHurtEnemy(sc, e, TOOL.NEEDLE_DMG, Math.sign(q['vx']) || 1, false);
            if (!ok) { q['st'] = 3; q['vx'] = -q['vx'] * 0.15; q['vy'] = -120; sc.sfx('clink'); break; }
            if (!e.dead) { q['st'] = 3; q['vx'] = -Math.sign(q['vx']) * 40; q['vy'] = -140; break; } // не пробила — упала; слабых (убитых) пробивает насквозь
          }
          if (q['st'] !== 0) break;
          for (const [b, key] of bosses) {
            if (!liveBoss(b) || !overlap(q as never, inset(b, 4))) continue;
            if (b.state === 'rage') { sc.sfx('clink'); q['st'] = 3; q['vx'] = -q['vx'] * 0.15; q['vy'] = -120; break; }
            toolHurtBoss(sc, key, owner, TOOL.NEEDLE_DMG);
            q['st'] = 2; q['boss'] = b; q['ox'] = q['x'] - b.x; q['oy'] = q['y'] - b.y; q['stuckT'] = TOOL.NEEDLE_STICK; q['vx'] = q['vy'] = 0;
            sc.sfx('clink'); break;
          }
        }
      } else if (q['st'] === 2) { // воткнута в босса
        const b = q['boss']; q['stuckT'] -= dt;
        if (b && liveBoss(b)) { q['x'] = b.x + q['ox']; q['y'] = b.y + q['oy']; }
        if (q['stuckT'] <= 0 || !b || !liveBoss(b)) { q['st'] = 3; q['vx'] = 0; q['vy'] = -80; q['boss'] = null; }
      } else if (q['st'] === 3) { // падает
        q['vy'] = Math.min(q['vy'] + 1100 * dt, 800); sc.moveBody(q as never, dt);
        if (q['onGround']) { q['st'] = 4; q['vx'] = q['vy'] = 0; }
      }
      // подобрать обратно (владелец): нить возвращается
      if ((q['st'] === 1 || q['st'] === 4) && owner && !owner.downed) {
        const r = { x: q['x'] - 22, y: q['y'] - 22, w: 56, h: 56 };
        if (overlap(owner, r)) {
          q['dead'] = true; sc.snd('pickup');
          if (owner.remote) sc.sendEv({ k: 'silk', i: owner.i }); else owner.silk = Math.min(sc.silkMax, owner.silk + 1);
          sc.burst(6, q['x'] + 6, q['y'] + 6, owner.pal.accent);
        }
      }
    },
  }],
});
