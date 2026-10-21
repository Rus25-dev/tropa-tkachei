// Набор для проверки «Гонок Ткачей» в Node: хранилища в памяти, «игра» игрока-заглушка (забег без ядра) и сборка комнаты
// организатор + игроки + обсерверы на виртуальном времени и фальшивой сети.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { OrgStored, PlaySess, PlayStore, RaceResult, RaceStore } from '../../../src/net/racecommon';
import { RaceOrg } from '../../../src/net/raceorg';
import { RacePlay, type RunBridge } from '../../../src/net/raceplay';
import { RaceWatch } from '../../../src/net/racewatch';
import { FakeNet, Sim } from './fakenet';

export const VER = '2.0-test';
export class MemRaceStore implements RaceStore {
  org: string | null = null; arch: string = '[]';
  loadOrg(): OrgStored | null { return this.org ? (JSON.parse(this.org) as OrgStored) : null; }
  saveOrg(o: OrgStored): void { this.org = JSON.stringify(o); }
  clearOrg(): void { this.org = null; }
  archive(): RaceResult[] { return JSON.parse(this.arch) as RaceResult[]; }
  saveArchive(a: RaceResult[]): void { this.arch = JSON.stringify(a); }
}
export class MemPlayStore implements PlayStore {
  s: string | null = null;
  loadSess(): PlaySess | null { return this.s ? (JSON.parse(this.s) as PlaySess) : null; }
  saveSess(s: PlaySess): void { this.s = JSON.stringify(s); }
  clearSess(): void { this.s = null; }
}

interface FakeRun { id: string; seed: number; cat: string; held: boolean; t0: number | null; tp: number | null; paused: number; done: boolean; cd: string; splits: { rta: number; igt: number }[]; restored: boolean }
/** «игра» игрока: хранит только то, что нужно сетевому слою (держим героя, время, паузу) */
export class FakeGame implements RunBridge {
  run: FakeRun | null = null; journal: { ok: boolean; race: { code: string; id: string } | null } | null = null; note = ''; toasts: string[] = []; viol: string[] = []; log: string[] = []; autoLoad = true;
  play!: RacePlay;
  constructor(private sim: Sim) {}
  violation(): string[] { return this.viol; }
  hasRun(): boolean { return !!this.run; }
  runHeld(): boolean { return !!this.run?.held; }
  runDone(): boolean { return !!this.run?.done; }
  techOn(): boolean { return this.run?.tp != null; }
  runId(): string | null { return this.run?.id ?? null; }
  rta(): number { const r = this.run; if (!r || r.t0 == null) return 0; return this.sim.t - r.t0 - r.paused - (r.tp != null ? this.sim.t - r.tp : 0); }
  startRun(p: { id: string; seed: number; cat?: string }): void {
    this.run = { id: p.id, seed: p.seed, cat: p.cat ?? 'trail', held: true, t0: null, tp: null, paused: 0, done: false, cd: 'Загрузка…', splits: [], restored: false }; this.log.push('start');
    this.journal = { ok: true, race: { code: this.play.code, id: p.id } };
    if (this.autoLoad) this.sim.env().setTimeout(() => this.play.sceneReady(), 300);
  }
  countdown(t: string): void { if (this.run) this.run.cd = t; }
  release(el: number | null): void { const r = this.run!; r.held = false; r.t0 = this.sim.t - (el ?? 0); this.log.push('go'); }
  tech(on: boolean): void { const r = this.run!; if (on) r.tp = this.sim.t; else { r.paused += this.sim.t - r.tp!; r.tp = null; } }
  toLobby(note: string): void { this.run = null; this.note = note; }
  journalInfo(): { ok: boolean; race: { code: string; id: string } | null } | null { return this.journal; }
  clearJournal(): void { this.journal = null; }
  restore(cb: { onDone(): void; onFail(why: string): void }): boolean {
    const j = this.journal!; this.log.push('restore');
    this.run = { id: j.race!.id, seed: 0, cat: 'trail', held: true, t0: null, tp: null, paused: 0, done: false, cd: '', splits: [], restored: true };
    this.sim.env().setTimeout(() => { const r = this.run!; r.held = false; r.t0 = this.sim.t - 20000; cb.onDone(); }, 400);
    return true;
  }
  toast(m: string): void { this.toasts.push(m); }
  resultUpdate(): void { /* баннер строит интерфейс */ }
  // ----- «игра» -----
  split(i: number): void { const r = this.run!, sp = { rta: Math.round(this.rta()), igt: Math.round(this.rta()) }; r.splits[i] = sp; this.play.onSplit(i, sp); }
  finish(): void {
    const r = this.run!; r.done = true; const rta = Math.round(this.rta());
    const splits = [0, 1, 2, 3].map((i) => r.splits[i] ?? { rta: Math.round(rta * (i + 1) / 4), igt: Math.round(rta * (i + 1) / 4) }); splits[3] = { rta, igt: rta };
    this.play.onFinish({ rta, igt: rta, deaths: 1, splits }, { swings: 3, dps: 1.5, acc: 0.5 }, r.restored ? 1 : 0);
  }
}

export interface Room {
  sim: Sim; net: FakeNet; store: MemRaceStore; org: RaceOrg;
  player(name: string, node: string, key?: string): { play: RacePlay; game: FakeGame; store: MemPlayStore };
  watcher(node: string, key?: string): RaceWatch;
  newOrg(): RaceOrg;
}
export function mkRoom(opts: { lat?: number } = {}): Room {
  const sim = new Sim(), net = new FakeNet(sim, opts.lat ?? 30), store = new MemRaceStore();
  const newOrg = (): RaceOrg => new RaceOrg({ transport: net.transport('org'), env: sim.env(), version: VER, store, newSeed: () => 4242 });
  const room: Room = {
    sim, net, store, org: newOrg(), newOrg,
    player(name, node, key) {
      const game = new FakeGame(sim), pstore = new MemPlayStore();
      const play = new RacePlay({ transport: net.transport(node), env: sim.env(), version: VER, store: pstore, key: key ?? 'KEY-' + node, bridge: game });
      game.play = play; (play as any).__name = name;
      return { play, game, store: pstore };
    },
    watcher(node, key) { return new RaceWatch({ transport: net.transport(node), env: sim.env(), version: VER, key: key ?? 'WKEY-' + node }); },
  };
  return room;
}
