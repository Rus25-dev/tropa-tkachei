// Набор для описаний приёмов героя (src/content/abilities/<id>.ts): теневой рывок, вспышка, кристальный рывок, контрудар, нырок…
// Приём — это данные (название, как открыть, цвет) и обработчики шага героя. Ядро (kit/moves.ts) вызывает их по порядку order;
// от порядка зависит, какой приём «перехватит» кадр, поэтому у существующих приёмов order не меняют.
// Всё считается в кадрах (целые счётчики): без Date.now, Math.random и таймеров. Лист без зависимостей от мира и боя.
import type { Inp, Player } from './types';
import type { World } from './world';

/** следующий слой шага героя (оружие → база) */
export type Inner = (sc: World, p: Player, dt: number) => void;
/** значок приёма в HUD: frac 0..1 — доля перезарядки или заряда */
export interface KitIcon { id: string; frac: number; ready: boolean; active: boolean }

export interface AbilityDef {
  id: string;
  /** место в списках и порядок обработчиков; у существующих не менять */
  order?: number;
  /** приём открывается и виден в снаряжении (false — внутренний приём ядра, например движение нырка) */
  listed?: boolean;
  name?: string; desc?: string;
  /** как получить: 'boss:<id>' | 'shop:<цена>' | 'locked' */
  unlock?: string;
  /** цвет значка */
  col?: number;
  /** приём живёт на кнопке рывка (подсказки сенсорного управления) */
  onDash?: boolean;
  /** на сенсорной кнопке рывка — подпись «держи» */
  holdDash?: boolean;
  /** коды состояния на проводе и в отрисовке (kitCode): общий список для всех приёмов, только добавляется */
  codes?: number[];

  /** каждый кадр своего героя, до всего остального (например, проверка нажатия в окне) */
  pre?(sc: World, p: Player, dt: number): void;
  /** каждый кадр: откаты и счётчики (после убывания общего окна неуязвимости kgF) */
  tick?(sc: World, p: Player, dt: number, o: { holding: boolean }): void;
  /** открыт и может начаться по вводу в этом кадре (тогда шаг героя проходит через drive) */
  armed?(sc: World, p: Player): boolean;
  /** приём сейчас ведёт движение героя (хват за уступ и планер отключены) */
  busy?(p: Player): boolean;
  /** у приёма есть активное состояние (в том числе заряд без движения) */
  active?(p: Player): boolean;
  /** сорвать состояние (урон, лечение, кокон, скамья) */
  cancel?(sc: World, p: Player, o: { holding: boolean }): void;
  /** вести шаг героя: true — шаг выполнен (inner вызван внутри или не нужен) */
  drive?(sc: World, p: Player, dt: number, inner: Inner, o: { holding: boolean; inp: Inp }): boolean;
  /** старт обычного рывка (сразу после установки dashT/dashCd) */
  dashStart?(sc: World, p: Player): void;
  /** скорость рывка вместо обычной (первый ответ не undefined) */
  dashSpeed?(p: Player): number | undefined;
  /** множитель скорости бега */
  runMul?(p: Player): number;
  /** сброс всех состояний (возрождение, телепорт) */
  clear?(p: Player): void;
  /** код состояния (из codes) или 0 */
  code?(p: Player): number;
  /** приоритет кода: меньше — важнее (если активны два приёма) */
  codePri?: number;
  /** доля заряда 0..1 для отрисовки у напарника */
  chargeFrac?(p: Player): number;
  /** принять код состояния напарника (ks — код, kc — доля заряда) */
  fromNet?(p: Player, ks: number, kc: number): void;
  /** вид следа (код s) у напарника во время приёма; dash — во время обычного рывка */
  trail?(p: Player, dash: boolean): number;
  /** значок в HUD (без id) или null */
  hud?(sc: World, p: Player): Omit<KitIcon, 'id'> | null;
}
export function defineAbility(d: AbilityDef): AbilityDef { return d; }

/** секунды → кадры (шаг мира 1/60) */
export const fr = (s: number): number => Math.round(s * 60);
/** пустой ввод: приём ведёт движение, нижние слои ввода не видят */
export const NOIN: Inp = { up: false, down: false, left: false, right: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false, jumpP: false, atkP: false, dashP: false, healP: false, upP: false, bombP: false, toolP: false };
