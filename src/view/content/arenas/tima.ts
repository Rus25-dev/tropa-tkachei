// Убранство арены Тимы (берлога): мебель по сущностям Furniture уровня (диван, полка, ящики пива), волшебная пыль и пена.
import { T } from '../../../core/balance';
import { defineArenaView } from '../regs';

export default defineArenaView({
  id: 'tima',
  decor: ({ scene, w, keep }) => {
    const g = keep(scene.add.graphics().setDepth(0.6));
    for (const f of w.L.furniture ?? []) {
      const x = f.x0 * T, wd = (f.x1 - f.x0 + 1) * T, y = f.y * T, fl = w.L.floorY! * T;
      if (f.kind === 'couch') {
        g.fillStyle(0x3a4a6a, 1); g.fillRoundedRect(x - 6, y - 34, wd + 12, 34, 10); // спинка
        g.fillStyle(0x4a5c80, 1); g.fillRoundedRect(x, y, wd, 22, 6); g.fillRect(x + 6, y + 18, wd - 12, fl - y - 18);
        g.fillStyle(0x3a4a6a, 1); g.fillRoundedRect(x - 14, y - 10, 20, fl - y + 10, 6); g.fillRoundedRect(x + wd - 6, y - 10, 20, fl - y + 10, 6);
        g.lineStyle(2, 0x2c3850, 1); for (let i = 1; i < 3; i++) g.lineBetween(x + (wd * i) / 3, y + 2, x + (wd * i) / 3, y + 20);
      } else if (f.kind === 'shelf') {
        g.fillStyle(0x5a4634, 1); g.fillRect(x, y, wd, 10); g.fillStyle(0x3b2f27, 1); g.fillRect(x + 10, y + 10, 6, 14); g.fillRect(x + wd - 16, y + 10, 6, 14);
        for (let i = 0; i < 5; i++) { g.fillStyle(0x6b3d14, 1); g.fillRoundedRect(x + 18 + i * 30, y - 26, 10, 26, 3); g.fillStyle(0xf4efe0, 1); g.fillRect(x + 18 + i * 30, y - 16, 10, 7); }
      } else {
        for (let yy = y; yy < fl; yy += 34) for (let xx = x; xx < x + wd; xx += 64) {
          g.fillStyle(0xc9a227, 1); g.fillRect(xx + 1, yy, 62, 33); g.lineStyle(2, 0x8a6a10, 1); g.strokeRect(xx + 1, yy, 62, 33);
          g.fillStyle(0x6b3d14, 1); for (let i = 0; i < 5; i++) g.fillCircle(xx + 10 + i * 11, yy + 6, 4);
        }
      }
    }
  
  },
  bursts: {
    dustFx: { key: 'spark', cfg: { lifespan: 700, speed: { min: 20, max: 90 }, scale: { start: 0.9, end: 0 }, tint: [0xffe38a, 0xffffff, 0xffb6f0, 0x9ff0ff], blendMode: 'ADD' }, depth: 7 },
    foam: { key: 'dot', cfg: { lifespan: 500, speed: { min: 40, max: 180 }, scale: { start: 1.6, end: 0 }, tint: [0xfff6d8, 0xf2c14e], gravityY: 400 }, depth: 7 },
  },
});
