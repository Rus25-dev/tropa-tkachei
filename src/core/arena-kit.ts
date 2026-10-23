// Описание арены босса: уровень из levels/tropa.ldtk, точка босса, название. Одна арена — один файл src/content/arenas/<id>.ts
// (default-экспорт defineArena({...})); убранство арены (надписи, ящики, мебель, частицы) — src/view/content/arenas/<id>.ts.
// Босс выбирает арену полем arena в data/bosses/<id>.json (строка id или { level: id, ents }).
import type { Level } from './types';
import { arenaReg } from './plugin/regs';

export interface ArenaDef {
  /** id арены (поле arena в данных босса) */
  id: string;
  order?: number;
  /** название для карточек Босс-теста */
  name: string;
  /** Подзаголовок при входе; для арен на переиспользованной геометрии. */
  region?: string;
  /** идентификатор уровня в levels/tropa.ldtk */
  ldtk: string;
  /** точка босса в тайлах: от неё считаются пол арены и место появления (обычно сущность уровня) */
  spot: (L: Level) => { x: number; y: number } | undefined;
}

export function defineArena(d: ArenaDef): ArenaDef { return d; }

/** точка босса арены id на уровне L (в тайлах): пол арены и место появления */
export function arenaSpot(L: Level, id: string): { x: number; y: number } | undefined { return arenaReg.get(id)?.spot(L); }
