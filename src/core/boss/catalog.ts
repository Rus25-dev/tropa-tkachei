// Каталог боссов для интерфейса и инструментов: карточки Босс-теста, списки для гонок и дуэли. Всё строится из реестра (registry.ts),
// поэтому новый босс = новый файл data/bosses/<id>.json, а этот файл не меняется.
import { bossDef, dataBossIds } from './registry';
import { arenaLevel, type BossDef } from './schema';

/** человеческие названия арен */
export const ARENA_NAMES: Record<string, string> = { misha: 'Старая типография', vladik: 'Кабинет музыки', tima: 'Берлога Тимы' };

/** Карточка босса: название, ориентир (короткая подсказка), арена */
export interface BossCard { id: string; name: string; about: string; landmark: string; arena: string; arenaName: string; dev: boolean; /** босс на данных (не ручной автомат) */ data: boolean }

/** Старые боссы-автоматы (Миша, Владик, Тима): карточки Босс-теста. Корнематка — в истории и дуэли, в Босс-тесте её нет. */
export const LEGACY_CARDS: readonly BossCard[] = [
  { id: 'misha', name: 'Миша Додик', about: 'Швыряется печатными буквами. Бей дымовыми бомбами в рюкзак.', landmark: 'Глава II', arena: 'misha', arenaName: ARENA_NAMES['misha']!, dev: false, data: false },
  { id: 'vladik', name: 'Владик Скрипка', about: 'Кидает скрипичные ключи и мажет шторы слизью. Бей иглой.', landmark: 'Глава III', arena: 'vladik', arenaName: ARENA_NAMES['vladik']!, dev: false, data: false },
  { id: 'tima', name: 'Тима Пиво', about: 'Пиво, банкротство, приставка и волшебная пыль. Бей иглой.', landmark: 'Глава IV', arena: 'tima', arenaName: ARENA_NAMES['tima']!, dev: false, data: false },
];

/** обычные боссы раньше dev-карточек; дальше order, затем id */
const byOrder = (a: BossDef, b: BossDef): number => Number(a.dev) - Number(b.dev) || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Боссы на данных, которые вообще можно показывать (без служебных участников боя); dev — с карточками разработчика */
export function listedDefs(dev: boolean): BossDef[] {
  return dataBossIds().map((id) => bossDef(id)!).filter((d) => !d.hidden && (dev || !d.dev)).sort(byOrder);
}
export function cardOf(d: BossDef): BossCard {
  const level = arenaLevel(d);
  return { id: d.id, name: d.dev ? `${d.name} (dev)` : d.name, about: d.about, landmark: d.landmark, arena: level, arenaName: ARENA_NAMES[level] ?? level, dev: d.dev, data: true };
}
/** Карточки Босс-теста: старые боссы, затем боссы из data/bosses (dev-карточки — только при dev = true, то есть ?dev=1) */
export function testCards(dev: boolean): BossCard[] { return [...LEGACY_CARDS, ...listedDefs(dev).map(cardOf)]; }

/** Все старые боссы дуэли и гонок по порядку глав */
export const LEGACY_DUEL = ['korne', 'misha', 'vladik', 'tima'] as const;
/** Боссы дуэли: четыре старых + боссы на данных с duel: true (не dev, не служебные) */
export function duelBossIds(): string[] { return [...LEGACY_DUEL, ...listedDefs(false).filter((d) => d.duel).map((d) => d.id)]; }
/** Боссы для гонок и ботов (таблица баланса): четыре старых + все показываемые боссы на данных */
export function raceBossIds(): string[] { return [...LEGACY_DUEL, ...listedDefs(false).map((d) => d.id)]; }
