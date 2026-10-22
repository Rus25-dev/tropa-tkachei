// Мир со «статуей» — боссом, который стоит и не нападает (tests/fixtures/bosses.ts: statueBoss). Для проверок механик героя на арене Владика.
import { bossDef, registerBoss } from '../../../src/core/boss/registry';
import type { Boss } from '../../../src/core/types';
import { World, type WorldOpts } from '../../../src/core/world';
import { statueBoss } from '../../fixtures/bosses';

export const STATUE = 'fx_statue';
/** зарегистрировать статую (один раз) */
export function ensureStatue(): void { if (!bossDef(STATUE)) registerBoss(statueBoss(STATUE)); }
/** мир босс-теста со статуей */
export function statueWorld(o: Partial<WorldOpts> = {}): World {
  ensureStatue();
  return new World({ seed: 5, mode: 'bosstest', boss: STATUE, ...o });
}
export const statue = (w: World): Boss => w.bosses[0]!;
