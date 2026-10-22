// Король кошмаров: единственная особая логика — «выход из тени» (fx warp): босс переносится в точку, где уже горит красный круг (зона арены burst_*).
// Числа точек лежат в данных атаки (args.x — px от левой стены), здесь их нет.
import { T } from '../../balance';
import type { BossKind } from '../kinds';

export default {
  fx: {
    warp(k, args) {
      const x = typeof args['x'] === 'number' ? args['x'] : 0;
      const x0 = k.sc.arena?.x0 ?? T;
      k.b.x = x0 + x - k.b.w / 2; k.b.vx = 0;
      const [tp] = k.sc.nearestPlayer(k.b.x + k.b.w / 2, k.b.y + k.b.h / 2);
      if (tp) k.b.face = tp.x + 7 > k.b.x + k.b.w / 2 ? 1 : -1;
      k.sc.burst(22, k.b.x + k.b.w / 2, k.b.y + k.b.h / 2, 0xb2397f); k.sc.sfx('appear'); k.sc.shake(160, 0.006);
    },
  },
} satisfies BossKind;
