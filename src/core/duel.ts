// «Дуэль ткачей»: чистая логика серии — бан/пик боссов, порядок раундов, счёт, победитель раунда и серии, модификаторы раундов.
// Ничего не знает про сеть, часы и экран; случайность (кто банит первым, решающий босс, случайный модификатор, жребий при ничьих) берётся
// только из зерна комнаты через именованные потоки (core/rng.ts), поэтому организатор, игроки и обсервер всегда видят одно и то же.
//
// Правила (подробнее — docs/NEXT_VERSIONS.md, раздел 2.4):
//  * Боссов четыре (боссы глав): Первый Кающийся, Миша, Владик, Тима. «A» — тот, кто ходит первым в бан/пик; его назначает жребий из зерна.
//  * Bo1: баны A, B, A — остаётся один босс, он и решающий. Bo3: A банит, B пикает, A пикает — остаётся решающий.
//    Bo5: бана нет, пики A, B, A, B — четыре раунда по пикам, пятый (решающий) босс выпадает жребием из зерна, потому что остатка нет.
//    (Схема «бан-бан-пик-пик-остаток» требует пяти боссов; при четырёх она не оставила бы решающего, поэтому баны урезаны.)
//  * Раунды идут в порядке: пики по очереди их выбора, затем решающий. Босс в серии не повторяется, кроме решающего раунда Bo5.
//  * Раунд: оба играют одного босса на одном зерне одновременно. Убил быстрее — победил; убил только один — он; никто не убил (оба оборвали нить) —
//    у кого сняно больше здоровья босса. Ничья переигрывается новым зерном; третья ничья подряд решается жребием из зерна.
//  * Серия кончается, когда у кого-то набралось нужное число побед (Bo1 — 1, Bo3 — 2, Bo5 — 3).
import { cleanMods, DUEL_MODS, type DuelMod } from './duelmods';
import { CHAPTER_IDS, duelBossIds } from './boss/catalog';
import { bossDef } from './boss/registry';
import { mulberry32, rngSeedFor } from './rng';

/** Боссы дуэли: боссы глав по порядку глав + боссы на данных с duel: true (список строится из реестра боссов, этот файл при добавлении босса не меняется) */
export const DUEL_BOSSES: readonly string[] = duelBossIds();
export type DuelBoss = string;
export interface BossInfo { name: string; short: string; ch: number; note: string }
/** короткие имена и подсказки боссов глав для экрана бан/пик (остальное берётся из описания босса) */
const CHAPTER_INFO: Record<string, { short: string; note: string }> = {
  penitent: { short: 'Кающийся', note: 'Вериги, язык цветов и смена боя на половине' },
  misha2: { short: 'Миша', note: 'Рюкзак, печатные буквы и валик' },
  vladik2: { short: 'Владик', note: 'Смычок, нотный стан и эхо' },
  tima2: { short: 'Тима', note: 'Пиво, банкротство и волшебная пыль' },
};
/** карточка босса: имя, глава (0 — босс не из глав, у него нет главы), короткая подсказка для экрана бан/пик */
export const BOSS_INFO: Record<DuelBoss, BossInfo> = Object.fromEntries(DUEL_BOSSES.map((id): [string, BossInfo] => {
  const d = bossDef(id), ch = CHAPTER_IDS.indexOf(id) + 1, i = CHAPTER_INFO[id];
  return [id, { name: d?.name ?? id, short: i?.short ?? d?.name ?? id, ch, note: i?.note ?? (d?.landmark || d?.about || '') }];
}));
export const bossOfCh = (ch: number): DuelBoss => CHAPTER_IDS[Math.max(0, Math.min(3, ch - 1))]!;
export const isBossId = (x: unknown): x is DuelBoss => typeof x === 'string' && DUEL_BOSSES.includes(x);

export type SeriesFmt = 1 | 3 | 5;
export const FORMATS: readonly SeriesFmt[] = [1, 3, 5];
export const fmtName = (f: SeriesFmt): string => `Bo${f}`;
export const isFmt = (x: unknown): x is SeriesFmt => x === 1 || x === 3 || x === 5;
/** сколько побед нужно для серии */
export const winsNeeded = (f: SeriesFmt): number => (f + 1) >> 1;

/** сторона серии: 0 и 1 — игроки по порядку мест в комнате */
export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export interface ModCfg {
  /** модификаторы, которые действуют в каждом раунде */
  fixed: DuelMod[];
  /** плюс один случайный из остальных на каждый раунд (из зерна комнаты) */
  random: boolean;
}
export const NO_MODS: ModCfg = { fixed: [], random: false };

export interface VetoStep { kind: 'ban' | 'pick'; who: 'first' | 'second' }
/** порядок бан/пик для формата серии (см. правила в шапке файла) */
export function vetoPlan(f: SeriesFmt): VetoStep[] {
  if (f === 1) return [{ kind: 'ban', who: 'first' }, { kind: 'ban', who: 'second' }, { kind: 'ban', who: 'first' }];
  if (f === 3) return [{ kind: 'ban', who: 'first' }, { kind: 'pick', who: 'second' }, { kind: 'pick', who: 'first' }];
  return [{ kind: 'pick', who: 'first' }, { kind: 'pick', who: 'second' }, { kind: 'pick', who: 'first' }, { kind: 'pick', who: 'second' }];
}

export interface VetoLog { kind: 'ban' | 'pick'; side: Side; boss: DuelBoss }
export type RoundWin = 'a' | 'b' | 'draw';
export interface RoundRec {
  /** место раунда в серии (с нуля): переигранная ничья занимает то же место */
  slot: number; boss: DuelBoss; mods: DuelMod[]; seed: number; winner: RoundWin;
  /** почему: быстрее убил / убил только один / больше снято здоровья / ничья / жребий после третьей ничьи */
  why: RoundWhy;
}
export type RoundWhy = 'faster' | 'kill' | 'damage' | 'draw' | 'coin' | 'walkover';
export interface Series {
  v: 1; fmt: SeriesFmt; seed: number; cfg: ModCfg;
  /** кто ходит первым в бан/пик */
  first: Side;
  pool: DuelBoss[]; bans: VetoLog[]; picks: VetoLog[]; /** все ходы бан/пика по порядку */ log: VetoLog[]; decider: DuelBoss | null;
  /** порядок боссов по раундам (готов, когда бан/пик закончен) */
  order: DuelBoss[];
  stage: 'veto' | 'play' | 'over';
  /** сколько шагов бан/пик сделано */
  step: number;
  rounds: RoundRec[]; score: [number, number]; draws: number;
  winner: Side | null;
}

const rngOf = (seed: number, name: string): (() => number) => mulberry32(rngSeedFor(seed, name));

/** новая серия: первого в бан/пик назначает жребий из зерна */
export function newSeries(fmt: SeriesFmt, seed: number, cfg: ModCfg = NO_MODS): Series {
  const first: Side = rngOf(seed, 'duel:first')() < 0.5 ? 0 : 1;
  return { v: 1, fmt, seed: seed >>> 0, cfg: { fixed: cleanMods(cfg.fixed), random: !!cfg.random }, first, pool: DUEL_BOSSES.slice(), bans: [], picks: [], log: [], decider: null, order: [], stage: 'veto', step: 0, rounds: [], score: [0, 0], draws: 0, winner: null };
}

export interface VetoNow { kind: 'ban' | 'pick'; side: Side; left: DuelBoss[]; step: number; of: number }
/** чей сейчас ход в бан/пик; null, если бан/пик закончен */
export function vetoNow(s: Series): VetoNow | null {
  if (s.stage !== 'veto') return null;
  const plan = vetoPlan(s.fmt), st = plan[s.step]; if (!st) return null;
  return { kind: st.kind, side: st.who === 'first' ? s.first : other(s.first), left: s.pool.slice(), step: s.step, of: plan.length };
}
export type Res<T> = { ok: true; s: T } | { ok: false; why: string };

/** ход игрока в бан/пик; ошибка — понятным текстом */
export function applyVeto(s: Series, side: Side, boss: string): Res<Series> {
  const now = vetoNow(s);
  if (!now) return { ok: false, why: 'бан/пик уже закончен' };
  if (side !== now.side) return { ok: false, why: 'сейчас ходит соперник' };
  if (!isBossId(boss) || !s.pool.includes(boss)) return { ok: false, why: 'этого босса уже нет в списке' };
  const n: Series = { ...s, pool: s.pool.filter((b) => b !== boss), bans: s.bans.slice(), picks: s.picks.slice(), log: s.log.slice(), step: s.step + 1 };
  const mv: VetoLog = { kind: now.kind, side, boss };
  (now.kind === 'ban' ? n.bans : n.picks).push(mv); n.log.push(mv);
  if (n.step >= vetoPlan(n.fmt).length) {
    n.decider = n.pool.length ? n.pool[0]! : DUEL_BOSSES[Math.floor(rngOf(n.seed, 'duel:decider')() * DUEL_BOSSES.length)]!;
    n.order = [...n.picks.map((p) => p.boss), n.decider];
    n.stage = 'play';
  }
  return { ok: true, s: n };
}
/** выбор за игрока, который не успел или не в сети: детерминированно из зерна и номера шага */
export function autoVeto(s: Series): DuelBoss | null {
  const now = vetoNow(s); if (!now || !now.left.length) return null;
  return now.left[Math.floor(rngOf(s.seed, `duel:auto:${s.step}`)() * now.left.length)]!;
}

/** сколько раундов засчитано (ничьи не в счёт: они переигрываются) */
export const decided = (s: Series): number => s.rounds.filter((r) => r.winner !== 'draw').length;

/** модификаторы раунда на месте slot: постоянные плюс (если включено) один случайный из остальных. Переигранная ничья не меняет их */
export function modsFor(s: Series, slot: number): DuelMod[] {
  const fixed = cleanMods(s.cfg.fixed), rest = DUEL_MODS.filter((m) => !fixed.includes(m));
  if (!s.cfg.random || !rest.length) return fixed;
  const pick = rest[Math.floor(rngOf(s.seed, `duel:mod:${slot}`)() * rest.length)]!;
  return cleanMods([...fixed, pick]);
}
export interface RoundPlan { slot: number; boss: DuelBoss; ch: number; mods: DuelMod[]; seed: number; /** номер раунда для показа (с единицы), включая переигранные */ n: number }
/** следующий раунд серии (после бан/пика); null — серия не готова или закончена. retry — сколько раз раунд уже переигрывали вручную */
export function planRound(s: Series, retry = 0): RoundPlan | null {
  if (s.stage !== 'play') return null;
  const slot = decided(s), boss = s.order[slot]; if (!boss) return null;
  return { slot, boss, ch: BOSS_INFO[boss].ch, mods: modsFor(s, slot), seed: rngSeedFor(s.seed, `duel:round:${s.rounds.length}:${retry}`), n: s.rounds.length + 1 };
}

// ----- победитель раунда -----
/** то, что известно о раунде игрока: убил ли босса, за какое время (мс) и какую долю здоровья босса снял (0..1) */
export interface RoundSide { kill: boolean; time: number | null; frac: number; /** сдался (вышел из забега) */ quit?: boolean }
/** доля снятого здоровья босса по остатку: 0 — не тронут, 1 — убит */
export function fracOf(hp: number, mh: number): number {
  if (!(mh > 0)) return 0;
  return Math.round(Math.max(0, Math.min(1, 1 - hp / mh)) * 10000) / 10000;
}
/** разница времён меньше этого считается ничьей (мс), как в обычной гонке */
export const TIE_MS = 10;
/** разница долей здоровья меньше этого считается ничьей */
export const TIE_FRAC = 0.0005;
export interface RoundVerdict { winner: RoundWin; why: RoundWhy; /** разница времён убийств (мс), если оба убили */ gap: number | null }
export function roundWinner(a: RoundSide, b: RoundSide): RoundVerdict {
  if (a.quit && b.quit) return { winner: 'draw', why: 'draw', gap: null };
  if (a.quit) return { winner: 'b', why: 'walkover', gap: null };
  if (b.quit) return { winner: 'a', why: 'walkover', gap: null };
  if (a.kill && b.kill) {
    const gap = (b.time ?? 0) - (a.time ?? 0);
    if (Math.abs(gap) < TIE_MS) return { winner: 'draw', why: 'draw', gap };
    return { winner: gap > 0 ? 'a' : 'b', why: 'faster', gap };
  }
  if (a.kill) return { winner: 'a', why: 'kill', gap: null };
  if (b.kill) return { winner: 'b', why: 'kill', gap: null };
  const d = a.frac - b.frac;
  if (Math.abs(d) < TIE_FRAC) return { winner: 'draw', why: 'draw', gap: null };
  return { winner: d > 0 ? 'a' : 'b', why: 'damage', gap: null };
}

/** записать итог раунда: счёт, ничьи (третья подряд — жребий), конец серии. Возвращает новую серию и запись раунда */
export function recordRound(s: Series, plan: RoundPlan, v: RoundVerdict): { s: Series; rec: RoundRec } {
  let winner = v.winner, why = v.why, draws = s.draws;
  if (winner === 'draw') {
    if (draws >= 2) { winner = rngOf(s.seed, `duel:coin:${plan.slot}`)() < 0.5 ? 'a' : 'b'; why = 'coin'; draws = 0; } else draws++;
  } else draws = 0;
  const rec: RoundRec = { slot: plan.slot, boss: plan.boss, mods: plan.mods.slice(), seed: plan.seed, winner, why };
  const score: [number, number] = [s.score[0], s.score[1]];
  if (winner === 'a') score[0]++; else if (winner === 'b') score[1]++;
  const n: Series = { ...s, rounds: [...s.rounds, rec], score, draws };
  const need = winsNeeded(s.fmt);
  if (score[0] >= need || score[1] >= need) { n.stage = 'over'; n.winner = score[0] >= need ? 0 : 1; }
  return { s: n, rec };
}

/** отменить последний записанный раунд (организатор отменил присуждение победы) */
export function undoRound(s: Series): Series {
  const last = s.rounds[s.rounds.length - 1]; if (!last) return s;
  const score: [number, number] = [s.score[0], s.score[1]];
  if (last.winner === 'a') score[0]--; else if (last.winner === 'b') score[1]--;
  const rounds = s.rounds.slice(0, -1);
  let draws = 0; for (let i = rounds.length - 1; i >= 0 && rounds[i]!.winner === 'draw' && rounds[i]!.slot === last.slot; i--) draws++;
  return { ...s, rounds, score, draws, stage: 'play', winner: null };
}

/** подпись серии: «Bo3 · 1:0» */
export const scoreText = (s: Series): string => `${fmtName(s.fmt)} · ${s.score[0]}:${s.score[1]}`;

/** картинка на экране бан/пик: состояние каждого босса (свободен, забанен кем, выбран кем, решающий) */
export type CardState = { st: 'free' } | { st: 'ban' | 'pick'; side: Side; n: number } | { st: 'decider' } | { st: 'random' };
export function cardStates(s: Series): Record<DuelBoss, CardState> {
  const out = {} as Record<DuelBoss, CardState>;
  for (const b of DUEL_BOSSES) out[b] = { st: 'free' };
  s.bans.forEach((x, i) => { out[x.boss] = { st: 'ban', side: x.side, n: i + 1 }; });
  s.picks.forEach((x, i) => { out[x.boss] = { st: 'pick', side: x.side, n: i + 1 }; });
  if (s.decider && s.stage !== 'veto' && out[s.decider].st === 'free') out[s.decider] = { st: 'decider' };
  return out;
}
