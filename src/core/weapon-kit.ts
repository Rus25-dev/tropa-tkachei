// Набор для описаний оружия (src/content/weapons/<id>.ts): типы удара и геометрия коробок удара.
// Лист без зависимостей от мира и боя: его можно импортировать из файлов содержимого без циклов модулей.
import { T } from './balance';
import type { Player, Rect } from './types';
import type { World } from './world';

/* eslint-disable @typescript-eslint/no-explicit-any -- реестр оружия: свободные поля, как в v1.8 */
/** вид удара оружия: g — обычный, f — финишер, a1/a2 — воздушная цепочка, c — заряженный */
export interface SwingDef { t?: number; cd?: number; dm?: number; hits?: number; box?: (sc: World, p: Player, sw: Swing, el: number, rm: number, cx: number, cy: number) => Rect; flip?: boolean; tot?: number; pulses?: number; pulse?: number; noRecoil?: boolean; snd?: string; start?: (sc: World, p: Player, sw: Swing) => void; cutAll?: boolean; br?: boolean; pm?: number }
export interface Swing { wid: string; k: string; e: SwingDef | null; hits: number; dm: number; f0: number; x0: number; y0: number; fy: number; dur: number; pulse: number; pn: number; cn: Map<unknown, number>; pm?: number; cutAll: boolean; noRecoil: boolean; len: number }
export interface WeaponDef {
  id: string; name: string; desc: string; reach: number; thick: number; atkT: number; cd: number; combo: number; comboWin: number; finisher: boolean; finT: number; finCd: number; dmg: number;
  /** как получить: 'start' | 'boss:<id>' | 'shop:<цена>' */
  unlock: string; col?: number; pm?: number; kb?: number; recoil?: number; hs?: number; noPogo?: boolean; cutAll?: boolean;
  /** место в списках (снаряжение, фаззер); у существующего оружия не менять */
  order?: number;
  geo?: Record<string, any[]>; sw?: Record<string, SwingDef>;
  /** начало удара; по умолчанию — общий выбор вида удара (земля / воздух / финишер) */
  onSwing?: (sc: World, p: Player) => void;
  /** добавка к силе тряски экрана при заряженном ударе */
  chargeShake?: number;
  /** особый эффект в момент заряженного удара (после частиц) */
  onCharge?: (sc: World, p: Player) => void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** описание оружия: типизированная обёртка для файла содержимого */
export function defineWeapon(d: WeaponDef): WeaponDef { return d; }

// ---------- геометрия ----------
/** прямоугольник перед героем (по взгляду удара) */
export function fr(sw: Swing, cx: number, w: number, h: number, top: number, off?: number): Rect { const o = off == null ? 2 : off; return { x: sw.f0 > 0 ? cx + o : cx - o - w, y: top, w, h }; }
/** прямоугольник по центру героя */
export function ctr(cx: number, w: number, h: number, top: number): Rect { return { x: cx - w / 2, y: top, w, h }; }
/** длина волны до ближайшей стены */
export function clipLen(sc: World, x0: number, y: number, f: number, max: number): number {
  for (let d = 16; d <= max; d += 16) if (sc.isSolid(Math.floor((x0 + f * d) / T), Math.floor(y / T))) return Math.max(24, d - 16);
  return max;
}
/** волна, бегущая вперёд до стены */
export function waveBox(_sc: World, _p: Player, sw: Swing, el: number): Rect { const L = Math.max(10, sw.len * Math.min(1, el / (sw.dur! * 0.7))); return { x: sw.f0 > 0 ? sw.x0 + 6 : sw.x0 - 6 - L, y: sw.y0 - 30, w: L, h: 60 }; }
/** ударная волна по земле в обе стороны */
export function shockBox(_sc: World, _p: Player, sw: Swing, el: number): Rect { const half = 200 * Math.min(1, el / (sw.dur * 0.5)) + 10; return { x: sw.x0 - half, y: sw.fy - 40, w: half * 2, h: 46 }; }
