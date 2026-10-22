// Спидран: забег живёт дольше одной сцены (главы), считает IGT в тиках, сплиты на смерти боссов (legacy/src/speedrun.js).
// Здесь — детерминированная часть, нужная ядру. Часы реального времени (RTA) приходят снаружи: sr.clock(); хранилище рекордов,
// код результата, табличка соперника и сеть — в слоях выше (session/net).
import type { World } from './world';
import { freshCamp, freshUp, go, snap, type CampState } from './campaign';
import { statSub, statTick, type StatsData } from './racestats';
import type { DuelRun } from './duelmods';

export interface Split { rta: number; igt: number }
/** итог дуэльного раунда: убит ли босс, сколько здоровья у него осталось (hp из mh) и сколько урона нанесено */
export interface DuelOutcome { kill: boolean; ch: number; hp: number; mh: number; dmg: number }
export interface SrResult { cat: string; ver: string; rta: number; igt: number; deaths: number; splits: Split[]; taint: string | null; newPb: boolean; pbPrev: unknown; duel?: DuelOutcome }
export interface SrRun {
  cat: 'trail' | 'boss';
  t0: number | null; end: number | null; igt: number; splits: Split[]; deaths: number; done: boolean; taint: string | null;
  /** до сигнала «пошёл» герой стоит (гонка) */
  hold: boolean;
  race: unknown; rc: unknown; result: SrResult | null; restored: number; downMs: number;
  stats?: StatsData;
  pausedMs?: number; tp?: number | null;
  ver: string;
  /** настенные часы в мс (внешние: ядру Date/performance запрещены) */
  clock: () => number;
  /** воспроизведение журнала: сплиты берутся из записи, а не из часов воспроизведения */
  replay: { splits: (Split | null | undefined)[]; mem: boolean } | null;
  /** дуэльный раунд (2.4): один босс и модификаторы; null — обычный забег */
  duel: DuelRun | null;
}

export interface RunOpts { seed?: number; rc?: unknown; race?: unknown; ver?: string; clock?: () => number }
/** дуэль лежит внутри сведений о комнате (rc.duel): так она попадает в журнал и поднимается при восстановлении забега */
export function duelOf(rc: unknown): DuelRun | null {
  const d = (rc as { duel?: DuelRun } | null | undefined)?.duel;
  return d && d.ch >= 1 && d.ch <= 4 && Array.isArray(d.mods) ? { ch: d.ch | 0, mods: d.mods.slice() } : null;
}
export function newRun(cat: 'trail' | 'boss', opt: RunOpts = {}): SrRun {
  return { cat, t0: null, end: null, igt: 0, splits: [], deaths: 0, done: false, taint: null, hold: !!opt.race || !!opt.rc, race: opt.race ?? null, rc: opt.rc ?? null, result: null, restored: 0, downMs: 0,
    ver: opt.ver ?? '', clock: opt.clock ?? (() => 0), replay: null, duel: cat === 'boss' ? duelOf(opt.rc) : null };
}
/** данные первой сцены забега; босс-раш и дуэль — сразу арена босса главы (дуэль: нужной, иначе первой) */
export function runStartData(cat: 'trail' | 'boss', seed: number, duel?: DuelRun | null): { players: 1; mode: 'story'; camp: CampState; seed: number } {
  const camp: CampState = cat === 'boss' ? { ch: duel ? duel.ch : 1, st: 'arena', beads: 0, abil: { double: true }, up: freshUp(), time: 0, deaths: 0 } : freshCamp();
  return { players: 1, mode: 'story', camp, seed: seed >>> 0 };
}

/** RTA без технической паузы организатора (в гонке): r.pausedMs — завершённые паузы, r.tp — начало текущей */
export function rta(r: SrRun): number {
  if (r.t0 == null) return 0;
  const now = r.end != null ? r.end : r.clock();
  return now - r.t0 - (r.pausedMs || 0) - (r.tp != null ? now - r.tp : 0);
}
function start(sc: World, r: SrRun): void {
  if (r.t0 != null) return;
  r.t0 = r.clock(); r.igt = 0;
  sc.emit('srStart');
}
/** каждый тик (GameScene.tick → Speedrun.onTick): IGT в тиках логики, одинаков при записи и при воспроизведении журнала */
export function srOnTick(sc: World): void {
  const r = sc.sr; if (!r || r.hold) return;
  if (r.t0 == null && !r.race && !r.rc) { // одиночный забег стартует с первого движения; в гонке время пускает общий сигнал
    const raw = sc.players[0] && sc.players[0].raw;
    if (raw && (raw.left || raw.right || raw.up || raw.down || raw.jump || raw.atk || raw.dash || raw.heal || raw.bomb)) start(sc, r);
  }
  if (r.t0 != null && !r.done && !sc.paused && !sc.shopOpen) r.igt += 1000 / 60;
  // статистика забега (race-stats.js)
  if (r.t0 != null && !r.done) statTick(sc);
}
/** сплит на смерти босса текущей главы; последняя глава завершает забег */
export function srOnSplit(sc: World): void {
  const r = sc.sr; if (!r || r.done || r.t0 == null) return;
  const i = r.duel ? 0 : Math.max(0, (sc.camp ? sc.camp.ch : 1) - 1); // в дуэли один сплит: смерть босса раунда
  if (r.splits.length > i) return;
  if (r.replay && r.replay.splits[i]) { r.splits[i] = { ...r.replay.splits[i]! }; statSub(sc, 'kill'); if ((i >= 3 || r.duel)) srFinish(sc); return; } // при воспроизведении берём записанное
  r.splits[i] = { rta: rta(r), igt: Math.round(r.igt) };
  statSub(sc, 'kill');
  sc.emit('srSplit', { i, split: { ...r.splits[i]! } });
  if (i >= 3 || r.duel) srFinish(sc);
}
/** здоровье босса сейчас и нанесённый ему урон: итог дуэльного раунда (hp из mh) */
function duelOutcome(sc: World, kill: boolean): DuelOutcome {
  const b = sc.testBoss(), mh = b && b.maxHp ? b.maxHp : 1, hp = kill ? 0 : Math.max(0, Math.min(mh, b ? b.hp : mh));
  return { kill, ch: sc.camp ? sc.camp.ch : 1, hp: Math.round(hp * 100) / 100, mh, dmg: Math.round(((sc.sr?.stats?.bossDmg) ?? 0) * 10) / 10 };
}
export function srFinish(sc: World): void {
  const r = sc.sr!; r.done = true; r.end = r.clock();
  const t = rta(r); r.splits[r.splits.length - 1]!.rta = t;
  const res: SrResult = { cat: r.cat, ver: r.ver, rta: t, igt: Math.round(r.igt), deaths: r.deaths, splits: r.splits.map((s) => ({ ...s })), taint: r.taint, newPb: false, pbPrev: null };
  if (r.duel) res.duel = duelOutcome(sc, true);
  r.result = res;
  sc.emit('srFinish', { result: res });
  sc.snd('win');
}
/** дуэль: нить оборвалась — раунд героя закончен поражением (босс остаётся с тем здоровьем, что есть); вне дуэли и до «пошёл» ничего не делает */
export function srDuelDefeat(sc: World): void {
  const r = sc.sr; if (!r || !r.duel || r.done || r.hold || r.t0 == null) return;
  r.done = true; r.end = r.clock();
  const res: SrResult = { cat: r.cat, ver: r.ver, rta: rta(r), igt: Math.round(r.igt), deaths: r.deaths, splits: [], taint: r.taint, newPb: false, pbPrev: null, duel: duelOutcome(sc, false) };
  r.result = res;
  sc.emit('srFinish', { result: res });
}
/** переход в следующую главу/к следующему боссу без экрана победы */
export function srAdvance(sc: World): void {
  const r = sc.sr!, c = sc.camp!, sn = snap(sc);
  sc.won = true; sc.snd('win');
  const next: CampState = r.cat === 'boss' ? { ...sn, ch: c.ch + 1, st: 'arena', beads: 0, abil: { double: true }, up: freshUp() } : { ...sn, ch: c.ch + 1, st: 'road' };
  go(sc, next);
}
/** техническая пауза гонки (команда организатора): мир стоит, время не идёт; replay — воспроизведение журнала (паузы считаются по настенному времени из журнала) */
export function srTechPause(sc: World, on: boolean, replay?: boolean): void {
  const r = sc.sr; if (!r) return;
  if (on) { if (r.tp != null) return; r.tp = r.clock(); sc.paused = true; }
  else { if (r.tp == null) return; if (!replay) r.pausedMs = (r.pausedMs || 0) + (r.clock() - r.tp); r.tp = null; sc.paused = false; }
  if (!replay) sc.emit('srTechPause', { on });
}
/** «пошёл» в гонке: герой отпущен, IGT с нуля; воспроизведение авторитетно — «go» из журнала всегда обнуляет IGT */
export function srRelease(sc: World, replay?: boolean): void {
  const r = sc.sr; if (!r) return;
  if (!r.hold) { if (replay) r.igt = 0; return; }
  r.hold = false; r.t0 = r.clock(); r.igt = 0;
  sc.snd('revive');
  if (!replay) sc.emit('srRelease');
}
