// Обвязка смерти босса на данных (общая для всех боссов): награда, способность главы, рекорд боя, сплит спидрана.
// Слои v1.8, снаружи внутрь: спидран (сплит) → движение 2 (парус за Владика) → снаряжение (награда) → рекорды (qol) → исходная смерть (dieBase в exec.ts).
import type { World } from '../world';
import { saveProgress } from '../campaign';
import { srOnSplit } from '../speedrun';

/** Способность, которую выдаёт победа над боссом (по id босса на данных). Без неё кампания непроходима: парус нужен в IV главе. */
export const ABILITY_REWARD: Readonly<Record<string, string>> = { vladik2: 'glide' };

/**
 * Победа над боссом: вызывается один раз в момент смерти (до анимации). base — сама смерть (состояния, вспышка, переход дальше).
 * Выдаёт способность (если у босса она есть), событие bossReward (id босса — по нему store.onBoss открывает снаряжение с unlock «boss:<id>»),
 * запись победы в рекорды (fightWin) и сплит спидрана.
 */
export function bossDeath(sc: World, id: string, base: (sc: World) => void): void {
  const ability = ABILITY_REWARD[id];
  if (ability) {
    const first = !sc.abil[ability] && sc.abil[ability] !== false;
    if (first) {
      sc.abil[ability] = true;
      if (!sc.sr && sc.online !== 'guest' && sc.mode !== 'bosstest') saveProgress(sc, { ...(sc.progress || { bench: 0, beads: sc.beads }), abil: sc.abil });
      if (sc.mode !== 'bosstest' || sc.camp) sc.toast('Паутинный парус: держи прыжок в падении — планируй', 5);
    }
  }
  if (!sc.sr && sc.online !== 'guest') sc.emit('bossReward', { id });
  // qol.js: запись победы в рекорды боссов
  if (sc.fightOn && !sc.fightWon && !sc.train) {
    sc.fightWon = true;
    sc.emit('fightWin', { id: sc.bossKind, t: sc.fightT || 0 });
  }
  base(sc);
  if (sc.sr) srOnSplit(sc);
}
