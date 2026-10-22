// Тихий шаг: рывок перезаряжается на 25 % быстрее.
import { defineCharm } from '../../core/charm-kit';

export default defineCharm({
  id: 'stride', order: 4, name: 'Тихий шаг', desc: 'Рывок перезаряжается на 25 % быстрее.', unlock: 'shop:40', slots: 1, col: 0xb9d4c8,
  stepPre: (_sc, p, dt) => { if (p.dashCd > 0) p.dashCd -= dt * 0.25; },
});
