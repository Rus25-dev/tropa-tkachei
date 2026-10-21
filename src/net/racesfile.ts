// Файл races.json: проверка при загрузке (zod) и слияние с архивом. Ошибки — по-русски, чтобы организатор понял, что не так с файлом.
import { z } from 'zod';
import type { RaceResult } from './racecommon';

const num = z.number().finite();
const row = z.object({
  seat: num, name: z.string().min(1), dnf: z.boolean(), time: num.nullable(), finalTime: num.nullable(), igt: num.nullable(), deaths: num.nullable(),
  stats: z.record(z.string(), z.any()).nullable(), splits: z.array(num), eloBefore: num.nullable(), eloAfter: num.nullable(), place: num,
  // необязательные поля 2.2: старые записи без них читаются как раньше
  subs: z.array(z.object({ ch: num, k: z.string(), rta: num }).passthrough()).optional(), lost: num.optional(), deathList: z.array(z.any()).optional(), buys: z.array(z.any()).optional(),
  bosses: z.array(z.object({ ch: num, dmg: num }).passthrough()).optional(),
  // необязательное поле 2.4: итог игрока в раунде дуэли
  duel: z.object({ kill: z.boolean(), frac: num, dmg: num }).passthrough().optional(),
}).passthrough();
// необязательные поля 2.4: раунд серии дуэли (формат серии, босс, модификаторы, счёт после раунда, победитель серии в последнем раунде)
const duelRec = z.object({
  fmt: z.union([z.literal(1), z.literal(3), z.literal(5)]), boss: z.string(), mods: z.array(z.string()), slot: num, why: z.string(), score: z.tuple([num, num]),
  final: z.boolean().optional(), seriesWinner: z.string().nullable().optional(),
}).passthrough();
const race = z.object({
  id: z.string().min(1), date: z.string().min(1), version: z.string(), discipline: z.string().min(1),
  settings: z.object({ cat: z.string(), easy: z.boolean(), speed: num }).passthrough(), seed: num,
  players: z.array(row).min(1).max(2), winner: z.string().nullable(), winnerSeat: z.union([num, z.literal('draw'), z.null()]),
  awarded: z.boolean(), gap: num.nullable(), goAt: num.nullable(), pauseMs: num, events: z.array(z.any()),
  seriesId: z.string().min(1).optional(), round: num.optional(), duel: duelRec.optional(),
}).passthrough();
export const racesFile = z.object({ format: z.literal('tropa-tkachei/races'), version: z.literal(1), game: z.string().optional(), exported: z.string().optional(), races: z.array(race) });

export type LoadRes = { ok: true; races: RaceResult[] } | { ok: false; error: string };
/** разобрать текст races.json; при ошибке — понятное сообщение */
export function parseRaces(text: string): LoadRes {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { ok: false, error: 'Это не JSON: файл повреждён или выбран не тот.' }; }
  const r = racesFile.safeParse(json);
  if (r.success) return { ok: true, races: r.data.races as unknown as RaceResult[] };
  const f = r.error.issues[0], at = f ? f.path.join('.') : '';
  const fmt = (json as { format?: unknown } | null)?.format;
  if (fmt !== 'tropa-tkachei/races') return { ok: false, error: 'Это не архив гонок «Тропы Ткачей» (ожидается format «tropa-tkachei/races»).' };
  return { ok: false, error: `Файл не подходит${at ? ` (поле ${at})` : ''}: ${f?.message ?? 'неверный формат'}.` };
}
/** слить загруженные гонки в архив по id; возвращает новый архив и число добавленных записей */
export function mergeRaces(have: readonly RaceResult[], add: readonly RaceResult[]): { races: RaceResult[]; added: number } {
  const ids = new Set(have.map((r) => r.id)), out = have.slice(); let added = 0;
  for (const r of add) if (!ids.has(r.id)) { ids.add(r.id); out.push(r); added++; }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { races: out, added };
}
