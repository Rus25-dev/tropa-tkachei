// Игла: обычные удары по земле рисует исходная дуга v1.8; здесь — воздушные взмахи и волна заряда.
import { band, edge, ease } from '../../draw/common';
import { defineWeaponView } from '../regs';

export default defineWeaponView({
  id: 'needle', chargePitch: 200,
  defaultArc: (k) => k === 'g' || k === 'f',
  charge: (fx, { sw, el, k, th0, acc }) => { // волна: полумесяц летит вперёд и тает
    const L = Math.max(10, sw.len * Math.min(1, el / 0.7)), fxX = sw.x0 + sw.f0 * L;
    for (let i = 0; i < 4; i++) band(fx, fxX - sw.f0 * (16 + i * 18), sw.y0, th0, sw.f0, -1.05, 1.05, 34 - i * 2, 9 + (3 - i) * 2, i ? acc : 0xffffff, (0.85 - i * 0.2) * k);
    edge(fx, fxX - sw.f0 * 16, sw.y0, th0, sw.f0, -1.05, 1.05, 36, 2, 0xffffff, k);
  },
  swing: (fx, { sw, el, k, cx, cy, th, f, acc }) => { // воздушные взмахи иглы
    if (sw.k === 'a2') { band(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.2, 40, 12, 0xf6f3e8, 0.85 * k); edge(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.2, 41, 2, acc, 0.8 * k); }
    else { const cur = -1.9 + 2.4 * ease(Math.min(1, el * 1.6)), r0 = Math.max(-1.9, cur - 1.5); band(fx, cx - f * 4, cy + 2, th, f, r0, cur, 50, 15, 0xf6f3e8, 0.9 * k); edge(fx, cx - f * 4, cy + 2, th, f, r0, cur, 51, 2, acc, 0.8 * k); }
  },
});
