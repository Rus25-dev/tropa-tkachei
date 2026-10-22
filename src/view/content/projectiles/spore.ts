// Спора: отрисовка.
import { defineProjView } from '../regs';
import { floorWarn } from './_floor';

export default defineProjView({
  id: 'spore',
  draw: (fx, pr) => {
    if (floorWarn(fx, pr)) return;
    fx.fillStyle(0xc7f08a, 0.25); fx.fillCircle(pr.x + 6, pr.y + 6, 10);
    fx.fillStyle(0xa8d86a, 1); fx.fillCircle(pr.x + 6, pr.y + 6, 6); fx.fillStyle(0xe8ffc0, 1); fx.fillCircle(pr.x + 4, pr.y + 4, 2);
  },
});
