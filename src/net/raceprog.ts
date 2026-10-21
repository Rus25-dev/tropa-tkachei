// «Гонки Ткачей»: ход забега по подсплитам — чистые функции для организатора, игрока и обсервера (без DOM, сети и часов).
// Подсплиты: выход из коридора, скамья, начало боя, фазы 2 и 3 босса, смерть босса (ядро: core/racestats.ts). Сплиты глав — на смерти босса.
import { SR_CATS } from '../core/balance';
import { nkey } from '../core/elo';
import type { BossRow, Pb, PSub, RaceResult, RoomPlayer } from './racecommon';

export type Kind = 'exit' | 'bench' | 'fight' | 'ph2' | 'ph3' | 'kill';
export const SUB_NAME: Record<string, string> = { exit: 'выход из коридора', bench: 'скамья', fight: 'начало боя', ph2: 'фаза 2', ph3: 'фаза 3', kill: 'смерть босса' };
/** босс в творительном падеже («бой с Владиком») */
export const BOSS_WITH = ['Корнематкой', 'Мишей', 'Владиком', 'Тимой'];
export const BOSS_NOM = ['Корнематка', 'Миша', 'Владик', 'Тима'];
const ROMAN = ['I', 'II', 'III', 'IV'];

export const isBoss = (disc: string): boolean => disc === 'boss';
export const isDuel = (disc: string): boolean => disc === 'duel';
/** подписи глав/боссов дисциплины для ленты и таблиц (у дуэли — имена боссов) */
export const tagsOf = (disc: string): readonly string[] => (isBoss(disc) || isDuel(disc) ? SR_CATS.boss.tags : SR_CATS.trail.tags);
/** виды подсплитов, которые есть в дисциплине (в босс-раше нет коридора и скамьи), в порядке прохождения */
export const kindsOf = (disc: string): Kind[] => (isBoss(disc) || isDuel(disc) ? ['fight', 'ph2', 'ph3', 'kill'] : ['exit', 'bench', 'fight', 'ph2', 'ph3', 'kill']);
/** ключи, по которым считается отрыв: скамья необязательна, поэтому в сравнении гонки не участвует */
const leadKinds = (disc: string): Kind[] => kindsOf(disc).filter((k) => k !== 'bench');
export const subKey = (ch: number, k: string): string => `${ch}:${k}`;
/** «Гл. II · начало боя» / «Миша · фаза 2» */
export const subLabel = (disc: string, ch: number, k: string): string => `${tagsOf(disc)[ch - 1] ?? 'Гл. ' + ch} · ${SUB_NAME[k] ?? k}`;

/** время подсплита игрока: для смерти босса — сплит главы (он главнее) */
export function timeOf(p: { subs?: PSub[]; splits?: number[] } | undefined, ch: number, k: string): number | null {
  if (!p) return null;
  if (k === 'kill' && p.splits && p.splits[ch - 1] != null) return p.splits[ch - 1]!;
  const s = (p.subs || []).find((x) => x.ch === ch && x.k === k);
  return s ? s.rta : null;
}

// ----- личный рекорд по архиву -----
/** лучший финиш игрока в дисциплине и лучшие отрезки; null — игрок ещё не финишировал в этой дисциплине */
export function personalBest(arch: readonly RaceResult[], name: string, disc: string): Pb | null {
  const k = nkey(name); let best: { t: number; sp: number[]; sb: Record<string, number> } | null = null;
  const bs: (number | null)[] = [null, null, null, null];
  for (const r of arch) {
    if (r.discipline !== disc) continue;
    const row = r.players.find((p) => nkey(p.name) === k); if (!row || row.dnf || row.time == null) continue;
    const sp = row.splits || [];
    if (sp.length === 4) for (let i = 0; i < 4; i++) { const seg = sp[i]! - (i ? sp[i - 1]! : 0); if (seg > 0 && (bs[i] == null || seg < bs[i]!)) bs[i] = seg; }
    if (!best || row.time < best.t) {
      const sb: Record<string, number> = {};
      for (const s of row.subs || []) sb[subKey(s.ch, s.k)] = s.rta;
      sp.forEach((x, i) => { sb[subKey(i + 1, 'kill')] = x; });
      best = { t: row.time, sp: sp.slice(), sb };
    }
  }
  return best ? { ...best, bs } : null;
}
/** сумма лучших отрезков (теоретический рекорд); null, если какого-то отрезка ещё не было */
export function sumOfBest(pb: Pb | null | undefined): number | null {
  if (!pb || pb.bs.length !== 4 || pb.bs.some((x) => x == null)) return null;
  return pb.bs.reduce<number>((a, x) => a + x!, 0);
}
/** сумма лучших отрезков с учётом текущего забега: уже пройденные отрезки берутся лучшие из рекорда и этого забега */
export function sumOfBestNow(pb: Pb | null | undefined, splits: readonly number[]): number | null {
  const bs = (pb?.bs ?? [null, null, null, null]).slice();
  splits.forEach((x, i) => { if (x == null || i > 3) return; const seg = x - (i ? splits[i - 1] ?? 0 : 0); if (seg > 0 && (bs[i] == null || seg < bs[i]!)) bs[i] = seg; });
  return bs.some((x) => x == null) ? null : bs.reduce<number>((a, x) => a + x!, 0);
}

// ----- положение на ленте кампании -----
const FRAC_TRAIL: Record<string, number> = { exit: 0.34, fight: 0.5, ph2: 0.68, ph3: 0.84, kill: 1 };
const FRAC_BOSS: Record<string, number> = { fight: 0.15, ph2: 0.5, ph3: 0.78, kill: 1 };
/** положение игрока на ленте I–IV: 0..1 (по подсплитам текущей главы; без подсплитов — небольшой шаг по этапу) */
export function ribbonPos(disc: string, p: { subs?: PSub[]; splits?: number[]; fin?: unknown } | undefined, t: Record<string, unknown> | undefined): number {
  if (!p) return 0;
  if (p.fin) return 1;
  const done = (p.splits || []).filter((x) => x != null).length, ch = Math.min(4, done + 1), F = isBoss(disc) ? FRAC_BOSS : FRAC_TRAIL;
  let f = 0;
  for (const s of p.subs || []) if (s.ch === ch && F[s.k] != null && F[s.k]! > f && s.k !== 'kill') f = F[s.k]!;
  if (!f && t) f = t['st'] === 'arena' ? (isBoss(disc) ? 0.05 : 0.34) : 0.08;
  return Math.min(1, (ch - 1 + Math.min(0.98, f)) / 4);
}

// ----- описание этапа -----
/** «Гл. III · бой с Владиком, фаза 2» / «Гл. II · коридор» / «Миша · в лавке» */
export function stageText(disc: string, t: Record<string, any> | undefined, subs: readonly PSub[] | undefined, fin: boolean): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (fin) return 'финиш';
  const bossy = isBoss(disc) || isDuel(disc);
  if (!t) return '';
  const ch = Math.max(1, Math.min(4, t['ch'] | 0 || 1)), tag = tagsOf(disc)[ch - 1] ?? '';
  const mine = (subs || []).filter((s) => s.ch === ch), has = (k: string): boolean => mine.some((s) => s.k === k);
  let where: string;
  if (t['sh']) where = 'в лавке';
  else if (t['sit']) where = 'на скамье';
  else if (has('kill')) where = 'босс побеждён';
  else if (has('fight')) where = `бой${bossy ? '' : ' с ' + BOSS_WITH[ch - 1]}${has('ph3') ? ', фаза 3' : has('ph2') ? ', фаза 2' : ''}`;
  else if (t['st'] === 'arena') where = bossy ? 'перед боем' : `перед боем с ${BOSS_WITH[ch - 1]}`;
  else where = bossy ? 'к арене' : ch === 1 ? 'путь к боссу' : 'коридор';
  return `${bossy ? tag : 'Гл. ' + ROMAN[ch - 1]} · ${where}`;
}

// ----- отрыв по подсплитам -----
/** порядок контрольных точек для отрыва: глава за главой, внутри главы — по порядку видов */
function order(disc: string): { ch: number; k: Kind }[] {
  const out: { ch: number; k: Kind }[] = [];
  for (let ch = 1; ch <= 4; ch++) for (const k of leadKinds(disc)) out.push({ ch, k });
  return out;
}
/** отрыв «я − соперник» в мс: плюс — соперник впереди. nowA / nowB — время забега каждого сейчас (null — неизвестно). Без общих точек — по сплитам глав */
export function leadBySubs(disc: string, a: { subs?: PSub[]; splits?: number[] }, b: { subs?: PSub[]; splits?: number[] }, nowA: number | null, nowB: number | null): number | null {
  return leadInfo(disc, a, b, nowA, nowB)?.ms ?? null;
}
export interface LeadInfo { ms: number; ch: number; k: Kind; /** common — разница на общей точке; a / b — точку прошёл только этот игрок */ kind: 'common' | 'a' | 'b' }
/** то же, что leadBySubs, но с точкой, по которой посчитан отрыв (для подписи «Гл. II · начало боя: Ива впереди») */
export function leadInfo(disc: string, a: { subs?: PSub[]; splits?: number[] }, b: { subs?: PSub[]; splits?: number[] }, nowA: number | null, nowB: number | null): LeadInfo | null {
  const pts = order(disc).map((o) => ({ ...o, a: timeOf(a, o.ch, o.k), b: timeOf(b, o.ch, o.k) }));
  let last = -1; pts.forEach((p, i) => { if (p.a != null && p.b != null) last = i; });
  const base: LeadInfo | null = last >= 0 ? { ms: pts[last]!.a! - pts[last]!.b!, ch: pts[last]!.ch, k: pts[last]!.k, kind: 'common' } : null;
  // следующая точка после общей, которую прошёл только один
  const nxt = pts.slice(last + 1).find((p) => (p.a != null) !== (p.b != null));
  if (nxt) {
    if (nxt.b != null && nxt.a == null) return nowA == null ? base : { ms: Math.max(0, nowA - nxt.b), ch: nxt.ch, k: nxt.k, kind: 'b' }; // соперник уже там, я ещё нет: он впереди минимум на столько
    if (nxt.a != null && nxt.b == null) return nowB == null ? base : { ms: Math.min(0, nxt.a - nowB), ch: nxt.ch, k: nxt.k, kind: 'a' };
  }
  return base;
}
/** разница коротко: «+4.2», «−1:05.3», «±0.0» (десятые доли секунды) */
export function dtxt(ms: number | null): string {
  if (ms == null) return '';
  const t = Math.floor(Math.abs(ms) / 100), m = Math.floor(t / 600), s = Math.floor(t / 10) % 60;
  if (t === 0) return '±0.0';
  return `${ms < 0 ? '−' : '+'}${m ? `${m}:${String(s).padStart(2, '0')}` : s}.${t % 10}`;
}
/** подпись отрыва для табличек: «+4.2 с» */
export const leadText = (ms: number): string => dtxt(ms) + ' с';

// ----- таблица сравнения -----
export interface CmpRow { key: string; ch: number; k: Kind; label: string; a: number | null; b: number | null; d: number | null; pa: number | null; pb: number | null }
/** строки таблицы «подсплит × игрок»: время, разница между игроками (a − b) и к личному рекорду каждого (время − рекорд) */
export function cmpRows(disc: string, a: RoomPlayer | undefined, b: RoomPlayer | undefined): CmpRow[] {
  const rows: CmpRow[] = [];
  for (let ch = 1; ch <= 4; ch++) for (const k of kindsOf(disc)) {
    const key = subKey(ch, k), ta = timeOf(a, ch, k), tb = timeOf(b, ch, k);
    const ra = a?.pb?.sb[key], rb = b?.pb?.sb[key];
    rows.push({ key, ch, k, label: k === 'kill' ? `${tagsOf(disc)[ch - 1]} · ${isBoss(disc) ? 'смерть босса' : 'босс повержен'}` : subLabel(disc, ch, k), a: ta, b: tb, d: ta != null && tb != null ? ta - tb : null,
      pa: ta != null && ra != null ? ta - ra : null, pb: tb != null && rb != null ? tb - rb : null });
  }
  return rows;
}

// ----- босс-раш: таблица «босс × игрок» -----
export interface BossCmp {
  ch: number; name: string; /** время боя: от смерти прошлого босса до смерти этого (RTA, мс) */ ta: number | null; tb: number | null; d: number | null;
  a: BossRow | null; b: BossRow | null; /** кто быстрее на этом боссе */ win: 'a' | 'b' | null; pa: number | null; pb: number | null;
}
/** время боя с боссом главы ch: разница двух соседних сплитов (первый босс — от старта) */
export function bossTime(p: { splits?: number[] } | undefined, ch: number): number | null {
  const s = p?.splits; if (!s || s[ch - 1] == null) return null;
  const prev = ch > 1 ? s[ch - 2] : 0; return prev == null ? null : s[ch - 1]! - prev;
}
/** строки таблицы «босс × игрок»: время, урон, отбивы, разница, победитель боя и разница к лучшему отрезку игрока */
export function bossRows(disc: string, a: RoomPlayer | undefined, b: RoomPlayer | undefined): BossCmp[] {
  const rows: BossCmp[] = [];
  for (let ch = 1; ch <= 4; ch++) {
    const ta = bossTime(a, ch), tb = bossTime(b, ch);
    const sega = a?.pb?.bs[ch - 1] ?? null, segb = b?.pb?.bs[ch - 1] ?? null;
    rows.push({ ch, name: tagsOf(disc)[ch - 1] ?? 'Босс ' + ch, ta, tb, d: ta != null && tb != null ? ta - tb : null, a: a?.bosses?.find((x) => x.ch === ch) ?? null, b: b?.bosses?.find((x) => x.ch === ch) ?? null,
      win: ta != null && tb != null && ta !== tb ? (ta < tb ? 'a' : 'b') : null, pa: ta != null && sega != null ? ta - sega : null, pb: tb != null && segb != null ? tb - segb : null });
  }
  return rows;
}
/** лучший босс игрока внутри раша: где его отрыв от соперника самый большой; null, если нигде не быстрее */
export function bestBoss(rows: readonly BossCmp[], who: 'a' | 'b'): number | null {
  let best: number | null = null, gap = 0;
  for (const r of rows) { if (r.d == null) continue; const g = who === 'a' ? -r.d : r.d; if (g > gap) { gap = g; best = r.ch; } }
  return best;
}
