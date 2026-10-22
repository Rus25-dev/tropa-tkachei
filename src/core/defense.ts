// Unblockable запрещает активный отбив/рывок, но не отменяет защиту после ранения и сцен.
// Эти правила доступны новым модулям: им не требуется дублировать цветовые условия.
import type { HitKind } from './types';
export function defenseRules(kind: HitKind = 'parry'): { parry: boolean; dodge: boolean } {
  return { parry: kind === 'parry', dodge: kind !== 'unblockable' };
}
