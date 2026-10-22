// Хранительница Печатей: особая логика — равновесие по Парированию 2.0.
// Флаг posture включает у босса «шкалу равновесия» из Parry 2.0: обычный отбив даёт POSTURE_NORMAL_POISE, идеальный (первые кадры окна) — в разы больше (combat.parryPoise).
// Ответная стойка возвращает исполнителю id связки; остальное (отбив, оглушение, казнь) — общий каркас.
import type { BossKind } from '../kinds';

export default {
  frame(k) { k.b.posture = true; },
  onDamage({ b, d }) {
    // Только явно обозначенная стойка и только ранняя часть замаха.
    // Серия ответа не содержит стойку: повторные удары не перезапускают её.
    if ((b.phase ?? 1) >= 2 && d.atk === 'reversal' && b.state === 'tell' && (d.cue?.left ?? 0) > 12) return 'c_riposte';
  },
  fx: { oathEnd({ sc }) { sc.shake(120, 0.004); } },
} satisfies BossKind;
