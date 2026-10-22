// Нитяной крюк: значок, бросок нити, нить тяги от героя к точке зацепа.
import { defineToolView } from '../regs';

export default defineToolView({
  id: 'hook',
  icon: (g, cx, cy) => { g.beginPath(); g.moveTo(cx - 8, cy + 8); g.lineTo(cx - 1, cy - 4); g.strokePath(); g.beginPath(); g.arc(cx + 3, cy - 5, 5, Math.PI * 0.9, Math.PI * 2.2, false); g.strokePath(); },
  world: (fx, w) => {
    for (const p of w.players) if (p['hk']) {
      fx.lineStyle(2, p.pal.accent, 0.9); fx.lineBetween(p.x + 7, p.y + 13, p['hk'].ax, p['hk'].ay);
      fx.fillStyle(0xffffff, 1); fx.fillCircle(p['hk'].ax, p['hk'].ay, 3);
    }
  },
  fx: {
    hook: (fx, f, k, w) => {
      const pl = w.players[f['i']], col = pl && pl.pal ? pl.pal.accent : 0xffe3a3;
      fx.lineStyle(2.5, col, k); fx.lineBetween(f['x'], f['y'], f['x1'], f['y1']);
      fx.lineStyle(1.2, 0xffffff, k); fx.lineBetween(f['x'], f['y'], f['x1'], f['y1']);
      const ang = Math.atan2(f['y1'] - f['y'], f['x1'] - f['x']);
      fx.lineStyle(2.5, 0xffffff, k);
      for (const s of [-0.7, 0.7]) fx.lineBetween(f['x1'], f['y1'], f['x1'] - Math.cos(ang + s) * 9, f['y1'] - Math.sin(ang + s) * 9);
    },
  },
});
