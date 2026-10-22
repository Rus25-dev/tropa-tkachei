// Мир игры: вся логика сцены v1.8 (GameScene) без Phaser, звука и интерфейса. Побитово совпадает со старой игрой (золотые записи).
// Время идёт тиками по 1/60 с (tick); отрисовка, звук и интерфейс получают события через очередь w.fxq.
// Порядок «обёрток» GameScene.prototype из v1.8 (qol → training → maptravel → tools → status и т. п.) сохранён явными вызовами.
import { CHAPTERS, EMPTY, P, PAL, PLAT, SOLID, T, clamp } from './balance';
import type { Boss, Enemy, FxEvent, Gate, Inp, Level, Player, Proj, Rect } from './types';
import { buildLevel, ARENAS } from './levels';
import { mulberry32, rngSeedFor, type Rng } from './rng';
import { STEP } from './constants';
import { campaignInit, campaignLevel, campaignSetup, applyUp, levelBossStep, type CampState, type Progress } from './campaign';
import { applyLoadout, equipped, normalizeSave, openAll, type LoadoutSave } from './loadout';
import { stepPlayer } from './player';
import { resolveAttack } from './weapons';
import { hurtPlayer, teamWipe as teamWipeFn } from './combat';
import { stepEnemy, spawnEnemies } from './enemies';
import { setupCrates } from './bombs';
import { stepProjs, stepBeads } from './projs';
import { stepItems, initItems } from './items';
import { stepCoop } from './coop';
import { stepStatus } from './status';
import { stepTools } from './tools';
import { mapVisit, mapLoad, mapClose, type MapState } from './maptravel';
import { benchClose } from './coop';
import { srOnTick, type SrRun } from './speedrun';
import { duelSetup } from './duelmods';
import { winGame } from './win';
import { guestProjHits } from './netplay';
import { applyPhase, newTrain, trainTick, type TrainState } from './training';
import { bossDef } from './boss/registry';
import { arenaLevel } from './boss/schema';
import { effForm } from './boss/form';
import { makeFight, stepDataBoss } from './boss/exec';
import { arenaStep, type ArenaRt } from './boss/arena';
import { stepCond, type CondRt } from './boss/conductor';


export type Mode = 'story' | 'bosstest';

export interface WorldOpts {
  seed: number;
  mode: Mode;
  /** id босса на данных (data/bosses): Босс-тест и арена главы кампании */
  boss?: string;
  players?: number;
  camp?: CampState | null;
  /** сохранённый прогресс (tt_save), только для «Продолжить» в сюжете; в забеге спидрана всегда null */
  progress?: Progress | null;
  easy?: boolean;
  /** сохранённое снаряжение (tt_loadout); надетое считает мир с учётом режима */
  loadoutSave?: LoadoutSave;
  sr?: SrRun | null;
  /** режим тренировки босс-теста (без убыли здоровья) */
  train?: boolean;
  /** фаза старта тренировки (1–3) */
  trainPhase?: number;
  /** карта: посещённые клетки/скамьи из сохранения */
  mapSaved?: { v?: number[]; b?: number[] } | null;
  /** складывать ли события для отрисовки (в симуляциях и тестах выключено) */
  fx?: boolean;
  /** сетевая игра вдвоём: хост считает мир, гость получает снимки (v1.8: GameScene.online) */
  online?: 'host' | 'guest' | null;
  /** набор приёмов игрока открыт в Босс-тесте и Босс-раше (kit/abilities.ts); в записях и мирах без флага приёмы закрыты */
  kit?: boolean;
}

export interface Timer { t: number; fn: () => void }

export class World {
  // ----- параметры запуска -----
  seed: number; mode: Mode; bossKind: string; nPlayers: number; easy: boolean;
  online: 'host' | 'guest' | null; localIdx: number; ping: number | null = null;
  /** по сети пауза — только окно (мир идёт) */
  uiPause = false;
  startData: WorldOpts; camp: CampState | null = null; sr: SrRun | null; kit: boolean;
  progress: Progress | null;
  // ----- ГСЧ -----
  rng!: Rng; rBoss!: Rng; rLoot!: Rng; rEnemy!: Rng;
  private _rngs: Record<string, Rng> = {};
  // ----- уровень и сущности -----
  L!: Level; grid!: number[][];
  players: Player[] = []; enemies: Enemy[] = [];
  /** боссы на данных (data/bosses/*.json): ведущий — bosses[0], остальные — участники дирижёра */
  bosses: Boss[] = [];
  /** сущности арены боссов на данных по расписанию (platforms, лучи, точки появления), волна 0 */
  arena: ArenaRt | null = null;
  /** динамические тайлы арены (платформы и барьеры): ключ y * W + x → SOLID | PLAT; поверх карты, карту не меняют */
  dyn: Map<number, number> | null = null;
  /** дирижёр нескольких боссов (волна 0) */
  cond: CondRt | null = null;
  projs: Proj[] = []; beadsArr: Rect[] & { vx?: number }[] = [] as never; benches: { x: number; y: number }[] = []; gates: Gate[] = [];
  puddles: { x: number; w: number; y: number; t: number }[] | null = null;
  crates: Rect[] | null = null;
  items: Record<string, unknown>[] = [];
  exitR: Rect | null = null;
  tl: Record<string, unknown>[] = []; tfx: Record<string, unknown>[] = [];
  // ----- состояние партии -----
  abil: Record<string, boolean> = {}; beads = 0; deaths = 0; timeSec = 0; up = { hp: 0, dmg: 0, silk: 0 };
  silkMax = 9;
  bossDead = false; won = false; wiping = false; paused = false; leaving = false;
  respawn = { x: 0, y: 0 };
  /** когда (timeSec) в последний раз сказали, что бой с боссом не работает по сети (campaign.netBossBlock) */
  netBossAt = -99;
  tickN = 0; acc = 0; tmr: Timer[] = []; slowT = 0; slowDur = 1; hitstop = 0; animT = 0;
  shopOpen = false; shopP: Player | null = null; benchMenuOpen: { p: Player; b: { x: number; y: number } } | null = null;
  quiet = false; train: TrainState | null = null;
  fightOn = false; fightT = 0; fightWon = false;
  mapV = new Set<number>(); mapB = new Set<number>(); mapDirty = false; mapSaveT = 0; mt!: MapState;
  areaIdx = -1; _execHint = false; _shellHint = false; _crackHint = false; _inAtk: Player | null = null; _hd: number | null = null; _cm = 1; _e2burst = false;
  /** данные следующей сцены, когда мир решил сменить сцену (Campaign.go): подхватывает сессия */
  next: WorldOpts | null = null;
  // ----- события для отрисовки -----
  fxOn: boolean; fxq: FxEvent[] = [];

  constructor(opts: WorldOpts) {
    this.startData = opts;
    this.seed = opts.seed >>> 0;
    this.mode = opts.mode ?? 'story';
    this.bossKind = opts.boss ?? CHAPTERS[2]!.boss;
    this.nPlayers = opts.players ?? 1;
    this.easy = !!opts.easy;
    this.online = opts.online ?? null; this.localIdx = this.online === 'guest' ? 1 : 0;
    this.sr = opts.sr ?? null; this.kit = !!opts.kit;
    this.progress = this.sr || this.online === 'guest' ? null : (opts.progress ?? null); // в забеге спидрана обычное сохранение не читается
    this.fxOn = !!opts.fx;
    campaignInit(this, opts);
    this.create(opts);
  }

  // ----- потоки ГСЧ -----
  private initRng(): void {
    this._rngs = {}; this.rng = mulberry32(this.seed);
    this.rBoss = this.rngFor('boss'); this.rLoot = this.rngFor('loot'); this.rEnemy = this.rngFor('enemy');
  }
  rngFor(name: string): Rng { return this._rngs[name] ?? (this._rngs[name] = mulberry32(rngSeedFor(this.seed, name))); }

  // ----- события наружу (вид, звук, интерфейс) -----
  emit(k: string, props?: Record<string, unknown>): void { if (this.fxOn) this.fxq.push({ k, ...props }); }
  sfx(n: string): void { if (this.quiet) return; this.emit('snd', { n }); if (this.online === 'host') this.sendEv({ k: 'snd', n }); }
  snd(n: string): void { this.emit('snd', { n }); }
  burst(n: number, x: number, y: number, c: number): void { if (this.quiet) return; this.emit('burst', { n, x, y, c }); if (this.online === 'host') this.sendEv({ k: 'burst', n, x: Math.round(x), y: Math.round(y), c }); }
  parts(n: number, x: number, y: number, c: number): void { this.emit('burst', { n, x, y, c }); }
  dustAt(n: number, x: number, y: number): void { this.emit('dust', { n, x, y }); if (this.online === 'host') this.sendEv({ k: 'dust', n, x: Math.round(x), y: Math.round(y) }); }
  paperAt(n: number, x: number, y: number): void { this.emit('paper', { n, x, y }); if (this.online === 'host') this.sendEv({ k: 'paper', n, x: Math.round(x), y: Math.round(y) }); }
  foamAt(n: number, x: number, y: number): void { this.emit('foam', { n, x, y }); if (this.online === 'host') this.sendEv({ k: 'foam', n, x: Math.round(x), y: Math.round(y) }); }
  shake(d: number, i: number): void { this.emit('shake', { d, i }); if (this.online === 'host') this.sendEv({ k: 'shake', d, i }); }
  toast(m: string, hold?: number): void { this.emit('toast', { m, hold }); }
  toastAll(m: string): void { this.emit('toast', { m }); this.sendEv({ k: 'toast', m }); }
  bossBar(show: boolean, name?: string, frac?: number): void { this.emit('bossBar', { show, name, frac }); }
  /** считает ли этот экземпляр мира врагов, боссов и урон (гость только показывает снимки) */
  auth(): boolean { return this.online !== 'guest'; }
  /** событие напарнику: сессия отправляет его по сети (k = 'nev', полезная нагрузка в o) */
  sendEv(o: Record<string, unknown>): void { if (this.online) this.emit('nev', { o }); }

  // ----- создание сцены -----
  private create(opts: WorldOpts): void {
    this.initRng();
    this.enemies = [];
    const dd = this.mode === 'bosstest' ? bossDef(this.bossKind) : undefined; // босс на данных: арена берётся из его описания
    if (this.mode === 'bosstest' && !dd) throw new Error(`нет босса на данных «${this.bossKind}»`);
    this.L = campaignLevel(this) ?? (dd ? ARENAS[arenaLevel(dd)]!() : buildLevel());
    this.bosses = [];
    this.crates = null; this.puddles = null;
    const L = this.L;
    this.grid = L.grid;
    // скамьи
    this.benches = L.benches.map((b) => ({ x: b.x * T + 16, y: (b.y + 1) * T }));
    // выход
    this.exitR = L.exit ? { x: L.exit.x * T - 4, y: (L.exit.y - 2) * T, w: 40, h: 3 * T } : null;
    // ворота
    this.gates = (L.gates ?? [L.gateIn, L.gateOut]).filter((g): g is Gate => !!g).map((gd, i) => ({ ...gd, closed: false, anim: 0, lockedUntilBoss: i === 1 }));
    if (this.gates[1]) this.setGate(this.gates[1], true);

    // игроки
    this.respawn = { x: L.spawn.x * T + 16, y: (L.spawn.y + 1) * T };
    const prog = this.mode === 'story' ? this.progress : null;
    if (prog && this.benches[prog.bench]) { const b = this.benches[prog.bench]!; this.respawn = { x: b.x, y: b.y }; }
    this.players = [];
    for (let i = 0; i < this.nPlayers; i++) this.players.push(this.makePlayer(i, this.respawn.x + i * 26, this.respawn.y));
    if (this.online) for (const p of this.players) { p.remote = p.i !== this.localIdx; p['tx'] = p.x; p['ty'] = p.y; p['lastSeq'] = 0; p['netUp'] = false; }

    // враги, босс
    this.enemies = []; spawnEnemies(this);
    this.bossDead = this.mode === 'bosstest';
    this.projs = []; this.beadsArr = [];
    if (dd) { if (this.L.crates) setupCrates(this); makeFight(this, dd.id); }
    this.abil = this.mode === 'bosstest' ? { double: true } : { ...((prog && prog.abil) || {}) };
    initItems(this);
    applyLoadout(this, equipped(opts.loadoutSave ?? normalizeSave(null), openAll(this.mode, !!this.camp, !!this.sr), !!this.sr));
    this.beads = prog ? prog.beads || 0 : 0; this.deaths = 0; this.timeSec = 0;
    campaignSetup(this);
    this.items = this.items.filter((it) => !this.abil[it['ability'] as string]);

    this.acc = 0; this.tickN = 0; this.tmr = []; this.slowT = 0; this.hitstop = 0; this.paused = false; this.wiping = false; this.won = false; this.animT = 0;
    this.areaIdx = -1;
    this.tl = []; this.tfx = [];
    this.train = opts.train && this.mode === 'bosstest' ? newTrain(opts.trainPhase ?? 1) : null;
    this.benchMenuOpen = null;
    mapLoad(this, opts.mapSaved ?? null);
    duelSetup(this); // дуэль: «Одна маска» (без дуэли ничего не делает)
    if (this.train) applyPhase(this);
    this.emit('ready');
  }

  /** ведущий босс боя или null (в уровнях и коридорах боя нет) */
  testBoss(): Boss | null { return this.bosses[0] ?? null; }
  alivePlayers(): Player[] { return this.players.filter((p) => !p.downed); }
  nearestPlayer(x: number, y: number): [Player | null, number] {
    let best: Player | null = null, bd = 1e9;
    for (const p of this.alivePlayers()) { const d = Math.hypot(p.x + 7 - x, p.y + 13 - y); if (d < bd) { bd = d; best = p; } }
    return [best, bd];
  }

  // ----- сущности -----
  makePlayer(i: number, x: number, y: number): Player {
    const hp = this.easy ? 8 : 5;
    return {
      i, pal: PAL[i]!, x: x - 7, y: y - 26, w: 14, h: 26, vx: 0, vy: 0, face: 1, onGround: false,
      coyote: 0, jumpBuf: 0, jumpCut: true, dashT: 0, dashCd: 0, canDash: true, atkT: 0, atkCd: 0, atkDir: 'f', atkHits: null, pogoed: false,
      hp, maxHp: hp, silk: 0, inv: 0, hurtT: 0, kbx: 0, downed: false, reviveT: 0, safeX: x - 7, safeY: y - 26, groundT: 0,
      wallDir: 0, wjLock: 0, healT: 0, landT: 0, sit: false, prev: {}, inp: {}, raw: {}, pend: {}, carry: {}, trail: [], bombs: this.L.crates ? 3 : 0, bombCd: 0,
    };
  }

  // ----- сетка -----
  tileAt(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.L.W || ty < 0 || ty >= this.L.H) return SOLID;
    const g = this.grid[ty]![tx]!;
    if (this.dyn !== null) { const d = this.dyn.get(ty * this.L.W + tx); if (d !== undefined && (g === EMPTY || d === SOLID)) return d; } // платформы и барьеры арены лежат поверх пустых клеток
    return g;
  }
  isSolid(tx: number, ty: number): boolean { return this.tileAt(tx, ty) === SOLID; }
  setGate(gt: Gate, closed: boolean): void {
    gt.closed = closed;
    for (let y = gt.y0; y <= gt.y1; y++) this.grid[y]![gt.x] = closed ? SOLID : EMPTY;
  }
  moveBody(e: { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround?: boolean; hitL?: boolean; hitR?: boolean; hitU?: boolean; noPlat?: boolean }, dt: number): void {
    e.hitL = e.hitR = e.hitU = false; e.onGround = false;
    let nx = e.x + e.vx * dt;
    const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
    if (e.vx > 0) {
      const tx = Math.floor((nx + e.w - 0.01) / T);
      for (let ty = y0; ty <= y1; ty++) if (this.isSolid(tx, ty)) { nx = tx * T - e.w; e.hitR = true; break; }
    } else if (e.vx < 0) {
      const tx = Math.floor(nx / T);
      for (let ty = y0; ty <= y1; ty++) if (this.isSolid(tx, ty)) { nx = (tx + 1) * T; e.hitL = true; break; }
    }
    e.x = nx; if (e.hitL || e.hitR) e.vx = 0;
    let ny = e.y + e.vy * dt;
    const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
    if (e.vy > 0) {
      const ty = Math.floor((ny + e.h - 0.01) / T), prevB = e.y + e.h;
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.tileAt(tx, ty);
        if (t === SOLID || (t === PLAT && !e.noPlat && prevB <= ty * T + 0.5)) { ny = ty * T - e.h; e.onGround = true; break; }
      }
    } else if (e.vy < 0) {
      const ty = Math.floor(ny / T);
      for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) { ny = (ty + 1) * T; e.hitU = true; break; }
    }
    e.y = ny; if (e.onGround || e.hitU) e.vy = 0;
  }
  solidRect(r: Rect): boolean {
    const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 0.01) / T), y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) return true;
    return false;
  }
  // скользим мимо угла потолка, если до свободного прохода меньше CORNER пикселей
  cornerNudge(p: Player, wantY: number, vy0: number): void {
    for (let d = 1; d <= P.CORNER; d++) for (const sg of [1, -1]) {
      const r = { x: p.x + sg * d, y: wantY, w: p.w, h: p.h };
      if (!this.solidRect(r)) { p.x = r.x; p.y = wantY; p.vy = vy0; p.hitU = false; return; }
    }
  }
  onPlatform(e: Rect): boolean {
    const ty = Math.floor((e.y + e.h + 1) / T), x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
    let plat = false;
    for (let tx = x0; tx <= x1; tx++) { const t = this.tileAt(tx, ty); if (t === SOLID) return false; if (t === PLAT) plat = true; }
    return plat;
  }
  touchWall(e: Rect, dir: number): boolean {
    const tx = dir > 0 ? Math.floor((e.x + e.w + 1) / T) : Math.floor((e.x - 1) / T);
    const ya = Math.floor((e.y + 4) / T), yb = Math.floor((e.y + e.h - 4) / T);
    for (let ty = ya; ty <= yb; ty++) if (this.isSolid(tx, ty)) return true;
    return false;
  }
  rectHitsTile(r: Rect, type: number, frac: number): boolean {
    const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 0.01) / T), y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.tileAt(tx, ty) !== type) continue;
      const tr = { x: tx * T + 2, y: ty * T + T * (1 - frac), w: T - 4, h: T * frac };
      if (overlap(r, tr)) return true;
    }
    return false;
  }
  groundBelowSolid(x: number, y: number): boolean { const t = this.tileAt(Math.floor(x / T), Math.floor(y / T)); return t === SOLID || t === PLAT; }

  // ----- часы логики -----
  after(sec: number, fn: () => void): void { this.tmr.push({ t: Math.max(1, Math.round(sec * 60)), fn }); }
  private tickTimers(): void {
    if (!this.tmr.length) return;
    const due: Timer[] = [];
    for (const m of this.tmr) if (--m.t <= 0) due.push(m);
    if (due.length) { this.tmr = this.tmr.filter((m) => m.t > 0); for (const m of due) m.fn(); }
  }
  /** замедление времени на смерть босса: сначала почти стоп, потом плавно разгоняемся */
  slowK(): number {
    if (!(this.slowT > 0)) return 1;
    const k = Math.max(0, this.slowT) / this.slowDur;
    return k > 0.35 ? 0.22 : 0.22 + 0.78 * (1 - k / 0.35);
  }

  /** Один тик логики. Ввод берётся из p.raw (удержание) и p.pend (фронты нажатий, пришедшие с прошлого тика); журнал пишет именно их. */
  tick(): void {
    this.tickN++;
    // по сети мир идёт: удар, обрыв нити или победа закрывают меню скамьи и карту (Game.update / MapTravel.tick v1.8)
    if (this.online) {
      const bm = this.benchMenuOpen;
      if (bm && (this.won || this.wiping || bm.p.downed || bm.p.hp <= 0 || bm.p.hurtT > 0)) benchClose(this);
      if (this.mt.open) { const lp = this.players.find((q) => !q.remote); if (this.won || this.wiping || (lp && (lp.downed || lp.hurtT > 0))) mapClose(this); }
    }
    if (this.slowT > 0) this.slowT -= STEP;
    const k = this.slowK(), dt = STEP * k;
    this.animT += dt;
    for (const p of this.players) {
      if (p.remote) continue;
      const pd = p.pend, cr = p.carry;
      for (const a in pd) if (pd[a as keyof Inp]) cr[a as keyof Inp] = true;
      p.pend = {};
    }
    if (!this.paused && !this.wiping && !this.won) {
      if (this.hitstop > 0) { this.hitstop -= dt; }
      else {
        this.acc += dt;
        while (this.acc >= STEP) {
          for (const p of this.players) {
            if (p.remote) { p.inp = { up: p['netUp'] }; continue; }
            p.inp = { ...p.raw, ...p.carry }; p.carry = {};
          }
          this.step(STEP); this.acc -= STEP;
          if (this.hitstop > 0 || this.wiping) { this.acc = 0; break; }
        }
        this.timeSec += dt;
      }
    }
    this.tickTimers();
    if (this.shopOpen) this.shopGuardHook();
    if (this.sr) srOnTick(this);
  }
  /** защита от «зависшей» лавки (Campaign.shopGuard) */
  private shopGuardHook(): void {
    const me = this.shopP;
    if (!me || !me.sit || me.downed || this.wiping || this.won) this.closeShop();
  }
  closeShop(): void {
    if (!this.shopOpen) return;
    this.after(1 / 60, () => { this.shopOpen = false; }); // Esc не должен тут же включить паузу; в тиках, чтобы воспроизведение совпало
    this.emit('shopHide');
  }

  /** Шаг мира: base GameScene.step + обёртки qol → training → maptravel → tools → status (в порядке загрузки модулей v1.8). */
  step(dt: number): void {
    this.stepBase(dt);
    // qol.js: счётчик попыток и таймер боя
    if (!this.train) this.qolFight(dt); else trainTick(this, dt);
    // maptravel.js
    mapVisit(this, dt);
    // tools.js
    if (this.tfx.length) this.tfx = this.tfx.filter((f) => ((f['t'] as number) -= dt) > 0);
    if (this.auth() && this.tl.length) stepTools(this, dt);
    // status.js
    stepStatus(this, dt);
  }

  private qolFight(dt: number): void {
    if (this.online === 'guest') return;
    const b = this.testBoss();
    const live = !!b && !['sleep', 'gone', 'dead', 'intro'].includes(b.state);
    if (!live) return;
    if (!this.fightOn) {
      this.fightOn = true; this.fightT = 0;
      this.emit('fightStart', { id: this.bossKind });
    }
    this.fightT += dt;
  }

  private stepBase(dt: number): void {
    const auth = this.auth();
    for (const p of this.players) { if (p.remote) p.atkT -= dt; else stepPlayer(this, p, dt); }
    for (const p of this.players) resolveAttack(this, p);
    if (auth) {
      for (const e of this.enemies) if (!e.dead) stepEnemy(this, e, dt);
      levelBossStep(this);
      stepCond(this);
      for (let i = 0; i < this.bosses.length; i++) stepDataBoss(this, i, dt);
      if (this.arena) arenaStep(this, 'w', -1);
      stepProjs(this, dt);
      stepBeads(this, dt);
      stepItems(this);
    } else guestProjHits(this);
    stepCoop(this, dt);
    if (auth && this.online && !this.wiping && this.players.every((p) => p.downed)) this.teamWipe();
    // урон от касания (каждый считает только своего героя)
    for (const p of this.players) {
      if (p.remote || p.downed || p.inv > 0) continue;
      const pr = inset(p, 2);
      for (const e of this.enemies) if (!e.dead && !e['m'] && overlap(pr, inset(e, 2))) { hurtPlayer(this, p, 1, e.x + e.w / 2); break; } // существа боссов бьют сами (minions.ts)
      for (const db of this.bosses) {
        const dd = bossDef((db['d'] as { id: string; formPh: number }).id), ct = dd ? effForm(dd, (db['d'] as { formPh: number }).formPh).contact : null;
        if (ct && p.inv <= 0 && !(db.stagger > 0) && !['dead', 'intro', 'rage'].includes(db.state) && overlap(pr, inset(db, 8))) hurtPlayer(this, p, ct.dmg, db.x + db.w / 2, false, ct.kind);
      }
    }
    // выход
    if (auth && this.exitR && this.bossDead && !this.won && this.players.some((p) => !p.downed && overlap(p, this.exitR!))) winGame(this);
  }

  // ----- интерфейсные действия, меняющие мир (их пишет журнал) -----
  togglePause(): void {
    // слои v1.8 (снаружи внутрь): меню скамьи → карта → база
    if (this.benchMenuOpen) { benchClose(this); return; }
    if (this.mt.open) { mapClose(this); return; }
    if (this.mt.busy) return;
    if (this.won || this.shopOpen) return;
    if (this.online) { this.uiPause = !this.uiPause; this.emit('pause', { on: this.uiPause }); return; } // по сети мир не останавливается
    this.paused = !this.paused;
    this.emit('pause', { on: this.paused });
  }

  /** Всё, что запоминает паузу/меню/лавку: подпись состояния для журнала (journal.js sig). */
  teamWipe(): void { teamWipeFn(this); }

  // ----- сноска: вычисляемые вспомогательные значения боссов -----
  bossPhaseForMusic(): number {
    const b = this.testBoss();
    return b && b.maxHp ? phaseOf(b) : 1;
  }
}

// ----- геометрия -----
export const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });
/** номер фазы по доле здоровья; пороги у боссов на данных лежат в b.thr (убывающие доли для фаз 2, 3), у остальных — 0.6 и 0.3 */
export const phaseOf = (b: { hp: number; maxHp: number; thr?: number[] }): number => {
  const f = b.hp / b.maxHp, th = b.thr ?? [0.6, 0.3];
  let ph = 1; for (let i = 0; i < th.length; i++) if (f <= th[i]!) ph = i + 2;
  return ph;
};

export { CHAPTERS, clamp, applyUp };
