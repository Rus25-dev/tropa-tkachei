// Среда боя для обучения с подкреплением: один бой героя с боссом на ядре v2, решение раз в SKIP тиков.
// Наблюдение — src/agent/obs.ts, действия — src/agent/actions.ts. Ядро не меняется: среда только читает мир и подаёт ввод.
/* eslint-disable @typescript-eslint/no-explicit-any -- сущности ядра — «мешки» полей */
import { actionToInp, N_HEADS, SKIP } from '../../src/agent/actions';
import { HERO_DIM, OBS_DIM, WORLD_DIM, heroObs, worldObs } from '../../src/agent/obs';
import { outcome, type Journal } from '../../src/core/journal';
import { feedInput } from '../../src/core/fuzzinput';
import { Recorder } from '../../src/core/session';
import { makeTtrec, type Ttrec } from '../../src/core/ttrec';
import type { Inp } from '../../src/core/types';
import { World } from '../../src/core/world';

export type RlBoss = string;

/** Награда и шейпинг. Всё настраивается из Python (--reward '{"hurt":1.0}') и персонажем. */
export interface RewardCfg {
  /** за долю здоровья босса (1.0 = весь запас) */
  dmg: number;
  /** штраф за единицу потерянного здоровья героя */
  hurt: number;
  win: number; lose: number;
  /** штраф за решение (время) */
  time: number;
  /** штраф за каждую смену головы действия относительно прошлого решения («дрожащий» ввод) */
  switch: number;
  /** потенциал сближения с боссом (на 500 пикселей) */
  approach: number;
  /** за успешный отбив */
  parry: number;
  /** за бросок дымовой бомбы (исследование) */
  bomb: number;
  /** штраф за потерю нити/«обрыв» при таймауте */
  timeout: number;
  gamma: number;
}
export const DEFAULT_REWARD: RewardCfg = { dmg: 10, hurt: 0.7, win: 6, lose: 2, time: 0.0008, switch: 0.0004, approach: 0.25, parry: 0.15, bomb: 0.05, timeout: 1.5, gamma: 0.995 };

export interface EnvCfg {
  boss: RlBoss; maxSec: number; reward: RewardCfg;
  /** задержка восприятия мира (босс, снаряды) в решениях: 3 решения ≈ 200 мс */
  lag: number;
  record: boolean; ver: string; label: string;
}
export const DEFAULT_CFG: EnvCfg = { boss: 'misha2', maxSec: 150, reward: DEFAULT_REWARD, lag: 3, record: false, ver: '0', label: 'Нейросеть' };

export const INFO_DIM = 10;
/** done: 0 идёт, 1 победа, 2 обрыв нити, 3 таймаут (усечение) */
export const Done = { No: 0, Win: 1, Died: 2, Timeout: 3 } as const;
export type Done = (typeof Done)[keyof typeof Done];

const INTRO = new Set(['intro', 'sleep', 'roar']);

export class RlEnv {
  w!: World;
  cfg: EnvCfg;
  /** запаздывающие «мировые» части наблюдения (кольцо) */
  private ring: Float32Array[] = [];
  private ri = 0;
  private raws: Inp[] = [{}];
  private prevAct = new Uint8Array(N_HEADS);
  private rec: Recorder | null = null;
  ttrec: Ttrec | null = null;
  // счётчики эпизода
  seed = 0; started = -1; frame = 0; fightFrames = 0; steps = 0; ret = 0; hpLost = 0; parries = 0; bombs = 0; dmgDone = 0;
  private bossFrac = 1; private hp0 = 5; private phiPrev = 0; private bombs0 = 3;

  constructor(cfg: Partial<EnvCfg> = {}) {
    this.cfg = { ...DEFAULT_CFG, ...cfg, reward: { ...DEFAULT_REWARD, ...(cfg.reward ?? {}) } };
    for (let i = 0; i < 8; i++) this.ring.push(new Float32Array(WORLD_DIM));
  }

  private boss(): any { return this.w.testBoss(); }
  private bossFracNow(): number { const b = this.boss(); return b ? Math.max(0, b.hp) / b.maxHp : 1; }
  private dist(): number {
    const b = this.boss(), p: any = this.w.players[0]!;
    if (!b || b.y < -100) return 0;
    return Math.abs(b.x + b.w / 2 - (p.x + 7));
  }

  /** Новый бой с зерном seed; пишет наблюдение в obs. */
  reset(seed: number, obs: Float32Array, off: number): void {
    const boss = this.cfg.boss;
    const w = this.w = new World({ seed, mode: 'bosstest', boss, players: 1 });
    this.seed = seed;
    this.rec = this.cfg.record ? Recorder.start({ cat: null, seed, ver: this.cfg.ver, mem: true }) : null;
    this.rec?.begin(w);
    this.ttrec = null;
    let parries = 0;
    (w as unknown as { emit: World['emit'] }).emit = (k, props) => { if (k === 'flash' && props && props['ms'] === 90) parries++; };
    this.parryRef = () => parries; this.parryReset = () => { parries = 0; };
    this.frame = 0; this.started = -1; this.fightFrames = 0; this.steps = 0; this.ret = 0; this.hpLost = 0; this.parries = 0; this.bombs = 0; this.dmgDone = 0;
    this.prevAct.fill(0);
    // вступление босса: герой стоит, награда не начисляется
    for (let i = 0; i < 900; i++) {
      const b = this.boss();
      if (b && !INTRO.has(b.state)) { this.started = this.frame; break; }
      this.rawTick(null, 0);
    }
    const p = w.players[0]!;
    this.hp0 = p.hp; this.bossFrac = this.bossFracNow(); this.bombs0 = p.bombs; this.phiPrev = this.phi();
    // кольцо запаздывания заполняем текущим миром
    worldObs(w, 0, this.ring[0]!, 0);
    for (let i = 1; i < this.ring.length; i++) this.ring[i]!.set(this.ring[0]!);
    this.ri = 0;
    this.writeObs(obs, off);
  }
  private parryRef: () => number = () => 0;
  private parryReset: () => void = () => undefined;

  private phi(): number { return -this.cfg.reward.approach * Math.min(this.dist(), 700) / 500; }

  private rawTick(a: ArrayLike<number> | null, sub: number): void {
    const w = this.w;
    this.raws[0] = a ? actionToInp(a, sub) : {};
    feedInput(w, this.raws);
    this.rec?.tick(w);
    w.tick(); this.frame++;
  }

  private writeObs(obs: Float32Array, off: number): void {
    heroObs(this.w, 0, obs, off);
    const lag = Math.min(this.cfg.lag, this.ring.length - 1);
    obs.set(this.ring[(this.ri - lag + this.ring.length * 2) % this.ring.length]!, off + HERO_DIM);
  }

  /** Шаг среды: действие a (N_HEADS чисел). Пишет следующее наблюдение; возвращает награду и код конца. */
  step(a: ArrayLike<number>, obs: Float32Array, off: number): { r: number; done: Done } {
    const w = this.w, c = this.cfg.reward, p: any = w.players[0]!;
    this.parryReset();
    for (let s = 0; s < SKIP; s++) {
      this.rawTick(a, s);
      if (w.wiping) break;
      const b = this.boss();
      if (b && ['dead', 'gone'].includes(b.state)) break;
    }
    this.steps++;
    if (this.started >= 0) this.fightFrames = this.frame - this.started;
    const b = this.boss(), bf = this.bossFracNow();
    let r = c.dmg * (this.bossFrac - bf); this.dmgDone += this.bossFrac - bf; this.bossFrac = bf;
    const lost = Math.max(0, this.hp0 - p.hp); this.hp0 = p.hp; this.hpLost += lost; r -= c.hurt * lost;
    const par = this.parryRef(); this.parries += par; r += c.parry * par;
    if (p.bombs < this.bombs0) { this.bombs++; r += c.bomb; }
    this.bombs0 = p.bombs;
    r -= c.time;
    let sw = 0; for (let i = 0; i < N_HEADS; i++) if (a[i] !== this.prevAct[i]) sw++;
    r -= c.switch * sw;
    for (let i = 0; i < N_HEADS; i++) this.prevAct[i] = a[i]!;
    const ph = this.phi(); r += c.gamma * ph - this.phiPrev; this.phiPrev = ph;
    let done: Done = Done.No;
    if (w.wiping) { done = Done.Died; r -= c.lose; }
    else if (b && ['dead', 'gone'].includes(b.state) && this.started >= 0) { done = Done.Win; r += c.win; }
    else if (this.fightFrames > this.cfg.maxSec * 60) { done = Done.Timeout; r -= c.timeout; }
    this.ret += r;
    if (done) this.finish(done);
    else {
      this.ri = (this.ri + 1) % this.ring.length;
      worldObs(w, 0, this.ring[this.ri]!, 0);
      this.writeObs(obs, off);
    }
    return { r, done };
  }

  private finish(done: Done): void {
    if (!this.rec) return;
    const w = this.w;
    this.ttrec = makeTtrec(this.rec.J as Journal, { ver: this.cfg.ver, meta: { kind: 'bot', boss: this.cfg.boss, label: `${this.cfg.label} · ${done === Done.Win ? 'победа' : done === Done.Died ? 'поражение' : 'таймаут'}` }, expect: JSON.parse(JSON.stringify(outcome(w))) as Record<string, unknown> });
  }

  /** сводка эпизода (INFO_DIM чисел) */
  info(done: Done, out: Float32Array, off: number): void {
    out[off] = this.ret; out[off + 1] = this.steps; out[off + 2] = done === Done.Win ? 1 : 0; out[off + 3] = this.bossFrac; out[off + 4] = this.hpLost;
    out[off + 5] = this.fightFrames / 60; out[off + 6] = this.parries; out[off + 7] = done; out[off + 8] = this.seed; out[off + 9] = this.bombs;
  }
}

export { OBS_DIM };

