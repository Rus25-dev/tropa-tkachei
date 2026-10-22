// Враги: отрисовка по виду — src/view/content/enemies/<вид>.ts; существа боссов на данных — draw/minion.ts.
import type { Enemy } from '../../core/types';
import type { G } from './common';
import { drawMinion } from './minion';
import '../content';
import { enemyViewReg } from '../content/regs';

export function drawEnemy(e: Enemy, g: G, now: number): void {
  if (e['m']) { drawMinion(e, g, now); return; } // существо босса на данных
  g.clear();
  (enemyViewReg.get(e.type) ?? enemyViewReg.get('beetle'))?.draw(g, e, now); // неизвестный вид рисуется жуком, как в v1.8
}
