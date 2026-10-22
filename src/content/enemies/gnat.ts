// Комар: кружит у своего места, заметив героя (до 300 px), летит к нему.
import { T } from '../../core/balance';
import { defineEnemy } from '../../core/enemy-kit';
import type { Enemy } from '../../core/types';

export default defineEnemy({
  id: 'gnat', order: 1, flies: true,
  spawn: (_sc, d, base, { fx }) => [{ ...base, w: 20, h: 18, x: fx - 10, y: d.y * T, hx: fx, hy: d.y * T, hp: 2, beads: 2 } as Enemy],
  step: (sc, e, dt) => {
    const [tp, d] = sc.nearestPlayer(e.x + 10, e.y + 9);
    let tx = e['hx'] + Math.sin(e.t * 0.9) * 40, ty = e['hy'] + Math.sin(e.t * 2.1) * 12, spd = 70;
    if (tp && d < 300) { tx = tp.x + 7; ty = tp.y + 4; spd = 115; }
    const dx = tx - (e.x + 10), dy = ty - (e.y + 9), dl = Math.hypot(dx, dy) || 1;
    e.vx += ((dx / dl) * spd - e.vx) * Math.min(1, dt * 2.2);
    e.vy += ((dy / dl) * spd - e.vy) * Math.min(1, dt * 2.2) + Math.sin(e.t * 9) * 4;
    e.face = e.vx >= 0 ? 1 : -1;
    sc.moveBody(e, dt);
  },
});
