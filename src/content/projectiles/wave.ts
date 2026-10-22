// Волна по полу: идёт до стены; прочная (не гаснет, задев героя) и тяжёлая (урон 2).
import { T } from '../../core/balance';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'wave', order: 1, netId: 1, size: [24, 18], data: true, persist: true, heavy: true,
  step: (sc, pr, dt) => {
    pr.x += pr.vx * dt;
    const fx = pr.vx > 0 ? pr.x + pr.w : pr.x;
    if (sc.isSolid(Math.floor(fx / T), Math.floor((pr.y + 9) / T))) pr.dead = true;
  },
});
