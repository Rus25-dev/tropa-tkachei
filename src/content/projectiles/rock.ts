// Камень с потолка: падает до пола и рассыпается пылью. Срезается только ударом, который рубит всё.
import { T } from '../../core/balance';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'rock', order: 2, netId: 2, size: [16, 16], data: true, cutAll: true,
  step: (sc, pr, dt) => {
    pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.y += pr.vy * dt;
    if (sc.isSolid(Math.floor((pr.x + 8) / T), Math.floor((pr.y + 16) / T))) { pr.dead = true; sc.dustAt(8, pr.x + 8, pr.y + 16); }
  },
  guest: (pr, dt) => { pr.vy = Math.min(pr.vy + 1100 * dt, 800); },
});
