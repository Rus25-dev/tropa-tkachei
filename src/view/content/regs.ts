// Реестры отрисовки и звука содержимого (вид): по файлу на вещь в src/view/content/<вид>/<id>.ts, файлы находит index.ts.
// Лист без зависимостей, кроме типов: отрисовка импортирует реестры отсюда без циклов.
import { Registry } from '../../core/plugin/registry';
import type { Player, Rect } from '../../core/types';
import type { Swing } from '../../core/weapon-kit';
import type { World } from '../../core/world';
import type { G } from '../draw/common';

/** всё, что видит отрисовка удара оружия */
export interface SwingCtx {
  w: World; p: Player; sw: Swing;
  /** 1 → 0 за время удара; el = 1 − k */
  k: number; el: number;
  /** центр героя, направление удара ('f' | 'u' | 'd'), сторона f (±1), угол th, угол взгляда начала удара th0 */
  cx: number; cy: number; dir: string; f: number; th: number; th0: number;
  /** точка дуги для ударов вверх/вниз (смещена на 4 px) */
  ox: number; oy: number;
  /** цвет оружия и акцент героя; коробка удара ядра */
  col: number; acc: number; box: Rect;
}
export interface WeaponView {
  id: string;
  /** высота тона гула заряда, Гц (по умолчанию 200) */
  chargePitch?: number;
  /** клинок за спиной (без заряда); нет — рисуется стандартная игла героя */
  back?: (g: G, f: number, y0: number, bob: number, col: number) => void;
  /** поза заряда: оружие занесено назад (поверх общей рукояти); jx — дрожание */
  pull?: (g: G, f: number, jx: number, col: number) => void;
  /** этот вид удара рисует исходная дуга v1.8 (например, обычные удары иглы) */
  defaultArc?: (k: string) => boolean;
  /** заряженный удар (вид 'c') */
  charge?: (fx: G, c: SwingCtx) => void;
  /** остальные удары (g, f, a1, a2) */
  swing?: (fx: G, c: SwingCtx) => void;
}
export const defineWeaponView = (v: WeaponView): WeaponView => v;
export const weaponViewReg = new Registry<WeaponView>('отрисовка оружия');
