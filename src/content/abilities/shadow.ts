// Теневой рывок: рывок становится теневым — неуязвимость к касаниям и отбиваемым/уклоняемым ударам, перезарядка дольше.
import { KIT } from '../../core/balance';
import { defineAbility } from '../../core/ability-kit';
import { kitHas } from '../../core/kit/abilities';

export default defineAbility({
  id: 'shadow', order: 10, name: 'Теневой рывок', col: 0x8a7ad8, unlock: 'boss:vessel', onDash: true, codes: [1], codePri: 3,
  desc: 'Рывок становится теневым: на время рывка вы неуязвимы к касаниям и ударам, которые можно отбить или от которых можно увернуться (фиолетовые не пройти). Перезарядка дольше обычной, 1,1 с. Заменяет обычный рывок.',
  tick: (_sc, p) => { if (p.dashT <= 0) p['shade'] = false; },
  dashStart: (sc, p) => {
    p['shade'] = false;
    if (!kitHas(sc, p, 'shadow')) return;
    p.dashT = KIT.SHADOW.T; p.dashCd = KIT.SHADOW.CD; p['kgF'] = KIT.SHADOW.GHOST_F; p['shade'] = true;
    sc.snd('shadow'); sc.parts(8, p.x + 7, p.y + 14, 0x8a7ad8);
  },
  dashSpeed: (p) => (p['shade'] ? KIT.SHADOW.SPD : undefined),
  clear: (p) => { p['shade'] = false; },
  code: (p) => (p['shade'] ? 1 : 0),
  fromNet: (p, ks) => { p['shade'] = ks === 1; },
  trail: (p, dash) => (dash && p['shade'] ? 1 : 0),
  hud: (sc, p) => (kitHas(sc, p, 'shadow') ? { frac: Math.min(1, Math.max(0, p.dashCd) / KIT.SHADOW.CD), ready: p.dashCd <= 0, active: !!p['shade'] } : null),
});
