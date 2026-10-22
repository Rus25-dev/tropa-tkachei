// Ворон-тиран: особая логика одна — шар нити. Белый замах «Шар нити» призывает существо silkorb; если герой разбил его (hp ≤ 0, а не исчез сам),
// он получает нить, а при нехватке здоровья — один бутон. Один шар даёт не больше одного дара; всё остальное лежит в data/bosses/raven.json.
import type { BossKind } from '../kinds';

/** сколько нити возвращает шар и сколько здоровья (бутонов) */
const GIFT = { silk: 3, hp: 1 } as const;

export default {
  frame(k) {
    const { sc } = k;
    for (const e of sc.enemies) {
      if (!e.dead || e['gift'] || e.hp > 0) continue;
      const m = e['m'] as { cid?: string; bid?: string } | undefined;
      if (!m || m.cid !== 'silkorb' || m.bid !== k.def.id) continue;
      e['gift'] = true;
      const [p] = sc.nearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
      if (!p || p.downed || p.remote) continue;
      p.silk = Math.min(sc.silkMax, p.silk + GIFT.silk);
      const heal = p.hp < p.maxHp;
      if (heal) p.hp = Math.min(p.maxHp, p.hp + GIFT.hp);
      sc.burst(14, p.x + 7, p.y + 13, 0xa0f0ff); sc.sfx('revive');
      sc.toast(heal ? 'Нить и здоровье вернулись' : 'Нить восстановлена', 1.5);
    }
  },
} satisfies BossKind;
