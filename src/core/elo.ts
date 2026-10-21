// Рейтинг Эло для «Гонок Ткачей»: чистые функции, единственный источник правды — история гонок (races.json).
// Отдельный рейтинг по каждой дисциплине и общий; старт 1000, K = 40 для первых 10 гонок игрока, затем 24.
// Имена сравниваются без учёта регистра и пробелов, как в архиве.

export const ELO_START = 1000;
export const K_NEW = 40, K_OLD = 24, K_GAMES = 10;
export const ELO_ALL = 'all';

/** нужные поля записи архива (структурный тип: годится и для RaceResult, и для файла races.json) */
export interface EloRace {
  id: string; date: string; discipline: string; winner: string | null;
  players: { name: string; dnf?: boolean; place?: number }[];
  /** дуэль (2.4): раунды серии считаются одной партией — по победителю серии в последнем раунде; промежуточные раунды Эло не меняют */
  seriesId?: string; duel?: { final?: boolean; seriesWinner?: string | null };
}
export interface EloChange { before: number; after: number }
/** изменения Эло по гонке: id игрока (нормализованное имя) → до/после, отдельно по дисциплине и общий */
export interface RaceElo { disc: Record<string, EloChange>; all: Record<string, EloChange> }
export interface EloRow { key: string; name: string; rating: number; games: number; wins: number; draws: number; losses: number }
export interface EloTables { byDisc: Record<string, EloRow[]>; all: EloRow[]; perRace: Record<string, RaceElo> }

export const nkey = (n: string): string => String(n || '').toLowerCase().replace(/\s+/g, '');
/** шанс первого на победу по Эло (0..1) */
export const expected = (a: number, b: number): number => 1 / (1 + 10 ** ((b - a) / 400));
export const kFor = (games: number): number => (games < K_GAMES ? K_NEW : K_OLD);

interface Acc { name: string; rating: number; games: number; wins: number; draws: number; losses: number }
type Book = Map<string, Acc>;
function slot(book: Book, name: string): Acc {
  const k = nkey(name); let a = book.get(k);
  if (!a) { a = { name, rating: ELO_START, games: 0, wins: 0, draws: 0, losses: 0 }; book.set(k, a); }
  return a;
}
/** результат партии игрока 1 против игрока 2: 1 — победа, 0.5 — ничья, 0 — поражение; null — гонка не засчитывается */
export function scoreOf(r: EloRace): number | null {
  if (r.players.length !== 2) return null;
  const [p, q] = r.players as [EloRace['players'][number], EloRace['players'][number]];
  const winner = r.duel ? (r.duel.final ? r.duel.seriesWinner ?? null : null) : r.winner;
  if (winner === 'draw') return 0.5;
  if (winner == null) return null;
  if (nkey(winner) === nkey(p.name)) return 1;
  if (nkey(winner) === nkey(q.name)) return 0;
  return null;
}
function apply(book: Book, r: EloRace, s: number): Record<string, EloChange> {
  const [p, q] = r.players as [EloRace['players'][number], EloRace['players'][number]];
  const a = slot(book, p.name), b = slot(book, q.name);
  const ea = expected(a.rating, b.rating), ka = kFor(a.games), kb = kFor(b.games);
  const da = ka * (s - ea), db = kb * ((1 - s) - (1 - ea));
  const out: Record<string, EloChange> = {
    [nkey(p.name)]: { before: a.rating, after: Math.round(a.rating + da) },
    [nkey(q.name)]: { before: b.rating, after: Math.round(b.rating + db) },
  };
  a.rating = out[nkey(p.name)]!.after; b.rating = out[nkey(q.name)]!.after;
  a.games++; b.games++;
  if (s === 1) { a.wins++; b.losses++; } else if (s === 0) { b.wins++; a.losses++; } else { a.draws++; b.draws++; }
  return out;
}
const rows = (book: Book): EloRow[] => [...book.entries()].map(([key, a]) => ({ key, ...a })).sort((x, y) => y.rating - x.rating || y.games - x.games || x.name.localeCompare(y.name));

/** пересчитать Эло с нуля по истории гонок (порядок — по дате, затем по id) */
export function computeElo(races: readonly EloRace[]): EloTables {
  const sorted = races.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const books: Record<string, Book> = {}, all: Book = new Map(), perRace: Record<string, RaceElo> = {};
  for (const r of sorted) {
    const s = scoreOf(r); if (s == null) continue;
    const book = (books[r.discipline] ??= new Map());
    perRace[r.id] = { disc: apply(book, r, s), all: apply(all, r, s) };
  }
  const byDisc: Record<string, EloRow[]> = {};
  for (const d of Object.keys(books)) byDisc[d] = rows(books[d]!);
  return { byDisc, all: rows(all), perRace };
}
/** текущий рейтинг игрока по дисциплине (или общий, если disc не задан); 1000 для новичка */
export function ratingOf(t: EloTables, name: string, disc?: string): { rating: number; games: number } {
  const row = (disc ? t.byDisc[disc] ?? [] : t.all).find((x) => x.key === nkey(name));
  return row ? { rating: row.rating, games: row.games } : { rating: ELO_START, games: 0 };
}
/** шансы на победу перед стартом гонки: [первый, второй] в процентах */
export function winChances(t: EloTables, a: string, b: string, disc: string): [number, number] {
  const ea = expected(ratingOf(t, a, disc).rating, ratingOf(t, b, disc).rating), p = Math.round(ea * 100);
  return [p, 100 - p];
}
