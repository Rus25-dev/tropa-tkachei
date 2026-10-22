// Нота: падает дугой, лопается о пол. Срезается обычным ударом.
import { T } from '../../core/balance';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'note', order: 5, netId: 5, size: [14, 18], data: true, slash: true,
  step: (sc, pr, dt) => {
    pr.vy = Math.min(pr.vy + 900 * dt, 700); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (sc.isSolid(Math.floor((pr.x + 7) / T), Math.floor((pr.y + 16) / T))) { pr.dead = true; sc.burst(5, pr.x + 7, pr.y + 14, 0xffd47a); }
  },
  guest: (pr, dt) => { pr.vy = Math.min(pr.vy + 1100 * dt, 800); },
});
