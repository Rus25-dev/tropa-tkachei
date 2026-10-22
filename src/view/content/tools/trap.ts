// Капкан: значок, капкан на земле, щелчок.
import { defineToolView } from '../regs';

export default defineToolView({
  id: 'trap',
  icon: (g, cx, cy) => { g.fillRect(cx - 8, cy + 3, 16, 3); for (let k = 0; k < 4; k++) g.fillTriangle(cx - 8 + k * 4, cy + 3, cx - 4 + k * 4, cy + 3, cx - 6 + k * 4, cy - 5); },
  ents: {
    ttrap: (fx, q, now, x) => {
      const life = q['life'], arming = q['arm'] > 0;
      if (life < 2 && Math.floor(now * 10) % 2) return;
      const bx = q['x'], by = q['y'] + q['h'];
      fx.fillStyle(0x000000, 0.3); fx.fillEllipse(x, by, q['w'] + 6, 6);
      fx.fillStyle(0x59483a, 1); fx.fillRect(bx, by - 4, q['w'], 4);
      fx.fillStyle(0xd9d4c3, 1);
      for (let i = 0; i < 5; i++) { const tx = bx + 2 + i * 5; fx.fillTriangle(tx, by - 4, tx + 5, by - 4, tx + 2.5, by - 12); }
      const blink = arming ? 0.3 : 0.5 + Math.sin(now * 8) * 0.5;
      fx.fillStyle(0xff6a4a, 0.25 + blink * 0.6); fx.fillCircle(x, by - 2, 2.2);
      fx.lineStyle(1, 0xffe3a3, 0.35); fx.strokeCircle(x, by - 4, 18 + Math.sin(now * 4) * 2);
    },
  },
  fx: {
    snap: (fx, f, k) => { fx.lineStyle(3, 0xffffff, k); for (let s = -2; s <= 2; s++) fx.lineBetween(f['x'] + s * 6, f['y'], f['x'] + s * 9, f['y'] - 26 * (1 - k * 0.3)); },
  },
});
