// Запись партии .ttrec: расширенный журнал ввода (core/journal.ts) с заголовком. Формат описан в docs/TTREC.md.
// Файл — обычный JSON. Партия целиком = зерно + настройки + ввод по тикам + действия интерфейса, ядро детерминировано,
// поэтому запись воспроизводится в тот же исход в игре (?watch=), в Node (npm run replay) и в тестах.
// Чистый модуль без DOM: годится и для игры, и для Node-инструментов.
import type { Journal, JournalSeg } from './journal';
import { outcome } from './journal';
import { normalizeSave, type LoadoutSave } from './loadout';
import { replayJournal, type ReplayResult } from './replay';
import type { BalanceData, DeepPartial } from './balance-schema';

export const TTREC_FORMAT = 'ttrec';
export const TTREC_VERSION = 1;
/** предел длины записи в тиках (5 часов игры): защита от файла, который вешает воспроизведение */
export const TTREC_MAX_TICKS = 60 * 60 * 60 * 5;

export type TtrecKind = 'player' | 'bot' | 'fuzz' | 'repro';
export interface TtrecMeta {
  kind: TtrecKind;
  /** подпись: «Миша · бот 0.6», название находки фаззера и т. п. */
  label?: string;
  /** босс, если запись боя */
  boss?: string | null;
  /** мастерство бота */
  skill?: number;
  /** дата ISO; ставит приложение (ядру часы запрещены) */
  created?: string;
  note?: string;
}
export interface TtrecSetup {
  easy?: boolean;
  /** надетое снаряжение на время записи (tt_loadout) */
  loadout?: LoadoutSave;
  /** переопределение баланса, при котором снята запись (только Node-инструменты); игра такие записи не проигрывает */
  balance?: DeepPartial<BalanceData>;
}
export interface Ttrec {
  format: typeof TTREC_FORMAT;
  v: typeof TTREC_VERSION;
  /** версия игры, в которой снята запись */
  ver: string;
  meta: TtrecMeta;
  setup: TtrecSetup;
  journal: Journal;
  /** ожидаемый исход (core/journal.ts outcome): по нему проверяется воспроизведение */
  expect?: Record<string, unknown>;
}

export function makeTtrec(journal: Journal, o: { ver: string; meta: TtrecMeta; setup?: TtrecSetup; expect?: Record<string, unknown> }): Ttrec {
  return { format: TTREC_FORMAT, v: TTREC_VERSION, ver: o.ver, meta: o.meta, setup: o.setup ?? {}, journal, ...(o.expect ? { expect: o.expect } : {}) };
}

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const isArr = (x: unknown): x is unknown[] => Array.isArray(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

function checkSeg(s: unknown, i: number): string | null {
  const at = `journal.segs[${i}]`;
  if (!isObj(s)) return `${at}: ожидался объект`;
  if (!isInt(s['seed']) || !isInt(s['np']) || (s['np'] as number) < 1 || (s['np'] as number) > 2) return `${at}: неверные seed/np`;
  if (s['hv'] !== 1 && s['hv'] !== 2) return `${at}: hv должен быть 1 или 2`;
  if (!isInt(s['n']) || (s['n'] as number) < 0 || (s['n'] as number) > TTREC_MAX_TICKS) return `${at}: неверная длина n`;
  if (!isObj(s['data'])) return `${at}: нет data`;
  const mode = (s['data'] as Record<string, unknown>)['mode'];
  if (mode !== 'story' && mode !== 'bosstest') return `${at}: data.mode должен быть story или bosstest`;
  const rle = s['rle'];
  if (!isArr(rle) || rle.length % 2 || rle.some((x) => !isInt(x) || (x as number) < 0)) return `${at}: rle — пары [значение, повторов]`;
  let sum = 0; for (let k = 1; k < rle.length; k += 2) { if ((rle[k] as number) < 1) return `${at}: повторов должно быть ≥ 1`; sum += rle[k] as number; }
  if (sum !== s['n']) return `${at}: сумма повторов rle (${sum}) не равна n (${String(s['n'])})`;
  const acts = s['acts'];
  if (!isArr(acts) || acts.some((a) => !isArr(a) || a.length !== 5 || !isInt(a[0]) || typeof a[1] !== 'string' || !isInt(a[2]) || !isInt(a[3]) || !isInt(a[4]))) return `${at}: acts — списки [тик, имя, a, b, c]`;
  const chk = s['chk'];
  if (!isArr(chk) || chk.length % 2 || chk.some((x) => !isInt(x))) return `${at}: chk — пары [тик, хэш]`;
  return null;
}

/** Проверка структуры записи (файл может прийти откуда угодно). Возвращает текст ошибки или null. */
export function ttrecError(r: unknown): string | null {
  if (!isObj(r)) return 'запись должна быть объектом JSON';
  if (r['format'] !== TTREC_FORMAT) return 'это не запись .ttrec (нет format: "ttrec")';
  if (r['v'] !== TTREC_VERSION) return `версия формата ${String(r['v'])} не поддерживается (нужна ${TTREC_VERSION})`;
  if (typeof r['ver'] !== 'string') return 'нет версии игры ver';
  if (!isObj(r['meta']) || !['player', 'bot', 'fuzz', 'repro'].includes(r['meta']['kind'] as string)) return 'meta.kind должен быть player, bot, fuzz или repro';
  if (!isObj(r['setup'])) return 'нет setup';
  const J = r['journal'];
  if (!isObj(J) || J['v'] !== 1) return 'journal: нужна версия журнала v:1';
  if (!isArr(J['segs']) || J['segs'].length < 1 || J['segs'].length > 64) return 'journal.segs: от 1 до 64 отрезков';
  let total = 0;
  for (let i = 0; i < J['segs'].length; i++) { const e = checkSeg(J['segs'][i], i); if (e) return e; total += (J['segs'][i] as JournalSeg).n; }
  if (total > TTREC_MAX_TICKS) return 'запись слишком длинная';
  if (J['cat'] !== null && J['cat'] !== 'trail' && J['cat'] !== 'boss') return 'journal.cat должен быть null, trail или boss';
  if (!isArr(J['splits']) || !isArr(J['pauses'])) return 'journal: нет splits/pauses';
  return null;
}

export function parseTtrec(text: string): Ttrec {
  let r: unknown;
  try { r = JSON.parse(text); } catch (e) { throw new Error('не JSON: ' + (e as Error).message); }
  const err = ttrecError(r);
  if (err) throw new Error(err);
  return r as Ttrec;
}
export const stringifyTtrec = (r: Ttrec): string => JSON.stringify(r);

/** сколько тиков в записи и длительность в секундах */
export function ttrecTicks(r: Ttrec): number { return r.journal.segs.reduce((s, g) => s + g.n, 0); }

export interface TtrecPlay { result: ReplayResult; outcome: Record<string, unknown> | null; match: boolean | null }
/** Проигрывает запись ядром (без отрисовки). match — совпал ли исход с r.expect (null, если ожидания нет или воспроизведение сорвалось). */
export function playTtrec(r: Ttrec, opt: { ver?: string; clock?: () => number } = {}): TtrecPlay {
  const result = replayJournal(r.journal, { loadoutSave: r.setup.loadout ? normalizeSave(r.setup.loadout) : undefined, easy: !!r.setup.easy, ver: opt.ver ?? r.ver, clock: opt.clock });
  if (!result.ok) return { result, outcome: null, match: null };
  const out = JSON.parse(JSON.stringify(outcome(result.world))) as Record<string, unknown>;
  return { result, outcome: out, match: r.expect ? JSON.stringify(out) === JSON.stringify(r.expect) : null };
}
