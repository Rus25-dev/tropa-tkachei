import { T } from '../../../core/balance';
import { defineArenaView } from '../regs';

export default defineArenaView({
  id: 'vessel',
  decor: ({ scene, w, keep }) => {
    const width = w.L.W * T, floor = (w.L.floorY ?? 18) * T;
    const g = keep(scene.add.graphics().setDepth(0.4));
    g.fillStyle(0x10131f, 1); g.fillRect(T, T, width - 2 * T, floor - T);
    for (let i = 1; i <= 5; i++) {
      const x = width * i / 6;
      g.fillStyle(0x222b40, 1); g.fillRoundedRect(x - 48, floor - 370, 96, 310, 45);
      g.lineStyle(2, 0x8d98b5, 0.35); g.strokeRoundedRect(x - 48, floor - 370, 96, 310, 45);
      g.lineStyle(1, 0xd8d4e8, 0.15); g.lineBetween(x, floor - 345, x, floor - 85);
    }
    g.lineStyle(2, 0xd8d4e8, 0.35); g.strokeEllipse(width / 2, floor - 3, width - 130, 24);
    const stone = keep(scene.add.graphics().setDepth(1.2));
    stone.fillStyle(0x252c3d, 1); stone.fillRect(T, floor, width - 2 * T, w.L.H * T - floor);
    stone.lineStyle(2, 0xc6cde0, 0.8); stone.lineBetween(T, floor, width - T, floor);
  },
});
