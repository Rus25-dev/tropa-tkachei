// Спора: летит дугой под гравитацией, лопается о стену. Срезается ударом (зелёные брызги, решает только хост); гаснет при оглушении босса.
import { T } from '../../core/balance';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'spore', order: 0, netId: 0, size: [12, 12], data: true, dieOnStagger: true,
  slash: { onCut: (sc, pr) => sc.burst(6, pr.x + 6, pr.y + 6, 0xc7f08a), guestCut: false },
  step: (sc, pr, dt) => {
    pr.vy += 700 * dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (sc.isSolid(Math.floor((pr.x + 6) / T), Math.floor((pr.y + 6) / T))) { pr.dead = true; sc.burst(6, pr.x + 6, pr.y + 6, 0xc7f08a); }
  },
  guest: (pr, dt) => { pr.vy += 700 * dt; },
});
