// «Дуэль ткачей»: чистые функции для табло, панелей и графика погони — без DOM, сети и часов (проверяются в Node).
// Данные берутся из снимка комнаты (RoomState.duel, RoomPlayer.subs, график погони RaceWatch.chase); ничего не пишут.
import { BOSS_INFO, type DuelBoss, type RoundWhy, type Series, type Side } from '../core/duel';
import { MOD_INFO, type DuelMod } from '../core/duelmods';
import type { PSub, RoomPlayer } from './racecommon';

/** точка графика: [мс забега, доля снятого здоровья босса ×1000] */
export type ChasePt = [number, number];

/** доля снятого здоровья босса в момент t (мс забега), 0..1; до первой точки — 0; после последней — последнее значение */
export function fracAt(pts: readonly ChasePt[] | undefined, t: number): number {
  if (!pts || !pts.length) return 0;
  if (t <= pts[0]![0]) return pts[0]![1] / 1000;
  let lo = 0, hi = pts.length - 1;
  if (t >= pts[hi]![0]) return pts[hi]![1] / 1000;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m]![0] <= t) lo = m; else hi = m; }
  const p = pts[lo]!, q = pts[hi]!, k = q[0] === p[0] ? 0 : (t - p[0]) / (q[0] - p[0]);
  return (p[1] + (q[1] - p[1]) * k) / 1000;
}
/** на сколько процентных пунктов первый игрок снял больше здоровья босса, чем второй, к моменту t (минус — второй впереди) */
export function chaseLead(a: readonly ChasePt[] | undefined, b: readonly ChasePt[] | undefined, t: number): number {
  return Math.round((fracAt(a, t) - fracAt(b, t)) * 1000) / 10;
}
/** последнее время, до которого есть данные хотя бы у одного игрока (мс забега) */
export function chaseEnd(a: readonly ChasePt[] | undefined, b: readonly ChasePt[] | undefined): number {
  return Math.max(a && a.length ? a[a.length - 1]![0] : 0, b && b.length ? b[b.length - 1]![0] : 0);
}
/** облегчённый ряд для рисования: не больше n точек, первая и последняя сохраняются */
export function thin(pts: readonly ChasePt[] | undefined, n: number): ChasePt[] {
  if (!pts || pts.length <= n) return (pts ?? []).slice();
  const out: ChasePt[] = [], step = (pts.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(pts[Math.round(i * step)]!);
  return out;
}

export type PhaseKind = 'fight' | 'ph2' | 'ph3' | 'kill';
export const PHASE_NAME: Record<PhaseKind, string> = { fight: 'Начало боя', ph2: 'Фаза 2', ph3: 'Фаза 3', kill: 'Босс повержен' };
export interface PhaseRow { k: PhaseKind; label: string; a: number | null; b: number | null; /** a − b: минус — первый быстрее */ d: number | null }
const subAt = (subs: readonly PSub[] | undefined, ch: number, k: PhaseKind): number | null => (subs || []).find((s) => s.ch === ch && s.k === k)?.rta ?? null;
/** разница игроков к фазам босса раунда: когда каждый начал бой, дошёл до фаз 2 и 3 и добил босса */
export function phaseRows(a: RoomPlayer | undefined, b: RoomPlayer | undefined, ch: number): PhaseRow[] {
  return (['fight', 'ph2', 'ph3', 'kill'] as PhaseKind[]).map((k) => {
    const ta = subAt(a?.subs, ch, k), tb = subAt(b?.subs, ch, k);
    return { k, label: PHASE_NAME[k], a: ta, b: tb, d: ta != null && tb != null ? ta - tb : null };
  });
}
/** последняя общая фаза и разница на ней: «Фаза 2: Ива быстрее на 1.2 с» (для строки под графиком) */
export function lastPhaseDiff(rows: readonly PhaseRow[]): PhaseRow | null {
  let last: PhaseRow | null = null; for (const r of rows) if (r.d != null) last = r;
  return last;
}

// ----- подписи -----
export const bossName = (b: DuelBoss | undefined | null): string => (b ? BOSS_INFO[b].name : '—');
export const modName = (m: DuelMod): string => MOD_INFO[m].name;
export const modsLine = (mods: readonly DuelMod[]): string => (mods.length ? mods.map(modName).join(' · ') : 'без модификаторов');
export const WHY_TEXT: Record<RoundWhy, string> = { faster: 'быстрее убил босса', kill: 'убил босса', damage: 'снял больше здоровья босса', draw: 'ничья', coin: 'ничья, решил жребий', walkover: 'соперник сдался или присуждено' };

export interface VetoLine { n: number; kind: 'ban' | 'pick' | 'decider'; side: Side | null; boss: DuelBoss }
/** журнал бан/пика по порядку ходов, затем решающий босс */
export function vetoLines(s: Series): VetoLine[] {
  const out: VetoLine[] = s.log.map((x, i) => ({ n: i + 1, kind: x.kind, side: x.side, boss: x.boss }));
  if (s.stage !== 'veto' && s.decider) out.push({ n: out.length + 1, kind: 'decider', side: null, boss: s.decider });
  return out;
}

