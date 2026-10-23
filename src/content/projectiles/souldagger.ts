import { T } from '../../core/balance';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'souldagger', order: 8, netId: 13, size: [12, 12], data: true, dieOnStagger: true, cancelOnInterrupt: true,
  step: (sc, pr, dt) => {
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (sc.isSolid(Math.floor((pr.x + pr.w / 2) / T), Math.floor((pr.y + pr.h / 2) / T))) pr.dead = true;
  },
});
