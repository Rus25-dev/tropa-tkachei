// Кристальный рывок: значок-кристалл с дугой заряда, свечение заряда, розовый росчерк суперрывка.
import { kitChargeFrac } from '../../../core/kit/moves';
import type { Player } from '../../../core/types';
import type { G } from '../../draw/common';
import { defineAbilityView } from '../regs';

const charge = (g: G, p: Player, now: number, code: number): void => {
  const k = kitChargeFrac(p), full = code === 4, pulse = 0.6 + 0.4 * Math.sin(now * 40);
  g.fillStyle(0xff8ae0, (0.1 + 0.22 * k) * (full ? pulse + 0.4 : 1)); g.fillCircle(0, -14, 12 + 18 * k);
  g.lineStyle(2, full ? 0xffffff : 0xff8ae0, 0.4 + 0.5 * k); g.strokeCircle(0, -14, full ? 32 + Math.sin(now * 40) * 3 : 46 - 26 * k);
  for (let i = 0; i < 6; i++) { const an = now * 7 + i * Math.PI / 3, r = full ? 28 : 46 - 24 * k; g.fillStyle(full ? 0xffffff : 0xffc6f2, 0.9); g.fillCircle(Math.cos(an) * r, -14 + Math.sin(an) * r, 2); }
  g.lineStyle(2, 0xff8ae0, 0.7); g.lineBetween(-10, 1, 10, 1);
};
export default defineAbilityView({
  id: 'crystal', chargeArc: true,
  icon: (g, cx, cy, c) => { g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 5, cy - 2); g.lineTo(cx + 3, cy + 7); g.lineTo(cx - 3, cy + 7); g.lineTo(cx - 5, cy - 2); g.closePath(); g.strokePath(); g.fillStyle(c, 0.35); g.fillTriangle(cx, cy - 8, cx + 5, cy - 2, cx - 5, cy - 2); },
  trails: { 3: { col: 0xff8ae0, a: 0.55, w: 26 } },
  fx: {
    3: charge, 4: charge,
    5: (g, p) => { // суперрывок: длинный розовый росчерк
      for (let i = 0; i < 4; i++) { g.lineStyle(3 - i * 0.5, i ? 0xff8ae0 : 0xffffff, 0.8 - i * 0.15); g.lineBetween(-p.face * 10, -22 + i * 5, -p.face * (60 + i * 24), -22 + i * 5); }
      g.fillStyle(0xff8ae0, 0.25); g.fillEllipse(-p.face * 14, -14, 40, 30);
    },
  },
});
