// Контрудар: значок-перекрестье и кольцо у руки после срыва атаки.
import { defineAbilityView } from '../regs';

export default defineAbilityView({
  id: 'counter',
  icon: (g, cx, cy) => { g.lineBetween(cx - 7, cy - 7, cx + 7, cy + 7); g.lineBetween(cx + 7, cy - 7, cx - 7, cy + 7); g.strokeCircle(cx, cy, 4); },
  pose: (g, p) => {
    if (!((p['cxFx'] as number) > 0)) return;
    const k = (p['cxFx'] as number) / 0.4, r = 30 + (1 - k) * 24;
    g.lineStyle(4, 0xbfe9ff, k); g.strokeCircle(p.face * 18, -14, 12 + (1 - k) * 40);
    g.lineStyle(2, 0xffffff, k); g.lineBetween(p.face * 6, -22, p.face * r, -6); g.lineBetween(p.face * 6, -6, p.face * r, -22);
  },
});
