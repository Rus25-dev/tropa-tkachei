// Дымовая бомба героя: отрисовка.
import { defineProjView } from '../regs';

export default defineProjView({
  id: 'bomb',
  draw: (fx, pr, now) => {
    const x = pr.x + 6, y = pr.y + 6;
    fx.fillStyle(0x3a3f45, 1); fx.fillCircle(x, y, 6); fx.fillStyle(0x9aa39f, 1); fx.fillCircle(x - 2, y - 2, 1.6);
    fx.lineStyle(1.5, 0xffd47a, 1); fx.lineBetween(x + 2, y - 5, x + 4, y - 9);
    fx.fillStyle(0xffd47a, 0.6 + Math.abs(Math.sin(now * 40)) * 0.4); fx.fillCircle(x + 4, y - 10, 2);
  },
});
