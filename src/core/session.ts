// Сессия игры: один «живой» забег поверх мира. Принимает кадры ввода, считает тики, пишет журнал ввода, меняет сцены (главы, боссы)
// и раздаёт события наружу (отрисовка, звук, сохранение). Не знает про Phaser и DOM; время — только то, что передали снаружи.
import { SHOP } from './balance';
import { benchClose, benchPick, type BenchEntry } from './coop';
import { benchRest } from './combat';
import { buy, openShop } from './campaign';
import { TickClock } from './clock';
import type { Inp, FxEvent } from './types';
import { CHK, enc, EBITS, BITS, hash1, hash2, type Act, type Journal, type JournalSeg, tickValue } from './journal';
import { mapClose, mapGo, mapMove, mapShow } from './maptravel';
import { newRun, runStartData, srRelease, srTechPause, type RunOpts, type SrRun } from './speedrun';
import { World, type WorldOpts } from './world';
import type { LoadoutSave } from './loadout';
import type { Progress } from './campaign';
import { BUTTONS, emptyFrame, type InputFrame } from './input';

/** Что сессия берёт из окружения (настройки и хранилище приходят снаружи) */
export interface SessionCfg {
  easy: boolean;
  loadoutSave: LoadoutSave;
  /** сохранение главы; обновляется по событию 'save' (его пишет хранилище) */
  progress: Progress | null;
  /** версия игры: попадает в журнал и результат забега */
  ver: string;
  /** настенные часы в мс (RTA) */
  clock: () => number;
  /** нужны ли мирам события для отрисовки */
  fx: boolean;
}
export type SceneData = Pick<WorldOpts, 'seed' | 'mode' | 'boss' | 'players' | 'camp'>;

/** Журнал забега: запись ввода по тикам и действий интерфейса (legacy/src/journal.js: rec, act, segBegin) */
export class Recorder {
  seg: JournalSeg | null = null;
  dirty = false;
  constructor(public J: Journal) {}
  static start(info: { cat: 'trail' | 'boss' | null; seed: number; ver: string; race?: unknown; mem?: boolean; easy?: boolean; speed?: number }): Recorder {
    return new Recorder({ v: 1, ...(info.mem ? { mem: true } : {}), ver: info.ver, cat: info.cat, race: info.race ?? null, seed: info.seed >>> 0, wall0: 0, wallT0: null, wallSave: 0, restored: 0, splits: [], pauses: [], segs: [], st: { easy: !!info.easy, speed: info.speed ?? 100 } });
  }
  begin(w: World): void {
    const sd = w.startData;
    this.seg = { seed: w.seed, np: w.nPlayers, hv: this.J.mem ? 2 : 1, data: { players: w.nPlayers, mode: sd.mode || 'story', boss: sd.boss || null, camp: sd.camp ? JSON.parse(JSON.stringify(sd.camp)) : null }, n: 0, rle: [], acts: [], chk: [] };
    this.J.segs.push(this.seg); this.dirty = true;
  }
  /** вызывается перед тиком мира */
  tick(w: World): void {
    const seg = this.seg; if (!seg) return;
    if (seg.n > 0 && seg.n % CHK === 0) seg.chk.push(seg.n, seg.hv === 2 ? hash2(w) : hash1(w));
    const v = tickValue(w.players), r = seg.rle, L = r.length;
    if (L && r[L - 2] === v) r[L - 1]!++; else r.push(v, 1);
    seg.n++; this.dirty = true;
  }
  act(name: string, a = 0, b = 0, c = 0): void { if (!this.seg) return; this.seg.acts.push([this.seg.n, name, a, b, c] as Act); this.dirty = true; }
}

export class Session {
  world!: World;
  sr: SrRun | null = null;
  rec: Recorder | null = null;
  readonly clock = new TickClock();
  /** события за кадр для отрисовки (очищает потребитель) */
  fxq: FxEvent[] = [];
  /** обработчики событий ядра: сохранение, рекорды, сплиты и т. п. */
  readonly on: Record<string, ((e: FxEvent, s: Session) => void)[]> = {};
  /** сколько сцен прошло в этой сессии (глава → арена → …) */
  scenes = 0;

  constructor(public cfg: SessionCfg, first: SceneData, run?: { cat: 'trail' | 'boss'; opt?: RunOpts }) {
    if (run) {
      this.sr = newRun(run.cat, { ver: cfg.ver, clock: cfg.clock, ...run.opt });
      const d = runStartData(run.cat, first.seed);
      first = { ...first, camp: first.camp ?? d.camp };
      if (!this.sr.rc) this.rec = Recorder.start({ cat: run.cat, seed: first.seed, ver: cfg.ver, easy: cfg.easy });
    }
    this.spawn(first);
  }

  private spawn(data: SceneData): void {
    this.world = new World({ ...data, easy: this.cfg.easy, loadoutSave: this.cfg.loadoutSave, progress: this.cfg.progress, sr: this.sr, fx: this.cfg.fx });
    this.scenes++;
    if (this.rec && this.world.nPlayers === 1) this.rec.begin(this.world);
  }

  /** Один кадр отрисовки: деltaMs — реальное время, inputs — ввод каждого локального игрока. Возвращает число выполненных тиков. */
  frame(deltaMs: number, inputs: InputFrame[]): number {
    const w = this.world;
    // ввод замирает, пока открыты пауза, меню скамьи, лавка, карта или герой ждёт «пошёл» (rawInput-обёртки v1.8);
    // после закрытия меню кнопки, которыми его выбирали, не должны сработать в игре: ввод нейтрален, пока их не отпустят (menuLock)
    let frozen = w.paused || !!w.benchMenuOpen || w.shopOpen || w.mt.open || w.mt.busy || !!(this.sr && this.sr.hold);
    if (this.mlock > 0 && !frozen) {
      const any = inputs.some((f) => f && BUTTONS.some((b) => f.buttons[b]));
      if (!any || this.cfg.clock() > this.mlock) this.mlock = 0; else frozen = true;
    }
    if (frozen) inputs = inputs.map(() => emptyFrame());
    // ввод с фронтами нажатий (накапливаются в p.pend до ближайшего тика)
    for (const p of w.players) {
      const f = inputs[p.i] ?? inputs[0]; if (!f) continue;
      const r = f.buttons as Inp, pd = p.pend, e = f.edges;
      pd.jumpP ||= e.jumpP; pd.atkP ||= e.atkP; pd.dashP ||= e.dashP; pd.healP ||= e.healP; pd.upP ||= e.upP; pd.bombP ||= e.bombP; pd.toolP ||= e.toolP;
      p.raw = { ...r }; p.prev = p.raw;
    }
    const n = this.clock.advance(deltaMs * (this.speedFactor ?? 1));
    for (let i = 0; i < n; i++) {
      if (this.rec) this.rec.tick(this.world);
      this.world.tick();
    }
    this.afterTicks();
    return n;
  }
  /** множитель скорости времени из настроек доступности (Access.speed); 1 в забеге */
  speedFactor: number | null = 1;
  /** до какого момента (мс по часам сессии) ввод считается «залипшим» после закрытия меню */
  private mlock = 0;
  private menuLock(): void { this.mlock = this.cfg.clock() + 1500; for (const p of this.world.players) { p.pend = {}; p.tapHold = {}; } }

  /** обработка событий мира и смена сцены — после кадра, как в Phaser (scene.start срабатывает в конце кадра) */
  afterTicks(): void {
    const w = this.world;
    if (w.fxq.length) {
      for (const e of w.fxq) { this.dispatch(e); if (this.cfg.fx) this.fxq.push(e); }
      w.fxq.length = 0;
    }
    if (w.next) {
      const data = w.next; w.next = null;
      this.spawn({ seed: data.seed, mode: data.mode, boss: data.boss, players: data.players, camp: data.camp });
      this.dispatch({ k: 'scene' });
    }
  }
  private dispatch(e: FxEvent): void {
    // внутренние события журнала
    if (e.k === 'srSplit' && this.rec) { this.rec.J.splits[e['i'] as number] = e['split'] as { rta: number; igt: number }; this.rec.dirty = true; }
    if (e.k === 'save') this.cfg.progress = e['progress'] as Progress;
    if (e.k === 'srFinish') this.dispatch({ k: 'runDone' });
    const hs = this.on[e.k]; if (hs) for (const h of hs) h(e, this);
  }

  // ----- действия интерфейса: выполняются сразу и пишутся в журнал, если что-то изменили (journal.js sig) -----
  private sig(): string {
    const w = this.world, p = w.players[0];
    return [w.paused, !!w.benchMenuOpen, w.shopOpen, w.mt.open, w.mt.busy, p && p.sit, p && p.hp, w.beads, w.respawn && w.respawn.x, w.up && w.up.hp + ',' + w.up.dmg + ',' + w.up.silk].join('|');
  }
  private act(name: string, args: [number, number, number], fn: () => void): void {
    const before = this.sig(); fn();
    if (this.rec && this.sig() !== before) this.rec.act(name, ...args);
  }
  togglePause(): void { const w = this.world, was = w.paused && !w.benchMenuOpen && !w.mt.open; this.act('T', [0, 0, 0], () => w.togglePause()); if (was && !w.paused) this.menuLock(); }
  benchPick(entry: BenchEntry): void { this.act('bc', [1, 0, 0], () => benchPick(this.world, entry)); }
  benchClose(): void { this.act('bc', [0, 0, 0], () => benchClose(this.world)); this.menuLock(); }
  benchRest(p: number, bench: number, quiet: boolean): void { const w = this.world; this.act('br', [p, bench, quiet ? 1 : 0], () => benchRest(w, w.players[p]!, w.benches[bench]!, quiet)); }
  openShop(p: number): void { const w = this.world; this.act('so', [p, 0, 0], () => openShop(w, w.players[p]!)); }
  closeShop(): void { this.act('sc', [0, 0, 0], () => this.world.closeShop()); }
  buy(id: string): void { const w = this.world; this.act('sb', [SHOP.findIndex((s) => s.id === id), 0, 0], () => buy(w, id)); }
  mapShow(): void { this.act('mo', [0, 0, 0], () => mapShow(this.world)); }
  mapClose(): void { this.act('mc', [0, 0, 0], () => mapClose(this.world)); }
  mapMove(d: number): void { this.act('mm', [d, 0, 0], () => mapMove(this.world, d)); }
  mapGo(): void { const w = this.world; this.act('mg', [w.mt.sel, 0, 0], () => mapGo(w)); }
  techPause(on: boolean): void { this.rec?.act('tp', on ? 1 : 0); srTechPause(this.world, on); }
  release(): void { const r = this.sr; if (r && r.hold) this.rec?.act('rel'); srRelease(this.world); }
  /** тик для тестов и симуляций: один тик с заданным вводом */
  step(inputs: InputFrame[]): void { this.frame(1000 / 60, inputs); }
  // экспорт для внешних (journal enc/dec) — чтобы не терять ссылку на бинарные имена кнопок
  static readonly BITS = BITS; static readonly EBITS = EBITS; static enc = enc;
}
