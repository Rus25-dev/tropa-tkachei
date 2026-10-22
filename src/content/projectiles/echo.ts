// Эхо Владика (kinds/vladik2.ts): призрак бежит вдоль пола и исчезает за дальней стеной. Прочное и тяжёлое.
import { T } from '../../core/balance';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'echo', order: 6, netId: 6, size: [40, 84], persist: true, heavy: true,
  step: (sc, pr, dt) => {
    pr.x += pr.vx * dt;
    if ((pr.vx < 0 && pr.x < T - 60) || (pr.vx > 0 && pr.x + pr.w > (sc.L.W - 1) * T + 60)) pr.dead = true;
  },
});
