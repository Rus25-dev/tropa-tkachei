import { defineProjView } from '../regs';

export default defineProjView({
  id: 'souldagger',
  draw: (g, pr) => {
    const x = pr.x + pr.w / 2, y = pr.y + pr.h / 2;
    const len = Math.hypot(pr.vx, pr.vy) || 1, dx = pr.vx / len, dy = pr.vy / len;
    g.lineStyle(8, 0xd8d4e8, 0.18); g.lineBetween(x - dx * 18, y - dy * 18, x + dx * 4, y + dy * 4);
    g.fillStyle(0xf4f1ff, 1); g.fillTriangle(x + dx * 8, y + dy * 8, x - dx * 6 - dy * 4, y - dy * 6 + dx * 4, x - dx * 6 + dy * 4, y - dy * 6 - dx * 4);
  },
});
