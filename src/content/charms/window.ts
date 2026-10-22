// Широкое окно: окно отбива шире на 50 %.
import { P } from '../../core/balance';
import { defineCharm } from '../../core/charm-kit';

export default defineCharm({
  id: 'window', order: 5, name: 'Широкое окно', desc: 'Окно отбива шире на 50 % (0.2 → 0.3 с).', unlock: 'boss:vladik2', slots: 1, col: 0xffffff,
  stepPost: (_sc, p, _dt, o) => { if ((p['parryT'] as number) > o.parryBefore && (p['parryT'] as number) >= P.PARRY_T - 1e-6) p['parryT'] = P.PARRY_T * 1.5; },
});
