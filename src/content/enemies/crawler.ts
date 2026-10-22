// Ползун: ходит туда-сюда по платформе, разворачивается у края и стены.
import { P } from '../../core/balance';
import { defineEnemy } from '../../core/enemy-kit';
import type { Enemy } from '../../core/types';

export default defineEnemy({
  id: 'crawler', order: 0,
  spawn: (_sc, _d, base, { fx, fy }) => [{ ...base, w: 26, h: 16, x: fx - 13, y: fy - 16, hp: 3, vx: -45, beads: 3 } as Enemy],
  step: (sc, e, dt) => {
    const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
    if (e.onGround && !sc.groundBelowSolid(frontX, e.y + e.h + 4)) e.face = -e.face;
    e.vx = e.face * 45;
    e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    sc.moveBody(e, dt);
    if (e.hitL || e.hitR) e.face = -e.face;
  },
});
