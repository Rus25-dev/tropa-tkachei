// Один прогон фаззера: сессия ядра в выбранном режиме, случайный/полуслучайный ввод, действия интерфейса, «ходы продвижения»
// для цепочек глав и забегов, инварианты после каждого тика и сверка «журнал → воспроизведение» в конце.
import { freshCamp } from '../../src/core/campaign';
import { benchEntries } from '../../src/core/coop';
import { emptyButtons, edgesBetween, type Buttons, type InputFrame } from '../../src/core/input';
import { GOLDEN_EXT, hash2, outcome, type Journal } from '../../src/core/journal';
import { SHOP } from '../../src/core/balance';
import { makeFuzzerOf, makeWalker } from '../../src/core/fuzzinput';
import { mapCanOpen } from '../../src/core/maptravel';
import { mulberry32, rngSeedFor } from '../../src/core/rng';
import { SessionRecorder, type RecordedRun } from '../../src/core/recording';
import type { Progress } from '../../src/core/campaign';
import { RACE_EXT, replayJournal } from '../../src/core/replay';
import { Session, type SceneData, type SessionCfg } from '../../src/core/session';
import type { Inp } from '../../src/core/types';
import type { World } from '../../src/core/world';
import { Monitor, type Finding } from './invariants';
import { movedNow, scanJournal, errKey } from './scan';
import { campFor, type FuzzSpec } from './spec';

export const FUZZ_VER = 'fuzz';

export interface RunStats { ticks: number; scenes: number; uiActs: number; victories: number; wipes: number }
export interface FuzzResult {
  spec: FuzzSpec; finding: Finding | null; stats: RunStats;
  /** запись, в которой замечена находка (журнал и сохранение, из которого создана её сцена) */
  journal: Journal | null;
  progress: Progress | null;
}

const pick = <T>(R: () => number, a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
const toFrame = (inp: Inp, prev: Buttons): { f: InputFrame; b: Buttons } => {
  const b = { ...emptyButtons(), left: !!inp.left, right: !!inp.right, up: !!inp.up, down: !!inp.down, jump: !!inp.jump, atk: !!inp.atk, dash: !!inp.dash, heal: !!inp.heal, bomb: !!inp.bomb, tool: !!inp.tool };
  return { f: { buttons: b, edges: edgesBetween(prev, b) }, b };
};

/** Сессия под режим фаззера */
export function makeSession(spec: FuzzSpec, clock: { ms: number }): Session {
  const cfg: SessionCfg = { easy: spec.easy, loadoutSave: spec.loadout, progress: null, ver: FUZZ_VER, clock: () => clock.ms, fx: true };
  const { seed, players } = spec, m = spec.mode;
  let first: SceneData, run: { cat: 'trail' | 'boss' } | undefined;
  if (m === 'ch1' || m === 'korne' || m === 'chain') first = { seed, mode: 'story', players, camp: freshCamp() };
  else if (m.startsWith('road')) first = { seed, mode: 'story', players, camp: campFor(spec, +m.slice(4), 'road') };
  else if (m.startsWith('camp-arena')) first = { seed, mode: 'story', players, camp: campFor(spec, +m.slice(10), 'arena') };
  else if (m.startsWith('arena-')) first = { seed, mode: 'bosstest', boss: m.slice(6), players, camp: null };
  else if (m.startsWith('train-')) first = { seed, mode: 'bosstest', boss: m.slice(6), players, camp: null, train: true, trainPhase: 1 + (seed % 3) };
  else { first = { seed, mode: 'story', players: 1, camp: null }; run = { cat: m === 'sr-trail' ? 'trail' : 'boss' }; }
  return new Session(cfg, first, run);
}

/** цель по x для «ходока»: босс, выход или конец главы */
function goalX(w: World, i: number): number | null {
  void i;
  const b = w.testBoss();
  if (b && !['dead', 'gone'].includes(b.state)) return b.x + b.w / 2;
  if (w.L.boss && !w.bossDead && w.boss.state === 'sleep') return (w.L.boss.trigger + 2) * 32;
  if (w.exitR && w.bossDead) return w.exitR.x;
  if (w.L.exit && (w.camp?.st === 'road' || w.bossDead)) return w.L.exit.x * 32;
  return w.L.boss ? w.L.boss.x * 32 : null;
}

/** «Ход продвижения»: отладочное действие записи (ex 1/2/10), журналируется и повторяется при воспроизведении */
function cheat(ses: Session, id: number, x = 0, y = 0): void {
  ses.rec?.act('ex', id, x, y);
  const w = ses.world, f = GOLDEN_EXT[id] ?? RACE_EXT[id];
  f?.(w, x, y);
}

/** Герой — на выход этапа, на землю у выхода (ex 20): ex 2 из гонок ставит в воздух, над колючками главы I героя возвращает к безопасной точке */
function exitCheat(ses: Session): void {
  const e = ses.world.exitR;
  if (e) cheat(ses, 20, e.x + 4, e.y + e.h - 27);
}

export function runFuzz(spec: FuzzSpec, opt: { replayCheck?: boolean; trace?: number[]; snap?: (w: World) => string; snaps?: string[]; collect?: Journal[] } = {}): FuzzResult {
  const clock = { ms: 0 };
  const stats: RunStats = { ticks: 0, scenes: 1, uiActs: 0, victories: 0, wipes: 0 };
  const rotated: { run: RecordedRun; out: string }[] = [];
  const R = mulberry32(rngSeedFor(spec.seed, 'fuzz-driver'));
  let ses!: Session, rec!: SessionRecorder;
  const n = spec.players;
  const fail = (finding: Finding, run?: RecordedRun): FuzzResult => ({ spec, finding, stats, journal: run ? run.journal : rec?.journal ?? null, progress: run ? run.progress : rec?.progress ?? null });
  try {
    ses = makeSession(spec, clock);
    rec = new SessionRecorder(ses, { ver: FUZZ_VER, easy: spec.easy, onRotate: (run) => { rotated.push({ run, out: JSON.stringify(outcome(ses.world)) }); } });
  } catch (e) { return { spec, finding: { invariant: 'exception', message: 'создание сессии: ' + errKey(e), tick: 0 }, stats, journal: null, progress: null }; }

  let victory: { camp?: { next: unknown; final: boolean } } | null = null;
  (ses.on['victory'] ??= []).push((e) => { victory = e['s'] as typeof victory; stats.victories++; });
  (ses.on['wipe'] ??= []).push(() => { stats.wipes++; });
  const getW = (): World => ses.world;
  const rnd = makeFuzzerOf(getW, spec.seed, n), walk = makeWalker(getW, spec.seed, n, goalX);
  let useWalk = spec.policy === 'walker', switchAt = 0;
  const mon = new Monitor();
  const prev: Buttons[] = Array.from({ length: n }, () => emptyButtons());

  // автопродвижение: цепочки глав, забеги и часть одиночных боёв доходят до смерти босса, выхода и смены сцены
  const auto = spec.mode === 'chain' || spec.mode.startsWith('sr-') || spec.mode === 'korne' || R() < 0.4;
  let lastWorld: World | null = null, sceneTick = 0, stage: 'play' | 'fight' | 'dying' | 'leave' | 'done' = 'play', budget = 0, stageAt = 0, endAt = -1, winWait = -1;

  if (spec.mode === 'korne') cheat(ses, 10);
  const finish = (finding: Finding | null): FuzzResult => {
    stats.ticks = rec.ticks() + rotated.reduce((s, r) => s + r.run.journal.segs.reduce((a, g) => a + g.n, 0), 0);
    if (finding) return fail(finding);
    if (opt.replayCheck !== false && !spec.mode.startsWith('train-')) { // тренировка в журнал не пишется: режим не входит в формат
      // журнал → воспроизведение: то же состояние и ни одного нарушения инвариантов по пути
      const live = JSON.stringify(outcome(ses.world));
      const all: { run: RecordedRun; out: string }[] = [...rotated, { run: { journal: rec.journal, progress: rec.progress }, out: live }];
      if (opt.collect) for (const it of all) opt.collect.push(it.run.journal);
      for (const it of all) {
        const f = scanJournal(it.run.journal, { loadoutSave: spec.loadout, easy: spec.easy, ver: FUZZ_VER, progress: it.run.progress });
        if (f) return fail(f, it.run);
        const r = replayOutcome(it.run, spec);
        if (r !== it.out) return fail({ invariant: 'replay', message: 'исход воспроизведения журнала отличается от живого состояния: ' + diffKeys(it.out, r), tick: stats.ticks }, it.run);
      }
    }
    return { spec, finding: null, stats, journal: null, progress: null };
  };

  for (let t = 0; t < spec.ticks; t++) {
    const w = ses.world;
    if (w !== lastWorld) { lastWorld = w; sceneTick = 0; stage = 'play'; budget = 240 + Math.floor(R() * 1500); winWait = -1; victory = null; }
    sceneTick++;
    clock.ms = (t * 1000) / 60;

    // ----- интерфейс -----
    try {
      driveUi(ses, R, spec, stats);
      // экран победы: «Дальше» (кампания) или конец прогона
      if (w.won && victory && winWait < 0) winWait = 20 + Math.floor(R() * 180);
      if (winWait >= 0 && --winWait < 0 && victory) {
        const camp = (victory as { camp?: { next: unknown; final: boolean } }).camp;
        victory = null;
        if (camp && camp.next && !camp.final) ses.campGo(camp.next as never); else if (endAt < 0) endAt = t + 120;
      }
      // ----- ходы продвижения -----
      if (auto && !w.won && !w.paused && stage !== 'done') {
        if (stage === 'play' && sceneTick >= budget) {
          if (w.L.boss && w.camp?.st === 'level' && !w.bossDead && w.boss.state === 'sleep' && spec.mode !== 'ch1') { cheat(ses, 10); stage = 'fight'; budget = sceneTick + 200 + Math.floor(R() * 1200); }
          else if (w.camp?.st === 'road') { if (!w.players[0]!.downed && !w.wiping && w.exitR) { exitCheat(ses); stage = 'leave'; stageAt = sceneTick; } }
          else if (!w.bossDead && (w.testBoss() || w.L.boss)) { cheat(ses, 1); stage = 'dying'; stageAt = sceneTick; }
          else if (!w.players[0]!.downed && !w.wiping && w.exitR) { exitCheat(ses); stage = 'leave'; stageAt = sceneTick; }
        } else if (stage === 'fight' && sceneTick >= budget) { cheat(ses, 1); stage = 'dying'; stageAt = sceneTick; }
        else if (stage === 'dying' && w.bossDead && sceneTick >= stageAt + 90 && !w.players[0]!.downed && !w.wiping) { if (w.exitR) { exitCheat(ses); stage = 'leave'; stageAt = sceneTick; } else stage = 'done'; }
        else if (stage === 'dying' && sceneTick - stageAt > 3000 && !w.bossDead) {
          return finish({ invariant: 'transition', message: 'босс не умирает после последнего удара (3000 тиков)', tick: t });
        } else if (stage === 'leave' && !w.leaving && !w.won && sceneTick > stageAt && (sceneTick - stageAt) % 90 === 0 && sceneTick - stageAt <= 1350 && !w.players[0]!.downed && !w.wiping) {
          exitCheat(ses); // герой мог быть в хвате за уступ: хват возвращает его на место, поэтому перенос повторяется
        } else if (stage === 'leave' && sceneTick - stageAt > 1500 && !w.leaving && !w.won) {
          return finish({ invariant: 'transition', message: `выход не сработал за 1500 тиков (сцена ${w.camp ? w.camp.ch + '/' + w.camp.st : w.mode})`, tick: t });
        }
      }
    } catch (e) { return finish({ invariant: 'exception', message: 'интерфейс/ход: ' + errKey(e), tick: t }); }

    // ----- ввод -----
    if (spec.policy === 'mixed' && t >= switchAt) { useWalk = !useWalk; switchAt = t + 300 + Math.floor(R() * 600); }
    const pol = useWalk ? walk : rnd;
    const frames: InputFrame[] = [];
    for (let i = 0; i < n; i++) { const { f, b } = toFrame(pol(i), prev[i]!); frames.push(f); prev[i] = b; }
    try { ses.frame(1000 / 60, frames); } catch (e) { return finish({ invariant: 'exception', message: errKey(e), tick: t }); }
    ses.fxq.length = 0;
    if (opt.trace) opt.trace.push(hash2(ses.world));
    if (opt.snap) opt.snaps!.push(opt.snap(ses.world));
    const fnd = mon.check(ses.world, movedNow(ses.world));
    if (fnd) return finish(fnd);
    if (ses.world !== w) stats.scenes++;
    if (endAt >= 0 && t >= endAt) break;
    if (ses.sr?.done && endAt < 0) endAt = t + 60;
  }
  return finish(null);
}

/** исход воспроизведения журнала (для сверки с живым состоянием) */
function replayOutcome(run: RecordedRun, spec: FuzzSpec): string {
  const r = replayJournal(run.journal, { loadoutSave: spec.loadout, easy: spec.easy, ver: FUZZ_VER, progress: run.progress });
  return r.ok ? JSON.stringify(outcome(r.world)) : 'ошибка: ' + r.why;
}
/** какие ключи верхнего уровня исхода различаются (для сообщения) */
function diffKeys(a: string, b: string): string {
  try {
    const x = JSON.parse(a) as Record<string, unknown>, y = JSON.parse(b) as Record<string, unknown>;
    const ks = Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
    return ks.map((k) => `${k}: ${JSON.stringify(x[k])} ≠ ${JSON.stringify(y[k])}`).join('; ').slice(0, 400);
  } catch { return b.slice(0, 200); }
}

/** случайные действия интерфейса и «выход из меню» (без него скамья остановила бы мир навсегда) */
function driveUi(ses: Session, R: () => number, spec: FuzzSpec, stats: RunStats): void {
  const w = ses.world;
  const did = (): void => { stats.uiActs++; };
  if (w.benchMenuOpen) {
    if (R() < 0.04) {
      did();
      const r = R();
      if (r < 0.3) ses.benchClose();
      else { const e = benchEntries(w).filter((x) => x !== 'gear' || R() < 0.2); ses.benchPick(pick(R, e.length ? e : ['rest'])); }
    }
    return;
  }
  if (w.shopOpen) { if (R() < 0.05) { did(); if (R() < 0.5) ses.closeShop(); else ses.buy(pick(R, SHOP).id); } return; }
  if (w.mt.open) { if (R() < 0.05) { did(); const r = R(); if (r < 0.4) ses.mapClose(); else if (r < 0.7) ses.mapMove(R() < 0.5 ? -1 : 1); else ses.mapGo(); } return; }
  if (w.mt.busy) return;
  if (w.paused) { if (R() < 0.02) { did(); ses.togglePause(); } return; }
  if (!spec.ui || w.won || w.wiping || R() >= 1 / 500) return;
  did();
  const r = R();
  if (r < 0.35) ses.togglePause();
  else if (r < 0.55) { if (mapCanOpen(w)) ses.mapShow(); }
  else if (r < 0.7) {
    // отдых возможен только у скамьи: сначала переносим героя к ней (ex 20), как делают записи с лавкой и картой
    const bi = Math.floor(R() * w.benches.length), b = w.benches[bi];
    if (b) { const p = w.players[0]!; if (!p.downed && !w.wiping) { cheat(ses, 20, b.x - 7, b.y - 26); ses.benchRest(0, bi, R() < 0.5); } }
  }
  else if (r < 0.85) { ses.openShop(Math.floor(R() * w.nPlayers)); }
  else if (r < 0.93) ses.retry();
  else if (ses.sr) { ses.techPause(true); ses.techPause(false); }
}
