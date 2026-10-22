// Набор для описаний инструментов и навыков нити (src/content/tools/<id>.ts): типы и прицел.
// Лист без зависимостей от мира и боя: его можно импортировать из файлов содержимого без циклов модулей.
import type { BossRef } from './balance';
import type { Boss, Player } from './types';
import type { World } from './world';

/* eslint-disable @typescript-eslint/no-explicit-any -- сущности инструментов: мешок полей, как в v1.8 */
export type Q = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** сообщение «применить инструмент»: у хоста создаёт сущность, гость шлёт его хосту (k: 'tool') */
export interface ToolMsg { id: string; i: number; x: number; y: number; dx: number; dy: number; f: number }

/** вид сущности инструмента в w.tl (летящая игла, капкан, бомба, снаряд нити…) */
export interface ToolEntDef {
  /** вид (q.kind) */
  id: string;
  /** код на проводе: общий с видами снарядов (core/netplay.ts), только добавляется */
  netId: number;
  /** размер строки снимка у гостя */
  size: [number, number];
  /** шаг у хоста; bosses — живые и мёртвые боссы с ключами */
  step(sc: World, q: Q, dt: number, bosses: [Boss, BossRef][]): void;
  /** доп. поля строки снимка для отрисовки у гостя (по умолчанию [fuse]) */
  netCh?(q: Q): unknown;
}

export interface ToolDef {
  id: string; name: string; desc: string;
  /** цена в нити и перезарядка, с */
  cost: number; cd: number;
  /** как получить: 'boss:<id>' | 'shop:<цена>' */
  unlock: string;
  /** место в списках (снаряжение, фаззер); у существующих не менять */
  order?: number;
  /** применение кнопкой; нет — бросок: прицел, звук castSnd, сообщение и spawn у хоста */
  use?(sc: World, p: Player): boolean;
  /** бросок по умолчанию: высота точки броска над ногами героя (y + castY) и звук */
  castY?: number; castSnd?: string;
  /** у хоста: создать сущность по сообщению */
  spawn?(sc: World, m: ToolMsg): void;
  /** дополнительные сообщения 'tool' с другими id (удары нырка и т. п.) */
  msgs?: Record<string, (sc: World, m: ToolMsg) => void>;
  /** виды сущностей, которые создаёт инструмент */
  entities?: ToolEntDef[];
  /** номинальный урон по боссу за одно применение (баланс, тесты) */
  nominalDmg?: number;
}
export function defineTool(d: ToolDef): ToolDef { return d; }

/** направление броска / нити по вводу: ↑ — вверх, ↑ + сторона — диагональ, иначе вперёд */
export function toolAim(p: Player): { dx: number; dy: number; f: number } {
  const i = p.inp || {}, dir = (i.right ? 1 : 0) - (i.left ? 1 : 0), f = dir || p.face || 1;
  if (i.up) return dir ? { dx: f * 0.7071, dy: -0.7071, f } : { dx: 0, dy: -1, f };
  return { dx: f, dy: 0, f };
}
