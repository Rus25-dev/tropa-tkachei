// Эхо Владика: отрисовка; во время задержки — полупрозрачный призрак и стрелки направления.
import { defineProjView } from '../regs';

export default defineProjView({
  id: 'echo',
  draw: (g, pr, now) => {
    const warn = (pr.delay ?? 0) > 0, a = warn ? 0.22 + Math.sin(now * 24) * 0.1 : 0.7, f = pr.vx > 0 ? 1 : -1, cx = pr.x + 20, fy = pr.y + 84;
    if (!warn) for (let i = 1; i <= 4; i++) { g.fillStyle(0xf4efe0, a * 0.2 / i); g.fillEllipse(cx - f * i * 24, fy - 40, 30, 70); }
    g.fillStyle(0xe8d9b0, a); g.fillEllipse(cx, fy - 22, 36, 30); g.fillEllipse(cx, fy - 46, 28, 26);
    g.fillStyle(0xc0712f, a * 0.8); g.fillEllipse(cx - 4, fy - 24, 12, 16);
    g.fillStyle(0xd9b98f, a); g.fillCircle(cx + 3 * f, fy - 72, 12);
    if (warn) { g.fillStyle(0xff9a7a, 0.55 + Math.sin(now * 20) * 0.2); for (let k = 0; k < 4; k++) { const ax = cx + f * (46 + k * 30); g.fillTriangle(ax, fy - 6, ax - f * 12, fy - 14, ax - f * 12, fy + 2); } }
  },
});
