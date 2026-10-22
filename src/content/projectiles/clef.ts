// Скрипичный ключ Владика (kinds/vladik2.ts): бумеранг — вылетает, тормозит, возвращается к Владику и гаснет. Прочный; рубится ударом «рубит всё».
import { T, clamp } from '../../core/balance';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'clef', order: 4, netId: 4, size: [28, 40], persist: true, cutAll: true,
  step: (sc, pr, dt) => {
    const q = pr as unknown as Record<string, number>;
    if (q['t0']! > 0) { q['t0']! -= dt; return; }
    pr.vx += q['ax']! * dt; pr.x += pr.vx * dt; q['rot']! += dt * 10;
    pr.y += Math.sin(pr.life * 6) * 30 * dt;
    // вернулся к Владику — исчез
    if (Math.sign(pr.vx) === Math.sign(q['ax']!) && Math.abs(pr.x + 14 - q['home']!) < 30) pr.dead = true;
    if (pr.x < T || pr.x + pr.w > (sc.L.W - 1) * T) { pr.vx = -pr.vx * 0.6; pr.x = clamp(pr.x, T, (sc.L.W - 1) * T - pr.w); }
  },
  guest: (pr, dt) => { pr['rot'] = (pr['rot'] || 0) + dt * 10; },
});
