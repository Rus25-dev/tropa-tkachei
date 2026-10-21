// Модель страницы рейтинга: разбор data/races.json, маршрутизация по хэшу, ряды для графика, профиль игрока, разбор гонки.
// Только чистые функции (без DOM): их проверяют tests/unit/rating.test.ts. Эло считает computeElo из src/core/elo.ts — единственный источник правды.
import { ELO_ALL, ELO_START, computeElo, nkey, scoreOf, type EloTables } from '../core/elo';
import { BOSS_INFO, fmtName } from '../core/duel';
import { modsText } from '../core/duelmods';
import { DISC, type RaceResult } from '../net/racecommon';
import { parseRaces } from '../net/racesfile';

// ----- загрузка файла -----
export type RatingData =
  | { kind: 'ok'; races: RaceResult[]; tables: EloTables }
  | { kind: 'empty' }
  | { kind: 'missing'; reason: string }
  | { kind: 'bad'; error: string };

const byDate = (a: RaceResult, b: RaceResult): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** гонки по возрастанию даты (как порядок пересчёта Эло) */
export const sortRaces = (races: readonly RaceResult[]): RaceResult[] => races.slice().sort(byDate);

/** разобрать текст races.json: пустой файл и файл без гонок — «empty», ошибка формата — «bad» */
export function readRatingText(text: string): RatingData {
  if (!text.trim()) return { kind: 'empty' };
  const r = parseRaces(text);
  if (!r.ok) return { kind: 'bad', error: r.error };
  if (!r.races.length) return { kind: 'empty' };
  const races = sortRaces(r.races);
  return { kind: 'ok', races, tables: computeElo(races) };
}
/** результат запроса файла (код ответа и тело) → данные страницы */
export function readRatingResponse(status: number, text: string): RatingData {
  if (status === 404 || status === 410) return { kind: 'missing', reason: 'Файл data/races.json не найден.' };
  if (status < 200 || status >= 300) return { kind: 'missing', reason: `Сервер ответил кодом ${status}.` };
  return readRatingText(text);
}

// ----- имена -----
export const discName = (d: string): string => DISC[d]?.name ?? d;
/** подписи отрезков (сплитов) по дисциплинам: то же, что SR_CATS.tags в игре; для неизвестных — номера */
const TAGS: Record<string, string[]> = { trail: ['Гл. I', 'Гл. II', 'Гл. III', 'Гл. IV'], boss: ['Корнематка', 'Миша', 'Владик', 'Тима'] };
/** подпись раунда дуэли: «Bo3 · раунд 2 · Миша Додик» (для остальных гонок пусто) */
export const duelLabel = (r: RaceResult): string => (r.duel ? `${fmtName(r.duel.fmt)} · раунд ${r.round ?? r.duel.slot + 1} · ${BOSS_INFO[r.duel.boss as keyof typeof BOSS_INFO]?.name ?? r.duel.boss}` : '');
export const duelMods = (r: RaceResult): string => (r.duel ? modsText(r.duel.mods as never) : '');
/** все раунды серии по порядку (пусто, если запись не из серии) */
export const seriesRounds = (races: readonly RaceResult[], r: RaceResult): RaceResult[] => (r.seriesId ? sortRaces(races.filter((x) => x.seriesId === r.seriesId)).sort((a, b) => (a.round ?? 0) - (b.round ?? 0)) : []);
export const splitTags = (d: string, n: number): string[] => Array.from({ length: n }, (_, i) => TAGS[d]?.[i] ?? `Отрезок ${i + 1}`);
/** дисциплины в порядке игры, затем неизвестные из файла */
export function disciplines(tables: EloTables): string[] {
  const known = Object.keys(DISC).filter((d) => tables.byDisc[d]);
  return [...known, ...Object.keys(tables.byDisc).filter((d) => !known.includes(d))];
}

// ----- маршрутизация хэшем -----
export type Route = { page: 'home'; scope: string } | { page: 'player'; name: string } | { page: 'race'; id: string };
const dec = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
/** #/ , #/disc/boss , #/player/Имя , #/race/id ; всё непонятное — главная */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const a = parts[0], b = parts.slice(1).join('/');
  if (a === 'player' && b) return { page: 'player', name: dec(b) };
  if (a === 'race' && b) return { page: 'race', id: dec(b) };
  if (a === 'disc' && b) return { page: 'home', scope: dec(b) };
  return { page: 'home', scope: ELO_ALL };
}
export function routeHash(r: Route): string {
  if (r.page === 'player') return `#/player/${encodeURIComponent(r.name)}`;
  if (r.page === 'race') return `#/race/${encodeURIComponent(r.id)}`;
  return r.scope === ELO_ALL ? '#/' : `#/disc/${encodeURIComponent(r.scope)}`;
}
export const playerHref = (name: string): string => routeHash({ page: 'player', name });
export const raceHref = (id: string): string => routeHash({ page: 'race', id });

// ----- график Эло -----
export interface EloSeries { x: number[]; y: number[]; ids: string[] }
const secs = (iso: string, fallback: number): number => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.floor(t / 1000) : fallback; };
/** ряд «время (секунды) → Эло после гонки» для игрока; scope — 'all' или дисциплина. Слева добавлена стартовая точка (Эло до первой гонки) за час до неё. x строго растёт */
export function eloSeries(races: readonly RaceResult[], tables: EloTables, key: string, scope: string = ELO_ALL): EloSeries {
  const x: number[] = [], y: number[] = [], ids: string[] = [];
  sortRaces(races).forEach((r, i) => {
    if (scope !== ELO_ALL && r.discipline !== scope) return;
    const pr = tables.perRace[r.id]; if (!pr) return;
    const ch = (scope === ELO_ALL ? pr.all : pr.disc)[key]; if (!ch) return;
    if (!x.length) { x.push(secs(r.date, i) - 3600); y.push(ch.before); ids.push(''); }
    let t = secs(r.date, i); const last = x[x.length - 1]!; if (t <= last) t = last + 1;
    x.push(t); y.push(ch.after); ids.push(r.id);
  });
  if (!x.length) { x.push(0); y.push(ELO_START); ids.push(''); }
  return { x, y, ids };
}

// ----- профиль игрока -----
export interface ScopeStat { scope: string; rating: number; rank: number; of: number; games: number; wins: number; draws: number; losses: number }
export interface BestTime { disc: string; time: number; raceId: string; date: string }
export interface H2H { key: string; name: string; games: number; wins: number; draws: number; losses: number }
export interface Profile {
  key: string; name: string; scopes: ScopeStat[]; best: BestTime[]; streak: number; bestGain: { delta: number; raceId: string } | null; h2h: H2H[]; recent: RaceResult[]; total: number;
}
export const timeOf = (p: { time: number | null; finalTime: number | null; dnf: boolean }): number | null => (p.dnf ? null : p.finalTime ?? p.time);
/** профиль игрока по имени (регистр и пробелы не важны); null — такого игрока нет в файле */
export function playerProfile(races: readonly RaceResult[], tables: EloTables, name: string): Profile | null {
  const key = nkey(name), sorted = sortRaces(races), mine = sorted.filter((r) => r.players.some((p) => nkey(p.name) === key));
  if (!mine.length) return null;
  const scopes: ScopeStat[] = [];
  const add = (scope: string, list: EloTables['all']): void => {
    const i = list.findIndex((x) => x.key === key);
    if (i >= 0) { const x = list[i]!; scopes.push({ scope, rating: x.rating, rank: i + 1, of: list.length, games: x.games, wins: x.wins, draws: x.draws, losses: x.losses }); }
  };
  add(ELO_ALL, tables.all); for (const d of disciplines(tables)) add(d, tables.byDisc[d]!);
  const best = new Map<string, BestTime>(), opp = new Map<string, H2H>();
  let streak = 0, run = 0, bestGain: Profile['bestGain'] = null, shown = name;
  for (const r of mine) {
    const me = r.players.find((p) => nkey(p.name) === key)!; shown = me.name;
    const t = r.discipline === 'duel' ? null : timeOf(me); // время убийства босса в дуэли у разных боссов несравнимо: рекорды только в «Тропе» и «Босс-раше»
    if (t != null && t > 0) { const b = best.get(r.discipline); if (!b || t < b.time) best.set(r.discipline, { disc: r.discipline, time: t, raceId: r.id, date: r.date }); }
    if (r.duel && !r.duel.final) continue; // промежуточные раунды серии не считаются партией: серия побед и личные встречи идут по сериям
    const win = (r.duel ? r.duel.seriesWinner : r.winner) != null && (r.duel ? r.duel.seriesWinner : r.winner) !== 'draw' && nkey((r.duel ? r.duel.seriesWinner : r.winner)!) === key;
    run = win ? run + 1 : 0; streak = Math.max(streak, run);
    const ch = tables.perRace[r.id]?.all[key];
    if (ch && ch.after - ch.before > (bestGain?.delta ?? 0)) bestGain = { delta: ch.after - ch.before, raceId: r.id };
    const other = r.players.length === 2 ? r.players.find((p) => nkey(p.name) !== key) : undefined, s = scoreOf(r);
    if (other && s != null) {
      const mineScore = nkey(r.players[0]!.name) === key ? s : 1 - s;
      const o = opp.get(nkey(other.name)) ?? { key: nkey(other.name), name: other.name, games: 0, wins: 0, draws: 0, losses: 0 };
      o.games++; if (mineScore === 1) o.wins++; else if (mineScore === 0) o.losses++; else o.draws++;
      opp.set(o.key, o);
    }
  }
  const order = disciplines(tables);
  return {
    key, name: shown, scopes, best: [...best.values()].sort((a, b) => order.indexOf(a.disc) - order.indexOf(b.disc)), streak, bestGain,
    h2h: [...opp.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)), recent: mine.slice(-10).reverse(), total: mine.filter((r) => !r.duel || r.duel.final).length,
  };
}

// ----- разбор гонки -----
/** строка сплитов: накопленное время и время отрезка по игрокам; dCum и dSeg — разница первого и второго (отрицательная — первый быстрее) */
export interface SplitRow { tag: string; cum: (number | null)[]; seg: (number | null)[]; dCum: number | null; dSeg: number | null }
export function splitRows(r: RaceResult): SplitRow[] {
  const n = Math.max(0, ...r.players.map((p) => p.splits.length)), tags = r.duel ? [BOSS_INFO[r.duel.boss as keyof typeof BOSS_INFO]?.name ?? r.duel.boss] : splitTags(r.discipline, n), rows: SplitRow[] = [];
  const at = (pi: number, i: number): number | null => { const v = r.players[pi]?.splits[i]; return typeof v === 'number' ? v : null; };
  for (let i = 0; i < n; i++) {
    const cum = r.players.map((_, pi) => at(pi, i));
    const seg = r.players.map((_, pi) => { const c = at(pi, i), p = i ? at(pi, i - 1) : 0; return c != null && p != null ? c - p : null; });
    const two = r.players.length === 2;
    rows.push({ tag: tags[i]!, cum, seg, dCum: two && cum[0] != null && cum[1] != null ? cum[0] - cum[1] : null, dSeg: two && seg[0] != null && seg[1] != null ? seg[0] - seg[1] : null });
  }
  return rows;
}
