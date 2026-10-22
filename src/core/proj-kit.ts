// Описание вида снаряда (w.projs): шаг, флаги попадания и срезания, сеть, допустимость в данных боссов.
// Один вид — один файл src/content/projectiles/<id>.ts с default-экспортом defineProj({...}); отрисовка — src/view/content/projectiles/<id>.ts.
// Модуль-лист: из ядра — только типы и листовой реестр, его можно подключать из файлов содержимого без циклов.
import type { Proj } from './types';
import type { World } from './world';
import { projReg } from './plugin/regs';

export interface ProjDef {
  /** вид снаряда (Proj.kind) */
  id: string;
  order?: number;
  /** код вида в снимке гостю; уникален среди снарядов и сущностей инструментов, только добавляется */
  netId: number;
  /** размер прямоугольника в снимке [w, h] */
  size: [number, number];
  /** шаг хоста (движение, столкновение со стенами); нет — снаряд стоит на месте */
  step?: (sc: World, pr: Proj, dt: number) => void;
  /** шаг гостя до общего сдвига x += vx·dt, y += vy·dt (гравитация, вращение) */
  guest?: (pr: Proj, dt: number) => void;
  /** снаряд героя (дымовая бомба): не ранит героев, не гаснет при смене фазы и во взрывах, без контура опасности */
  hero?: boolean;
  /** не исчезает, попав в героя (волна, эхо) */
  persist?: boolean;
  /** урон по умолчанию 2 вместо 1 (если в снаряде не задан dmg) */
  heavy?: boolean;
  /** срезается обычным ударом героя. true — золотые искры и звон, гость срезает у себя и сообщает хосту.
   *  Объект — своя реакция onCut на хосте; guestCut: false — гость не срезает (решает только хост). */
  slash?: boolean | { onCut?: (sc: World, pr: Proj) => void; guestCut?: boolean };
  /** срезается ударом, который рубит всё (cutAll у оружия или удара) */
  cutAll?: boolean;
  /** гаснет, когда босс оглушён */
  dieOnStagger?: boolean;
  /** можно задавать в данных боссов (data/bosses/*.json, proj.kind) */
  data?: boolean;
  /** Можно удалить успешным отбивом / всполохом; по умолчанию отбив чистит только parry. */
  parryClear?: boolean;
  burstClear?: boolean;
  /** Связанный с атакой снаряд: удалить при её отмене (независимые опасности сохраняются). */
  cancelOnInterrupt?: boolean;
  /** false для телепортирующихся объектов: их перемещение не является траекторией удара. */
  swept?: boolean;
}

export function defineProj(d: ProjDef): ProjDef { return d; }

/** урон снаряда по герою: dmg снаряда или по виду (тяжёлый — 2) */
export const projDmg = (pr: Proj): number => pr.dmg ?? (projReg.get(pr.kind)?.heavy ? 2 : 1);
/** снаряд героя (дымовая бомба): не ранит героев, не гаснет при смене фазы и во взрывах */
export const isHeroProj = (kind: string): boolean => !!projReg.get(kind)?.hero;

export function canClearProj(pr: Proj, by: 'parry' | 'burst'): boolean {
  const def = projReg.get(pr.kind);
  if (def?.hero || pr.dead || (pr.delay ?? 0) > 0) return false;
  return by === 'parry' ? (def?.parryClear ?? (pr.hk === undefined || pr.hk === 'parry')) : (def?.burstClear ?? true);
}
