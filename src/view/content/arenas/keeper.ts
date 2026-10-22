import { T } from '../../../core/balance';
import { defineArenaView } from '../regs';

export default defineArenaView({
  id: 'keeper', order: 4,
  decor: ({ scene, w, keep, display }) => {
    const width = w.L.W * T, floor = (w.L.floorY ?? 18) * T;
    const g = keep(scene.add.graphics().setDepth(0.4));
    g.fillStyle(0x161323, 1); g.fillRect(T, T, width - 2 * T, floor - T);
    // Три архивные ниши, круг клятвы и бумажные ленты. Боевая плоскость свободна.
    for (let i = 0; i < 3; i++) {
      const x = width * (i + 1) / 4;
      g.fillStyle(0x282036, 1); g.fillRoundedRect(x - 96, floor - 390, 192, 340, 70);
      g.lineStyle(2, 0x756182, 0.5); g.strokeRoundedRect(x - 96, floor - 390, 192, 340, 70);
      for (let j = 0; j < 5; j++) {
        const px = x - 64 + j * 32, y = floor - 340 + (j % 2) * 28;
        g.fillStyle(0xd2c4a9, 0.48); g.fillRect(px, y, 17, 126);
        g.lineStyle(2, 0xb44854, 0.6); g.strokeRect(px + 4, y + 20, 9, 18);
        g.lineBetween(px + 5, y + 25, px + 12, y + 33);
      }
      g.fillStyle(0x8b4d62, 0.08); g.fillCircle(x, floor - 220, 90);
    }
    g.lineStyle(2, 0xc2a76b, 0.38); g.strokeEllipse(width / 2, floor - 2, width - 140, 30);
    for (let x = 2 * T; x < width - T; x += 2 * T) {
      g.lineStyle(1, 0xc2a76b, 0.3); g.lineBetween(x, floor - 4, x + 15, floor - 4);
    }
    for (const x of [T + 16, width - T - 40]) {
      g.fillStyle(0x3b3044, 1); g.fillRect(x, T, 24, floor - T);
      g.lineStyle(2, 0x9b805c, 0.55); g.lineBetween(x + 5, T, x + 5, floor);
      for (let y = 100; y < floor; y += 88) { g.fillStyle(0xc5a66a, 0.65); g.fillRect(x + 2, y, 20, 3); }
    }
    // Каменная кромка поверх общего тайлового рисунка: совпадает с физическим полом.
    const stone = keep(scene.add.graphics().setDepth(1.2));
    stone.fillStyle(0x242030, 1); stone.fillRect(T, floor - 6, width - 2 * T, (w.L.H * T) - floor + 6);
    stone.fillStyle(0x86755d, 1); stone.fillRect(T, floor - 3, width - 2 * T, 3);
    for (let x = T; x < width - T; x += 64) {
      stone.lineStyle(1, 0x514654, 0.8); stone.strokeRect(x, floor + 3, 63, 26);
      stone.lineStyle(2, 0xc2a76b, 0.55); stone.lineBetween(x + 18, floor + 8, x + 38, floor + 8);
    }
    keep(scene.add.text(width / 2, floor - 450, 'ЗАЛ НЕРАЗРЫВНОЙ КЛЯТВЫ', { fontFamily: display, fontSize: '24px', color: '#c4ad83', letterSpacing: 4 }).setOrigin(0.5).setAlpha(0.7).setDepth(0.5));
  },
});
