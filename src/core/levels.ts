// Уровни игры: главы I–IV и арены боссов лежат в levels/tropa.ldtk (редактируются в LDtk), а здесь собираются в Level ядра.
// Это те же уровни, что были в v1.8, тайл в тайл (проверяет tests/unit/levels.test.ts против кодового оракула tests/oracle/levels-code.ts
// и против самого кода v1.8). Каждый вызов возвращает НОВЫЙ объект: мир меняет сетку (ворота, мебель), делиться ею нельзя.
// Файл .ldtk подключается как JSON: в Vite/Vitest — плагином из vite.config.ts, в Node/tsx — tools/ldtk-register.mjs.
import tropa from '../../levels/tropa.ldtk' with { type: 'json' };
import { levelFromLdtk } from './ldtk';
import type { Level } from './types';

/** Идентификаторы уровней в levels/tropa.ldtk. */
export const LEVEL_IDS = {
  chapter1: 'Ch1', road: { 2: 'Road2', 3: 'Road3', 4: 'Road4' } as Record<number, string>,
  arena: { misha: 'ArenaMisha', vladik: 'ArenaVladik', tima: 'ArenaTima' } as Record<string, string>,
} as const;

const load = (id: string): Level => levelFromLdtk(tropa, id);

/** Глава I — «Мшистая Глубь». */
export const buildLevel = (): Level => load(LEVEL_IDS.chapter1);

/** Коридор перед ареной главы II–IV. */
export function buildRoad(ch: number): Level {
  const id = LEVEL_IDS.road[ch];
  if (!id) throw new Error(`Нет коридора для главы ${ch}: есть только II–IV`);
  return load(id);
}

export const buildMishaArena = (): Level => load(LEVEL_IDS.arena['misha']!);
export const buildVladikArena = (): Level => load(LEVEL_IDS.arena['vladik']!);
export const buildTimaArena = (): Level => load(LEVEL_IDS.arena['tima']!);

export const ARENAS: Record<string, () => Level> = { misha: buildMishaArena, vladik: buildVladikArena, tima: buildTimaArena };
