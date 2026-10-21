// Действия нейросети-игрока. Пять дискретных «голов» (мультидискретное действие), решение раз в SKIP тиков.
//   0: движение  — 0 стоять, 1 влево, 2 вправо
//   1: вертикаль — 0 нет, 1 вверх, 2 вниз  (удар вверх/вниз, прицел бомбы; в фазе «Пропустите!» — движение)
//   2: прыжок    — удерживается все SKIP тиков
//   3: рывок     — нажатие в первом тике решения
//   4: действие  — 0 нет, 1 удар, 2 отбив/лечение (кнопка «heal»), 3 дымовая бомба; нажатие в первом тике
// Нажатия-«тычки» отпускаются на остальных тиках, поэтому каждое решение даёт чистый фронт нажатия.
import type { Inp } from '../core/types';

export const SKIP = 4;
export const HEADS: readonly number[] = [3, 3, 2, 2, 4];
export const N_HEADS = HEADS.length;
export const HEAD_SUM = HEADS.reduce((a, b) => a + b, 0);

/** Кадр ввода для тика sub (0..SKIP-1) решения a */
export function actionToInp(a: ArrayLike<number>, sub: number): Inp {
  const first = sub === 0;
  return {
    left: a[0] === 1, right: a[0] === 2, up: a[1] === 1, down: a[1] === 2, jump: a[2] === 1,
    dash: first && a[3] === 1, atk: first && a[4] === 1, heal: first && a[4] === 2, bomb: first && a[4] === 3, tool: false,
  };
}
