// Общее для снарядов, падающих или идущих с пола: пока снаряд ждёт (pr.delay > 0), на полу горит треугольник-предупреждение.
import { T } from '../../../core/balance';
import type { Proj } from '../../../core/types';
import type { G } from '../../draw/common';

export function floorWarn(fx: G, pr: Proj): boolean {
  if (!((pr.delay ?? 0) > 0)) return false;
  fx.fillStyle(0x8fae9c, 0.5); fx.fillTriangle(pr.x + 2, 19 * T, pr.x + 14, 19 * T, pr.x + 8, 19 * T + 8);
  return true;
}
