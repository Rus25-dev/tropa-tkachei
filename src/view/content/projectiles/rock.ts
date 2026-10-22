// Камень: отрисовка.
import { defineProjView } from '../regs';
import { floorWarn } from './_floor';

export default defineProjView({
  id: 'rock',
  draw: (fx, pr) => {
    if (floorWarn(fx, pr)) return;
    fx.fillStyle(0x2b3d36, 1); fx.fillRoundedRect(pr.x, pr.y, 16, 16, 4); fx.fillStyle(0x3b7448, 1); fx.fillRect(pr.x + 2, pr.y, 12, 3);
  },
});
