// Нота: отрисовка.
import { defineProjView } from '../regs';

export default defineProjView({
  id: 'note', round: true,
  draw: (g, pr) => {
    const x = pr.x + 7, y = pr.y + 14;
    g.fillStyle(0x1a1410, 1); g.fillEllipse(x, y, 13, 10); g.fillStyle(0xffd47a, 1); g.fillEllipse(x, y, 10, 7.5);
    g.fillRect(x + 3.5, y - 16, 2.2, 16); g.fillTriangle(x + 5.5, y - 16, x + 12, y - 9, x + 5.5, y - 11);
  },
});
