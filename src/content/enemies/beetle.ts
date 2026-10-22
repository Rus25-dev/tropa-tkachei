// Жук: ходит, заметив героя впереди — замах и разбег; на краю или в стене оглушён. Удар по разбегу оглушает.
import { P } from '../../core/balance';
import { defineEnemy } from '../../core/enemy-kit';
import type { Enemy } from '../../core/types';

export default defineEnemy({
  id: 'beetle', order: 2, heavy: true, meleeKb: 120, toolKb: 140,
  spawn: (_sc, _d, base, { fx, fy }) => [{ ...base, w: 36, h: 22, x: fx - 18, y: fy - 22, hp: 6, vx: -40, state: 'walk', st: 0, beads: 6 } as Enemy],
  onHit: (e) => { if (e['state'] === 'charge') { e['state'] = 'stun'; e['st'] = 0.6; } },
  step: (sc, e, dt) => {
    e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    const [tp] = sc.nearestPlayer(e.x + 18, e.y + 11);
    if (e['state'] === 'walk') {
      const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
      if (e.onGround && !sc.groundBelowSolid(frontX, e.y + e.h + 4)) e.face = -e.face;
      e.vx = e.face * 40;
      if (tp) {
        const dx = tp.x + 7 - (e.x + 18), dy = tp.y + 26 - (e.y + 22);
        if (Math.abs(dx) < 250 && Math.abs(dy) < 50 && Math.sign(dx) === e.face) { e['state'] = 'wind'; e['st'] = 0.45; e.vx = 0; }
      }
    } else if (e['state'] === 'wind') {
      e.vx = 0; e['st'] -= dt; if (e['st'] <= 0) { e['state'] = 'charge'; e.vx = e.face * 330; }
    } else if (e['state'] === 'charge') {
      e.vx = e.face * 330;
      const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
      if (e.onGround && !sc.groundBelowSolid(frontX, e.y + e.h + 4)) { e['state'] = 'stun'; e['st'] = 0.7; e.vx = 0; }
    } else if (e['state'] === 'stun') {
      e.vx = 0; e['st'] -= dt; if (e['st'] <= 0) { e['state'] = 'walk'; e.face = -e.face; }
    }
    sc.moveBody(e, dt);
    if (e.hitL || e.hitR) {
      if (e['state'] === 'charge') { e['state'] = 'stun'; e['st'] = 0.9; sc.shake(80, 0.004); }
      else if (e['state'] === 'walk') e.face = -e.face;
    }
  },
});
