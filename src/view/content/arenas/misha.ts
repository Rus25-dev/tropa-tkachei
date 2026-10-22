// Убранство арены Миши (типография): буквы наборных касс на стене, вывеска, ящики «ДЫМ», дым и обрывки бумаги.
import { T } from '../../../core/balance';
import { mulberry32 } from '../../../core/rng';
import { defineArenaView } from '../regs';

export default defineArenaView({
  id: 'misha',
  decor: ({ scene, w, keep, font, display }) => {
    // буквы на задней стене — следы старых наборных касс
    const R = mulberry32(404), chars = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫЭЮЯ';
    for (let i = 0; i < 22; i++) {
      keep(scene.add.text(T * (2 + R() * 40), T * (4 + R() * 12), chars[Math.floor(R() * chars.length)]!, { fontFamily: font, fontSize: Math.round(50 + R() * 110) + 'px', fontStyle: '600', color: '#e8e2cf' }).setOrigin(0.5).setAlpha(0.05 + R() * 0.05).setAngle((R() - 0.5) * 30).setDepth(0.3));
    }
    keep(scene.add.text(22 * T, 5 * T + 6, 'ТИПОГРАФИЯ', { fontFamily: display, fontSize: '30px', fontStyle: '700', color: '#8fb8a8' }).setOrigin(0.5, 0).setAlpha(0.35).setDepth(0.4));
    // ящики с дымовухами
    for (const c of w.crates ?? []) {
      const cx = c.x + 22, by = c.y + 46, g = scene.add.graphics().setDepth(2);
      g.fillStyle(0x4a3726, 1); g.fillRoundedRect(cx - 20, by - 28, 40, 28, 3);
      g.lineStyle(2, 0x2c2015, 1); g.strokeRoundedRect(cx - 20, by - 28, 40, 28, 3); g.lineBetween(cx - 20, by - 14, cx + 20, by - 14);
      g.fillStyle(0x6b5236, 1); g.fillRect(cx - 17, by - 25, 34, 3);
      for (let i = 0; i < 3; i++) { g.fillStyle(0x3a3f45, 1); g.fillCircle(cx - 10 + i * 10, by - 33, 6); g.fillStyle(0x9aa39f, 1); g.fillCircle(cx - 12 + i * 10, by - 35, 1.6); }
      g.lineStyle(1.5, 0xffd47a, 1); for (let i = 0; i < 3; i++) g.lineBetween(cx - 10 + i * 10, by - 39, cx - 8 + i * 10, by - 44);
      keep(g); keep(scene.add.text(cx, by - 8, 'ДЫМ', { fontFamily: font, fontSize: '11px', fontStyle: '600', color: '#e8e2cf' }).setOrigin(0.5).setDepth(2.1));
    }
  },
  bursts: {
    smoke: { key: 'spark', cfg: { lifespan: { min: 900, max: 1600 }, speed: { min: 10, max: 60 }, scale: { start: 2.2, end: 6 }, alpha: { start: 0.55, end: 0 }, tint: [0x8e9894, 0xb3bab6, 0x6f7774], gravityY: -40 }, depth: 6.5 },
    paper: { key: 'dot', cfg: { lifespan: 600, speed: { min: 40, max: 160 }, scale: { start: 1.4, end: 0 }, rotate: { min: 0, max: 360 }, tint: 0xf4efe0, gravityY: 300 }, depth: 7 },
  },
});
