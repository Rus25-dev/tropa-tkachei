// Особая логика Владика на данных (vladik2): два эффекта атак, которые не выразить данными, — «ключи-бумеранги» и «эхо» (призрак от дальней стены).
// Числа здесь только геометрия вылета; тайминги, цвета и урон задаёт data/bosses/vladik2.json (attack.fx → args).
// Снаряды — прежние виды ядра ('clef' и 'echo' двигаются в projs.ts / bosses2.ts), поэтому отбив, неуязвимость и рисунок работают как у всех.
import type { Proj } from '../../types';
import type { BossKind, KindApi } from '../kinds';

const num = (a: Record<string, unknown>, k: string, d: number): number => (typeof a[k] === 'number' ? (a[k] as number) : d);
const hkOf = (a: Record<string, unknown>): 'parry' | 'dodge' => (a['hk'] === 'dodge' ? 'dodge' : 'parry');

/** Ключи-бумеранги: n штук веером по высоте, вылетают вперёд, тормозят и возвращаются к Владику, где гаснут */
function clef(k: KindApi, a: Record<string, unknown>): void {
  const n = Math.max(1, Math.round(num(a, 'n', 1))), v = num(a, 'v', 460), dv = num(a, 'dv', 40), back = num(a, 'back', 680), stepT = num(a, 'step', 8) / 60;
  const cx = k.b.x + k.b.w / 2, f = k.b.face || 1, hk = hkOf(a);
  for (let i = 0; i < n; i++) {
    const hy = k.b.y + 18 + i * num(a, 'dy', 24) - (n > 1 ? 10 : 0);
    const pr: Proj = {
      kind: 'clef', x: cx + f * 24 - 14, y: hy, w: 26, h: 36, vx: f * (v + i * dv), ax: -f * (back + i * dv), vy: 0, life: num(a, 'life', 200) / 60,
      t0: i * stepT, home: cx, rot: 0, hk, src: 'd', o: k.i,
    };
    k.sc.projs.push(pr);
  }
  k.sc.sfx('violin');
}

/** Эхо: призрак бежит по полу от стены за спиной героя; delay — время предупреждения (призрак бледный и безвредный), потом бежит */
function echo(k: KindApi, a: Record<string, unknown>): void {
  const sc = k.sc, [tp] = sc.nearestPlayer(k.b.x + k.b.w / 2, k.b.y + k.b.h / 2);
  const cx = k.b.x + k.b.w / 2, hx = tp ? tp.x + 7 : cx;
  const side = hx > cx ? 1 : -1; // сторона героя относительно Владика: призрак приходит с этой стороны, Владик — с другой
  const wallX = side > 0 ? (sc.L.W - 1) * 32 - 40 : 32, floor = (sc.L.floorY ?? 0) * 32;
  const pr: Proj = {
    kind: 'echo', x: wallX, y: floor - 84, w: 40, h: 84, vx: -side * num(a, 'v', 560), vy: 0, life: 6, delay: num(a, 'warn', 40) / 60,
    dmg: 1, hk: 'dodge', src: 'd', o: k.i,
  };
  sc.projs.push(pr);
  sc.sfx('violin');
}

const kind: BossKind = { fx: { clef, echo } };
export default kind;
