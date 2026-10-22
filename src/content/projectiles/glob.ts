// Плевок: дуга под гравитацией, лопается о стену. Срезается обычным ударом.
import { T } from '../../core/balance';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'glob', order: 7, netId: 7, size: [12, 12], data: true, slash: true,
  step: (sc, pr, dt) => {
    pr.vy += 700 * dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (sc.isSolid(Math.floor((pr.x + 6) / T), Math.floor((pr.y + 6) / T))) { pr.dead = true; sc.burst(7, pr.x + 6, pr.y + 6, 0xc7f08a); }
  },
});
