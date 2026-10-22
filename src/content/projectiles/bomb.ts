// Дымовая бомба героя (арена Миши): полёт и попадание в рюкзак — src/core/bombs.ts. Героев не ранит.
import { stepBomb } from '../../core/bombs';
import { defineProj } from '../../core/proj-kit';

export default defineProj({
  id: 'bomb', order: 3, netId: 3, size: [12, 12], hero: true,
  step: (sc, pr, dt) => stepBomb(sc, pr, dt),
  guest: (pr, dt) => { pr.vy = Math.min(pr.vy + 1100 * dt, 800); },
});
