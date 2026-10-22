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

/* eslint-disable @typescript-eslint/no-explicit-any -- сущности инструментов: мешок полей ядра */
type Q = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */
/** отрисовка инструмента: значок под катушкой нити, сущности (по виду q.kind), эффекты (по имени f в w.tfx), общий слой мира */
export interface ToolView {
  id: string;
  /** значок 26×26 вокруг (cx, cy) цветом col (линия и заливка уже выставлены этим цветом) */
  icon?: (g: G, cx: number, cy: number, col: number) => void;
  /** сущность в w.tl: x, y — центр */
  ents?: Record<string, (fx: G, q: Q, now: number, x: number, y: number) => void>;
  /** кратковременный эффект из w.tfx: k — 1 → 0 */
  fx?: Record<string, (fx: G, f: Q, k: number, w: World) => void>;
  /** слой поверх мира (например, нить крюка от героя к точке зацепа) */
  world?: (fx: G, w: World, now: number) => void;
}
export const defineToolView = (v: ToolView): ToolView => v;
export const toolViewReg = new Registry<ToolView>('отрисовка инструментов');
export const toolEntView = new Map<string, NonNullable<ToolView['ents']>[string]>();
export const tfxView = new Map<string, NonNullable<ToolView['fx']>[string]>();
toolViewReg.onDefine((v) => { for (const [k, f] of Object.entries(v.ents ?? {})) toolEntView.set(k, f); for (const [k, f] of Object.entries(v.fx ?? {})) tfxView.set(k, f); });
