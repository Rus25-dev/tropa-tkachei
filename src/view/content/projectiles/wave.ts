// Волна: отрисовка.
import { defineProjView } from '../regs';
import { floorWarn } from './_floor';

export default defineProjView({
  id: 'wave',
  draw: (fx, pr, now) => {
    if (floorWarn(fx, pr)) return;
    fx.fillStyle(0x9ff0c8, 0.3); fx.fillEllipse(pr.x + 12, pr.y + 14, 34, 18);
    fx.fillStyle(0x6b8f6a, 1);
    for (let i = 0; i < 3; i++) fx.fillTriangle(pr.x + i * 8, pr.y + 18, pr.x + 4 + i * 8, pr.y + 2 + Math.sin(now * 30 + i) * 3, pr.x + 8 + i * 8, pr.y + 18);
  },
});
