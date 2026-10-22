// Каталог боссов для интерфейса и инструментов: карточки Босс-теста, списки для гонок и дуэли. Всё строится из реестра (registry.ts),
// поэтому новый босс = новый файл data/bosses/<id>.json, а этот файл не меняется.
import { CHAPTER_BOSSES } from '../balance';
import { bossDef, dataBossIds } from './registry';
import { arenaLevel, type BossDef } from './schema';

/** человеческие названия арен */
export const ARENA_NAMES: Record<string, string> = { misha: 'Старая типография', vladik: 'Кабинет музыки', tima: 'Берлога Тимы' };

/** Карточка босса: название, ориентир (короткая подсказка), арена */
export interface BossCard { id: string; name: string; about: string; landmark: string; arena: string; arenaName: string; dev: boolean }

/** обычные боссы раньше dev-карточек; дальше order, затем id */
const byOrder = (a: BossDef, b: BossDef): number => Number(a.dev) - Number(b.dev) || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Боссы на данных, которые вообще можно показывать (без служебных участников боя); dev — с карточками разработчика.
 *  Боссы глав идут первыми, в порядке глав (они же — Босс-раш и основа дуэли); остальные — по order. */
export function listedDefs(dev: boolean): BossDef[] {
  const all = dataBossIds().map((id) => bossDef(id)!).filter((d) => !d.hidden && (dev || !d.dev));
  const ch = (d: BossDef): number => CHAPTER_BOSSES.indexOf(d.id);
  const inCh = all.filter((d) => ch(d) >= 0).sort((a, b) => ch(a) - ch(b));
  return [...inCh, ...all.filter((d) => ch(d) < 0).sort(byOrder)];
}
export function cardOf(d: BossDef): BossCard {
  const level = arenaLevel(d);
  return { id: d.id, name: d.dev ? `${d.name} (dev)` : d.name, about: d.about, landmark: d.landmark, arena: level, arenaName: ARENA_NAMES[level] ?? level, dev: d.dev };
}
/** Карточки Босс-теста: боссы глав по порядку глав, затем остальные (dev-карточки — только при dev = true, то есть ?dev=1) */
export function testCards(dev: boolean): BossCard[] { return listedDefs(dev).map(cardOf); }

/** Боссы глав по порядку глав: они же — Босс-раш и первые боссы дуэли (по номеру главы) */
export const CHAPTER_IDS: readonly string[] = CHAPTER_BOSSES;
/** Боссы дуэли: боссы глав + боссы на данных с duel: true (не dev, не служебные) */
export function duelBossIds(): string[] { return [...CHAPTER_IDS, ...listedDefs(false).filter((d) => d.duel && !CHAPTER_IDS.includes(d.id)).map((d) => d.id)]; }
/** Боссы для гонок и ботов (таблица баланса): боссы глав + все показываемые боссы на данных */
export function raceBossIds(): string[] { return [...CHAPTER_IDS, ...listedDefs(false).filter((d) => !CHAPTER_IDS.includes(d.id)).map((d) => d.id)]; }
