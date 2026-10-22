// Запись золотых записей v2 (tests/golden/v2/*.json) на ядре в чистом Node: бой ботом с боссами глав, Босс-раш, глава I, вдвоём и фаззинг ввода (гонка race-b1 — tools/golden/race.ts).
//   npm run golden:record                  записать всё
//   npm run golden:record -- boss-misha2-win coop-two-bots     только названные
// Победы пишет «безупречный» пилот (tools/bot/nohit.ts: решает, как убить босса без единого удара), поражения — слабый бот Brain (tools/bot/brain.ts).
// Запись = ввод по тикам (журнал), зерно и ожидаемый исход; tests/unit/golden.test.ts воспроизводит её и сверяет исход и контрольные хэши.
// В отличие от записей v1.8 (tests/golden/*.json, их воспроизводят и старая игра, и ядро v2) эти записаны уже на ядре v2 с боссами на данных:
// они защищают от случайных изменений поведения ядра, но не доказывают совпадение со старой игрой. Перезаписывать осознанно, когда меняется бой.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { edgesBetween, emptyButtons, type Buttons, type InputFrame } from '../../src/core/input';
import { GOLDEN_EXT, outcome, type Journal } from '../../src/core/journal';
import { makeFuzzerOf } from '../../src/core/fuzzinput';
import { normalizeSave, type LoadoutSave } from '../../src/core/loadout';
import { SessionRecorder } from '../../src/core/recording';
import { replayJournal } from '../../src/core/replay';
import { Recorder, Session, type SceneData } from '../../src/core/session';
import type { Inp } from '../../src/core/types';
import type { World } from '../../src/core/world';
import { dstate } from '../../src/core/boss/exec';
import { Brain } from '../bot/brain';
import { NoHitPilot } from '../bot/nohit';
import { Runner } from './runner';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../tests/golden/v2');
const VER = 'golden-v2';
const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);

interface Scn {
  name: string; kind: 'boss' | 'rush' | 'chapter1' | 'fuzz'; boss?: string; players?: number; expect: 'win' | 'lose' | 'fuzz'; skill?: number; seeds: number[]; max: number;
  loadout?: unknown;
}
const CHAPTER = ['penitent', 'misha2', 'vladik2', 'tima2'] as const;
const SCENARIOS: Scn[] = [];
CHAPTER.forEach((b, i) => {
  SCENARIOS.push({ name: `boss-${b}-win`, kind: 'boss', boss: b, expect: 'win', skill: 0.95, seeds: range(1 + i * 10, 11 + i * 10), max: 16000 });
  SCENARIOS.push({ name: `boss-${b}-lose`, kind: 'boss', boss: b, expect: 'lose', skill: 0.2, seeds: [21 + i, 22 + i, 23 + i, 24 + i], max: 14000 });
});
SCENARIOS.push({ name: 'coop-two-bots', kind: 'boss', boss: 'vladik2', players: 2, expect: 'win', skill: 0.9, seeds: range(500, 510), max: 16000 });
SCENARIOS.push({ name: 'speedrun-boss-rush', kind: 'rush', expect: 'win', skill: 0.95, seeds: range(600, 610), max: 70000 });
SCENARIOS.push({ name: 'chapter1-full', kind: 'chapter1', expect: 'win', skill: 0.95, seeds: range(400, 410), max: 60000 });

// Фаззинг ввода (как fuzz-* v1.8): у каждой записи своё снаряжение, исход не важен — запись фиксирует, что сделало ядро.
const WEAPONS_ALL = ['needle', 'twin', 'sickle', 'mace', 'lance'], TOOLS_ALL = ['throwneedle', 'trap', 'threadbomb', 'hook'];
const CHARMS_ALL = ['sting', 'ember', 'heart', 'swift', 'stride', 'window', 'thorns', 'call', 'hunter'];
const loadoutFor = (k: number): unknown => ({ weapon: WEAPONS_ALL[k % 5], tool: TOOLS_ALL[k % 4], charms: [CHARMS_ALL[k % 9], CHARMS_ALL[(k * 2 + 3) % 9]].filter((c, i, a) => a.indexOf(c) === i && c !== 'heart'), have: { weapons: WEAPONS_ALL, tools: TOOLS_ALL, charms: CHARMS_ALL } });
let fi = 0;
for (const b of CHAPTER) for (let w = 0; w < 5; w++) { fi++; SCENARIOS.push({ name: `fuzz-${b}-${w}`, kind: 'fuzz', boss: b, expect: 'fuzz', seeds: [7000 + fi], max: 3200, loadout: loadoutFor(w + fi) }); }
for (const b of ['vladik2', 'tima2']) { fi++; SCENARIOS.push({ name: `fuzz-coop-${b}`, kind: 'fuzz', boss: b, players: 2, expect: 'fuzz', seeds: [7200 + fi], max: 3200, loadout: loadoutFor(fi) }); }
for (const b of ['tima2', 'penitent']) { fi++; SCENARIOS.push({ name: `fuzz-heart-${b}`, kind: 'fuzz', boss: b, expect: 'fuzz', seeds: [7300 + fi], max: 3200, loadout: { weapon: 'mace', tool: 'hook', charms: ['heart', 'swift'], have: { weapons: WEAPONS_ALL, tools: TOOLS_ALL, charms: CHARMS_ALL } } }); }

// ----- общее -----
const toFrame = (inp: Inp, prev: Buttons): { f: InputFrame; b: Buttons } => {
  const b = { ...emptyButtons(), left: !!inp.left, right: !!inp.right, up: !!inp.up, down: !!inp.down, jump: !!inp.jump, atk: !!inp.atk, dash: !!inp.dash, heal: !!inp.heal, bomb: !!inp.bomb, tool: !!inp.tool };
  return { f: { buttons: b, edges: edgesBetween(prev, b) }, b };
};
class Driver {
  prev: Buttons[]; clock = { ms: 0 };
  ses: Session;
  constructor(first: SceneData, loadout: LoadoutSave, run?: ConstructorParameters<typeof Session>[2]) {
    this.ses = new Session({ easy: false, loadoutSave: loadout, progress: null, ver: VER, clock: () => this.clock.ms, fx: false }, first, run);
    this.prev = this.ses.world.players.map(() => emptyButtons());
  }
  get w(): World { return this.ses.world; }
  tick(inps: Inp[]): void {
    const frames: InputFrame[] = [];
    for (let i = 0; i < this.prev.length; i++) { const { f, b } = toFrame(inps[i] ?? {}, this.prev[i]!); frames.push(f); this.prev[i] = b; }
    this.clock.ms += 1000 / 60;
    this.ses.frame(1000 / 60, frames);
  }
  /** журналируемое отладочное действие (ex id x y): пишется в журнал и выполняется */
  ex(id: number, x = 0, y = 0): void { this.ses.rec?.act('ex', id, x, y); GOLDEN_EXT[id]?.(this.w, x, y); }
}
/** Кто ведёт героев: победа — пилот без урона (герой 1) и бот средней руки (герой 2); поражение и прочее — бот Brain с заданным мастерством. Вступление босса герои стоят. */
class Pilots {
  private pilot: NoHitPilot | null = null; private brains: Brain[] = []; private world: World | null = null;
  constructor(private skill: number, private flawless: boolean, private seed: number) {}
  act(w: World, frame: number): Inp[] {
    if (w !== this.world) {
      this.world = w; this.pilot = this.flawless ? new NoHitPilot() : null;
      this.brains = w.players.map((_, i) => new Brain(w, i, this.flawless ? 0.5 : this.skill, this.seed * 31 + i * 7 + 1));
    }
    const idle = w.bosses.some((q) => dstate(q).mode === 'intro') || (w.bosses.length > 0 && w.bosses.every((q) => q.state === 'dead')); // вступление и после смерти босса герои стоят
    return w.players.map((_, i) => (idle ? {} : i === 0 && this.pilot ? this.pilot.frame(w) : this.brains[i]!.act(frame)));
  }
}
const plain = (o: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
interface Rec { journal: Journal; expect: Record<string, unknown>; result: 'win' | 'lose' | 'fuzz'; frames: number }

// ----- сценарии -----
function recBoss(s: Scn, seed: number): Rec | string {
  const loadout = normalizeSave(null), np = s.players ?? 1;
  const d = new Driver({ seed, mode: 'bosstest', boss: s.boss, players: np, camp: null }, loadout);
  const sr = new SessionRecorder(d.ses, { ver: VER, easy: false });
  const pilots = new Pilots(s.skill ?? 0.9, s.expect === 'win', seed);
  let tail = -1, result: Rec['result'] | null = null, deadAt = -1, frame = 0;
  for (; frame < s.max; frame++) {
    d.tick(pilots.act(d.w, frame));
    const b = d.w.testBoss();
    if (tail < 0) {
      if (deadAt < 0 && b && b.state === 'dead') deadAt = frame;
      if (d.w.won || (deadAt >= 0 && frame - deadAt > 400)) { tail = 40; result = 'win'; }
      else if (d.w.wiping && deadAt < 0) { tail = 140; result = 'lose'; }
    } else if (--tail <= 0) break;
  }
  if (!result) return `не закончилось за ${s.max} кадров (hp босса ${d.w.testBoss()?.hp})`;
  return { journal: sr.journal, expect: plain(outcome(d.w)), result, frames: frame };
}

function recFuzz(s: Scn, seed: number): Rec | string {
  const loadout = normalizeSave(s.loadout), np = s.players ?? 1;
  const d = new Driver({ seed, mode: 'bosstest', boss: s.boss, players: np, camp: null }, loadout);
  const sr = new SessionRecorder(d.ses, { ver: VER, easy: false });
  const fz = makeFuzzerOf(() => d.ses.world, seed, np);
  for (let t = 0; t < s.max; t++) d.tick(d.w.players.map((p) => fz(p.i)));
  return { journal: sr.journal, expect: plain(outcome(d.w)), result: 'fuzz', frames: s.max };
}

function recRush(s: Scn, seed: number): Rec | string {
  const d = new Driver({ seed, mode: 'story', players: 1, camp: null }, normalizeSave(null), { cat: 'boss' });
  const pilots = new Pilots(s.skill ?? 0.9, true, seed);
  let tail = -1, frame = 0;
  for (; frame < s.max; frame++) {
    d.tick(pilots.act(d.w, frame));
    const r = d.ses.sr;
    if (process.env['GOLDEN_DEBUG'] && frame % 500 === 0) console.log('  rush', frame, 'tickN', d.w.tickN, 'igt', Math.round(r!.igt), 'boss', d.w.testBoss()?.state, d.w.camp?.ch);
    if (tail < 0) { if (r && r.done) tail = 60; } else if (--tail <= 0) break;
  }
  const r = d.ses.sr;
  if (!r || !r.done) return `забег не закончился за ${s.max} кадров (сплитов ${r?.splits.length})`;
  return { journal: d.ses.rec!.J, expect: plain(outcome(d.w)), result: 'win', frames: frame };
}

function recChapter1(s: Scn, seed: number): Rec | string {
  const d = new Driver({ seed, mode: 'story', players: 1, camp: null }, normalizeSave(null));
  d.ses.rec = Recorder.start({ cat: null, seed, ver: VER, mem: true }); d.ses.rec.begin(d.w);
  for (let i = 0; i < 30; i++) d.tick([{}]); // пара десятков тиков тишины после появления сцены, как в живой игре
  d.ex(11); // двойной прыжок (как подобранный предмет)
  const lvl = d.w;
  const runner = new Runner(lvl, { x: lvl.L.boss!.trigger + 2, y: lvl.L.boss!.y }, { stuck: 300 });
  const pilots = new Pilots(s.skill ?? 0.9, true, seed);
  let arena: World | null = null, tail = -1, frame = 0, arenaAt = 0;
  for (; frame < s.max; frame++) {
    if (d.w === lvl) d.tick([runner.act(frame, (id, x, y) => d.ex(id, x, y))]);
    else {
      if (d.w !== arena) { arena = d.w; arenaAt = frame; }
      d.tick(pilots.act(d.w, frame));
      if (frame - arenaAt > 12000) return 'бой слишком долгий';
    }
    if (tail < 0) { if (d.w !== lvl && d.w.won) tail = 60; } else if (--tail <= 0) break; // победа — в арене (won в уровне ставит переход к арене)
  }
  if (d.w === lvl || !d.w.won) return `глава не закончилась за ${s.max} кадров (тик ${d.w.tickN}, пауза ${d.w.paused}, hold ${d.ses.sr?.hold}, intro ${d.w.testBoss() ? dstate(d.w.testBoss()!).f : '-'}, сцена ${d.w.camp?.ch}/${d.w.camp?.st}, босс ${d.w.testBoss()?.state}/${d.w.testBoss()?.hp}, герой hp ${d.w.players[0]!.hp} смертей ${d.w.deaths}, x=${Math.round(d.w.players[0]!.x)}, переносов ${runner.tele}, звено ${runner.k}/${runner.path.length})`;
  if (d.w.camp?.st !== 'arena' || d.w.camp.ch !== 1) return 'победа не в арене главы I';
  return { journal: d.ses.rec.J, expect: plain(outcome(d.w)), result: 'win', frames: frame };
}

const REC = { boss: recBoss, fuzz: recFuzz, rush: recRush, chapter1: recChapter1 } as const;

// ----- запуск -----
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const s of SCENARIOS) {
  if (only.length && !only.includes(s.name)) continue;
  let done: Rec | null = null, why = '';
  for (const seed of s.seeds) {
    let r: Rec | string;
    try { r = REC[s.kind](s, seed); } catch (e) { r = 'ошибка: ' + String((e as Error).stack ?? e).slice(0, 400); }
    if (typeof r === 'string') { why = `seed ${seed}: ${r}`; if (process.env['GOLDEN_DEBUG']) console.log('  · ' + why); continue; }
    if (r.result !== s.expect) { why = `seed ${seed}: итог ${r.result}, нужен ${s.expect}`; continue; }
    // запись обязана воспроизводиться: живой ход и воспроизведение журнала приходят в один и тот же исход
    const rp = replayJournal(r.journal, { loadoutSave: normalizeSave(s.loadout) });
    if (!rp.ok) { why = `seed ${seed}: журнал не воспроизводится: ${rp.why}`; continue; }
    if (JSON.stringify(plain(outcome(rp.world))) !== JSON.stringify(r.expect)) { why = `seed ${seed}: воспроизведение разошлось с живым ходом`; continue; }
    done = r; (done as Rec & { seed: number }).seed = seed; break;
  }
  if (!done) { console.log(`НЕТ    ${s.name}: ${why}`); failed++; continue; }
  const seed = (done as Rec & { seed: number }).seed;
  const body = { name: s.name, kind: s.kind, version: VER, seed, expect: done.expect, ...(s.loadout ? { loadout: s.loadout } : {}), journal: done.journal };
  writeFileSync(join(OUT, s.name + '.json'), JSON.stringify(body));
  console.log(`записано ${s.name} (seed ${seed}, кадров ${done.frames}, тиков ${done.journal.segs.reduce((a, g) => a + g.n, 0)})`);
}
if (failed) process.exitCode = 1;
