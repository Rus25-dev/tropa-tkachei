// Плевок: отрисовка.
import { defineProjView } from '../regs';

export default defineProjView({
  id: 'glob', round: true,
  draw: (fx, pr) => {
    const x = pr.x + 6, y = pr.y + 6;
    fx.fillStyle(0xc7f08a, 0.2); fx.fillCircle(x, y, 11);
    fx.fillStyle(0x86a342, 1); fx.fillCircle(x, y, 6.5); fx.fillStyle(0xd5f26a, 1); fx.fillCircle(x - 1.5, y - 1.5, 3);
    fx.fillStyle(0x86a342, 0.6); fx.fillCircle(x - pr.vx * 0.02, y - pr.vy * 0.02, 3.5); // хвостик капли
  },
});
