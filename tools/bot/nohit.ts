// No-hit бот (2.5, часть В): не «играет по ощущению», а решает задачу достижимости — может ли герой избежать урона.
// Ядро детерминировано и знает все данные атак, поэтому на каждом шаге бот копирует мир (clone.ts) и перебирает ответы героя
// на ближайшие `horizon` кадров: бег, прыжок, двойной прыжок, рывок (с неуязвимостью) и откаты — поиск в глубину по «макро-действиям»
// по `step` кадров, с отсечением по ударам. Если безопасной траектории нет, это и есть ошибка баланса: бот называет кадр и место.
// Режимы: strict — только уход и рывок; parry — ещё и отбив, но только если в ядре есть Парирование 2.0 (проверяется пробой parryImplemented).
// Две постановки: scanChains — каждая связка из многих стартовых положений (проходима ли вообще), runFlawless — целый бой с убийством босса.
import { P, T } from '../../src/core/balance';
import { dstate, forceChain } from '../../src/core/boss/exec';
import { bossDef } from '../../src/core/boss/registry';
import { chainFrames } from '../../src/core/boss/validate';
import { feedInput } from '../../src/core/fuzzinput';
import { hurtPlayer } from '../../src/core/damage';
import type { Inp, Player } from '../../src/core/types';
import { World } from '../../src/core/world';
import { cloneWorld } from './clone';

export type NoHitMode = 'strict' | 'parry';
export interface NoHitCfg {
  mode: NoHitMode;
  /** сколько кадров вперёд проверять */
  horizon: number;
  /** длина макро-действия, кадров */
  step: number;
  /** предел раскрытых узлов поиска на один шаг */
  budget: number;
  /** бить босса, когда это безопасно (false — только уходить: проверка связок) */
  aggressive: boolean;
}
export const DEFAULT_CFG: NoHitCfg = { mode: 'strict', horizon: 56, step: 4, budget: 1200, aggressive: true };

/** Есть ли в ядре Парирование 2.0: проба — неотбиваемый удар не должен гаситься отбивом. Без неё режим parry отключён. */
export function parryImplemented(): boolean {
  const w = new World({ seed: 1, mode: 'bosstest', boss: 'dummy', players: 1 });
  const p = w.players[0]!;
  p.hp = p.maxHp = 9; p.inv = 0; p.dashT = 0; p['parryT'] = P.PARRY_T;
  hurtPlayer(w, p, 1, p.x + 50, false, 'unblockable');
  return p.hp < 9;
}

// ---------- действия героя ----------
interface Act { name: string; dir: -1 | 0 | 1; jump: 0 | 1 | 2 | 3; dash?: boolean; atk?: boolean; parry?: boolean; /** кадр внутри действия, в который жмётся рывок/удар/отбив (0–3) */ at?: number }
const ACTS: Act[] = [
  { name: 'ждать', dir: 0, jump: 0 }, { name: 'влево', dir: -1, jump: 0 }, { name: 'вправо', dir: 1, jump: 0 },
  { name: 'прыжок', dir: 0, jump: 1 }, { name: 'прыжок←', dir: -1, jump: 1 }, { name: 'прыжок→', dir: 1, jump: 1 },
  { name: 'хоп', dir: 0, jump: 3 }, { name: 'хоп←', dir: -1, jump: 3 }, { name: 'хоп→', dir: 1, jump: 3 },
  { name: 'рывок←', dir: -1, jump: 0, dash: true }, { name: 'рывок→', dir: 1, jump: 0, dash: true },
  { name: 'двойной', dir: 0, jump: 2 }, { name: 'двойной←', dir: -1, jump: 2 }, { name: 'двойной→', dir: 1, jump: 2 },
  ...[1, 2, 3].flatMap((at): Act[] => [{ name: `рывок←@${at}`, dir: -1, jump: 0, dash: true, at }, { name: `рывок→@${at}`, dir: 1, jump: 0, dash: true, at }]),
  { name: 'удар', dir: 0, jump: 0, atk: true }, { name: 'удар←', dir: -1, jump: 0, atk: true }, { name: 'удар→', dir: 1, jump: 0, atk: true },
];
/** точка расширения: действия отбива; включаются только в режиме parry при наличии Парирования 2.0 */
const PARRY_ACTS: Act[] = [{ name: 'отбив', dir: 0, jump: 0, parry: true }];
/** Уровни поиска: сначала дешёвый набор (ждать, шаги, удары), затем рывки, затем прыжки и всё остальное. */
const LEVEL: ((a: Act) => boolean)[] = [
  (a) => !a.dash && !a.parry && a.jump === 0,
  (a) => !a.parry && a.jump === 0,
];
const byName = new Map([...ACTS, ...PARRY_ACTS].map((a) => [a.name, a]));
const act = (n: string): Act => byName.get(n)!;

function frameInp(a: Act, k: number): Inp {
  return { left: a.dir < 0, right: a.dir > 0, up: false, down: false, jump: a.jump === 1 || (a.jump === 2 && k > 0) || (a.jump === 3 && k < 2), atk: !!a.atk && k === (a.at ?? 0), dash: !!a.dash && k === (a.at ?? 0), heal: !!a.parry && k === (a.at ?? 0), bomb: false, tool: false };
}

const bossOfWorld = (w: World): ReturnType<World['testBoss']> => w.testBoss();
const heroCx = (p: Player): number => p.x + p.w / 2;

/**
 * Прокрутить действие на K кадров игры; false — герой получил урон (или упал). Кадры считаются по игровому времени:
 * тики «зависания» после удара (hitstop) мир не шагает, их не засчитываем, иначе горизонт поиска съедался бы зависаниями.
 */
function advance(c: World, a: Act, K: number): boolean {
  const p = c.players[0]!, hp0 = p.hp;
  for (let k = 0, guard = 0; k < K && guard < K * 60; guard++) {
    const frozen = c.hitstop > 0;
    feedInput(c, [frameInp(a, k)]);
    c.tick();
    if (p.hp < hp0 || p.downed) return false;
    if (!frozen) k++;
  }
  return true;
}

function stateKey(c: World, depth: number): string {
  const p = c.players[0]!, b = bossOfWorld(c);
  return `${depth}|${Math.round(p.x / 3)}|${Math.round(p.y / 3)}|${Math.sign(p.vx)}${Math.abs(p.vx) > 150 ? 1 : 0}|${Math.round(p.vy / 100)}|${p.onGround ? 1 : 0}${p.dashT > 0 ? 1 : 0}${Math.ceil(p.dashCd * 10)}${p.canDash ? 1 : 0}${p['usedDouble'] ? 1 : 0}${p.atkCd > 0 ? 1 : 0}${p.hurtT > 0 ? 1 : 0}|${b ? Math.round(b.x / 8) : 0}`;
}

export interface Forced {
  /** кадр боя (тик мира), в который не нашлось безопасного продолжения */
  tick: number;
  /** кадр атаки от начала замаха, если босс атакует */
  attackFrame: number | null;
  attack: string | null; chain: string | null; step: number | null;
  /** положение героя относительно центра босса и абсолютное */
  hero: { dx: number; dy: number; x: number; y: number };
  /** сколько кадров вперёд удалось пройти без урона по лучшему пути */
  survives: number;
  /** поиск исчерпан полностью (true) или остановлен по лимиту узлов (false) */
  exhausted: boolean;
}

export class NoHitPilot {
  cfg: NoHitCfg;
  private tail: Act[] = [];
  private queue: Inp[] = [];
  private last: Inp | null = null;
  forced: Forced[] = [];
  stats = { replans: 0, nodes: 0, failed: 0 };
  private acts: Act[];
  constructor(cfg: Partial<NoHitCfg> = {}) {
    this.cfg = { ...DEFAULT_CFG, ...cfg };
    if (this.cfg.mode === 'parry' && !parryImplemented()) throw new Error('режим parry отключён: в ядре нет Парирования 2.0 (HitKind-логики); используйте strict');
    this.acts = this.cfg.mode === 'parry' ? [...ACTS, ...PARRY_ACTS] : ACTS;
    if (!this.cfg.aggressive) this.acts = this.acts.filter((a) => !a.atk);
  }

  /** Обычное поведение в узле: продолжить прежний план; иначе бить босса, если достаю, или идти к нему; иначе ждать. */
  private usual(c: World, tail: Act | undefined): Act {
    if (tail) return tail;
    const p = c.players[0]!, b = bossOfWorld(c);
    if (this.cfg.aggressive && b && b.state !== 'dead' && b.state !== 'rage') {
      const dx = b.x + b.w / 2 - heroCx(p), adx = Math.abs(dx), toward = (Math.sign(dx) || p.face) as 1 | -1;
      const reach = adx <= 66 && Math.abs(p.y + 13 - (b.y + b.h / 2)) < b.h / 2 + 12;
      if (reach && p.atkCd <= 0) return p.face === toward ? act('удар') : act(toward > 0 ? 'удар→' : 'удар←');
      if (adx > 60) return act(toward > 0 ? 'вправо' : 'влево');
      if (adx < 34) return act(toward > 0 ? 'влево' : 'вправо');
    }
    return act('ждать');
  }

  /** Отклонения от обычного поведения в узле, по убыванию «пользы»: рывки (неуязвимость), прыжки, затем шаги и удары. */
  private deviations(c: World, level: number): Act[] {
    const p = c.players[0]!, b = bossOfWorld(c), out: Act[] = [];
    const push = (a: Act | undefined): void => { if (a && this.acts.includes(a) && !out.includes(a)) out.push(a); };
    const dx = (b ? b.x + b.w / 2 : heroCx(p)) - heroCx(p), toward = (Math.sign(dx) || p.face) as 1 | -1, away = (-toward) as 1 | -1;
    const dir = (d: number, l: string, r: string): string => (d > 0 ? r : l);
    if (level >= 1) {
      for (const at of ['', '@1', '@2', '@3']) push(act(dir(away, 'рывок←', 'рывок→') + at));
      for (const at of ['', '@1', '@2', '@3']) push(act(dir(toward, 'рывок←', 'рывок→') + at));
    }
    if (level >= 2) {
      for (const n of ['прыжок', 'хоп', 'двойной']) { push(act(n)); push(act(dir(away, n + '←', n + '→'))); push(act(dir(toward, n + '←', n + '→'))); }
      for (const a of PARRY_ACTS) push(a);
    }
    push(act(dir(away, 'влево', 'вправо'))); push(act(dir(toward, 'влево', 'вправо')));
    push(act('ждать'));
    for (const a of this.acts) if (level >= 2 || LEVEL[level]!(a)) push(a);
    return out;
  }

  /**
   * Поиск плана на horizon кадров от состояния w. Идея: «обычное» поведение (продолжить прежний план или бить босса, иначе ждать) прокручивается на
   * копии мира до первого удара; спасать надо только до этого места — перебор отклонений идёт от последнего макро-шага к первому, и в каждом
   * отклонении поиск повторяется. Так перебор не тонет в бессмысленных перестановках «шагнул влево — шагнул вправо».
   * Уровни: сначала шаги и удары, затем рывки (с любым кадром нажатия), затем прыжки и всё остальное.
   */
  private search(w: World): { plan: Act[]; ok: boolean; best: Act[]; exhausted: boolean } {
    const K = this.cfg.step, D = Math.ceil(this.cfg.horizon / K);
    const budgets = [Math.min(120, this.cfg.budget), Math.min(500, this.cfg.budget), this.cfg.budget];
    let bestDepth = -1, best: Act[] = [];
    for (let level = 0; level < 3; level++) {
      let nodes = 0, over = false, dead = new Set<string>();
      const rec = (c: World, depth: number, prefix: Act[], devLeft: number): Act[] | null => {
        // 1. прокрутка «обычного» поведения до первого удара
        const snaps: World[] = [], acts: Act[] = [];
        const cur = cloneWorld(c);
        let fail = -1;
        for (let j = depth; j < D; j++) {
          const b = bossOfWorld(cur);
          if (b && b.state === 'dead') break;
          snaps.push(cloneWorld(cur));
          const a0 = this.usual(cur, this.tail[j]);
          acts.push(a0);
          if (!advance(cur, a0, K)) { fail = j - depth; break; }
        }
        const reach = prefix.length + (fail < 0 ? acts.length : fail + 1);
        if (reach > bestDepth) { bestDepth = reach; best = [...prefix, ...acts].slice(0, reach); }
        if (fail < 0) return acts;
        if (devLeft <= 0) return null;
        // 2. отклонения: от последнего макро-шага перед ударом к первому
        for (let jj = fail; jj >= 0; jj--) {
          const st = snaps[jj]!;
          for (const a of this.deviations(st, level)) {
            if (a === acts[jj]) continue;
            if (nodes >= budgets[level]!) { over = true; return null; }
            nodes++;
            const n = cloneWorld(st);
            if (!advance(n, a, K)) continue;
            const key = stateKey(n, depth + jj + 1);
            if (dead.has(key)) continue;
            const pre = [...prefix, ...acts.slice(0, jj), a];
            const sub = rec(n, depth + jj + 1, pre, devLeft - 1);
            if (sub) return [...acts.slice(0, jj), a, ...sub];
            dead.add(key);
            if (over) return null;
          }
        }
        return null;
      };
      // чем меньше отклонений от обычного поведения, тем лучше: 1, затем 2, затем 3
      for (let dev = 1; dev <= 3 && !over; dev++) {
        dead = new Set<string>();
        const plan = rec(w, 0, [], dev);
        if (plan) { this.stats.nodes += nodes; return { plan, ok: true, best, exhausted: true }; }
      }
      this.stats.nodes += nodes;
      if (level === 2) return { plan: [], ok: false, best, exhausted: !over };
    }
    return { plan: [], ok: false, best, exhausted: false };
  }

  /** Ввод героя на этот кадр. Вызывать каждый тик перед feedInput/tick. */
  frame(w: World): Inp {
    if (w.hitstop > 0 && this.last) return this.last; // мир в зависании: кадр не пройдёт, ввод держим прежним
    if (!this.queue.length) {
      this.stats.replans++;
      const r = this.search(w);
      let first: Act;
      if (r.ok) { this.tail = r.plan.slice(1); first = r.plan[0]!; }
      else {
        this.stats.failed++;
        first = r.best[0] ?? act('ждать'); this.tail = r.best.slice(1);
        this.forced.push(describeForced(w, r.best.length * this.cfg.step, r.exhausted));
      }
      for (let k = 0; k < this.cfg.step; k++) this.queue.push(frameInp(first, k));
    }
    this.last = this.queue.shift()!;
    return this.last;
  }
}

function describeForced(w: World, survives: number, exhausted: boolean): Forced {
  const p = w.players[0]!, b = w.testBoss()!;
  const d = b['d'] as ReturnType<typeof dstate> | undefined;
  return {
    tick: w.tickN, attackFrame: d && d.mode === 'attack' ? d.af : null, attack: d?.atk ?? null, chain: d?.chain ?? null, step: d && d.chain ? d.step : null,
    hero: { dx: Math.round(heroCx(p) - (b.x + b.w / 2)), dy: Math.round(p.y + p.h - (b.y + b.h)), x: Math.round(p.x), y: Math.round(p.y) },
    survives, exhausted,
  };
}

// ---------- постановка 1: проходима ли связка ----------
export interface ScanSpec {
  boss: string; chains?: string[]; phases?: number[];
  /** положения босса по арене (доли ширины арены, 0–1) и смещения героя от центра босса, px */
  bossAt: number[]; offsets: number[];
  seed: number; cfg?: Partial<NoHitCfg>;
}
export interface ScanFail { phase: number; chain: string; bossAt: number; offset: number; forced: Forced; hit: boolean }
export interface ChainReport { phase: number; chain: string; scenarios: number; clean: number; passable: boolean; fails: ScanFail[]; frames: number }

/** Мир босса на данных в нужной фазе, без вступления, босс на доле bossAt ширины арены. */
export function stageWorld(boss: string, phase: number, bossAt: number, seed: number): World {
  const w = new World({ seed, mode: 'bosstest', boss, players: 1 });
  const b = w.bosses[0]!, d = dstate(b), def = bossDef(boss)!;
  const lo = T + 8, hi = (w.L.W - 1) * T - b.w - 8;
  b.x = Math.round(lo + (hi - lo) * bossAt);
  b.phase = phase;
  if (phase > 1) b.hp = Math.max(1, Math.floor(b.maxHp * def.phases[phase - 1]!.fromHp));
  d.mode = 'idle'; d.f = 0; d.rest = 1e9; b.state = 'idle';
  for (let i = 0; i < 4; i++) w.tick(); // босс и герой встали на пол
  return w;
}

export function scanChains(spec: ScanSpec, onProgress?: (s: string) => void): ChainReport[] {
  const def = bossDef(spec.boss)!;
  const cfg = { ...spec.cfg, aggressive: false };
  const reports: ChainReport[] = [];
  const phases = spec.phases ?? def.phases.map((_, i) => i + 1);
  for (const ph of phases) {
    const ids = spec.chains ?? def.phases[ph - 1]!.policy.chains;
    const all = [...new Set([...ids, ...(def.antiCheese?.shoveChain ? [def.antiCheese.shoveChain] : []), ...(def.antiCheese?.relocateChain ? [def.antiCheese.relocateChain] : [])])];
    for (const cid of spec.chains ? spec.chains : all) {
      const chain = def.chains.find((c) => c.id === cid); if (!chain) continue;
      const rep: ChainReport = { phase: ph, chain: cid, scenarios: 0, clean: 0, passable: true, fails: [], frames: chainFrames(def, chain) };
      for (const at of spec.bossAt) for (const off of spec.offsets) {
        const w = stageWorld(spec.boss, ph, at, spec.seed + rep.scenarios);
        const b = w.bosses[0]!, p = w.players[0]!;
        // герой на полу в off px от центра босса (в пределах арены)
        const cx = b.x + b.w / 2, hx = Math.min((w.L.W - 1) * T - p.w - 2, Math.max(T + 2, cx + off - p.w / 2));
        p.x = hx; p.y = b.y + b.h - p.h; p.safeX = p.x; p.safeY = p.y; p.vx = p.vy = 0; p.face = cx > hx ? 1 : -1;
        for (let i = 0; i < 2; i++) { feedInput(w, [{}]); w.tick(); }
        p.hp = p.maxHp = 9; p.inv = 0;
        const pilot = new NoHitPilot(cfg), hp0 = p.hp;
        forceChain(w, 0, cid);
        const d = dstate(b), limit = rep.frames + 90;
        let hit = false;
        for (let f = 0; f < limit; f++) {
          feedInput(w, [pilot.frame(w)]); w.tick();
          if (p.hp < hp0) { hit = true; break; }
          if (d.mode === 'idle' && f > 5) break; // связка закончилась
        }
        rep.scenarios++;
        if (!hit && !pilot.forced.length) rep.clean++;
        else if (hit) { rep.passable = false; rep.fails.push({ phase: ph, chain: cid, bossAt: at, offset: off, forced: pilot.forced[pilot.forced.length - 1] ?? describeForced(w, 0, true), hit }); }
        else if (pilot.forced.length) { /* путь был сомнительным, но удар не случился: считаем проходимой */ rep.clean++; }
        onProgress?.(`${spec.boss} фаза ${ph} ${cid}`);
      }
      reports.push(rep);
    }
  }
  return reports;
}

// ---------- постановка 2: целый бой без урона ----------
export interface FlawlessResult {
  seed: number; won: boolean; flawless: boolean; hits: number;
  /** секунд боя (от конца вступления) до убийства или до конца лимита */
  sec: number;
  /** секунд боя до первого урона (весь бой, если урона не было) */
  noHitSec: number;
  /** по связкам: сколько раз началась и сколько раз во время неё был урон */
  chains: Record<string, { starts: number; hurt: number }>;
  forced: Forced[];
  replans: number; nodes: number;
}
export function runFlawless(boss: string, seed: number, cfg: Partial<NoHitCfg> = {}, maxSec = 240): FlawlessResult {
  const w = new World({ seed, mode: 'bosstest', boss, players: 1 });
  const b = w.bosses[0]!, d = dstate(b), p = w.players[0]!;
  const pilot = new NoHitPilot(cfg);
  const chains: FlawlessResult['chains'] = {};
  let started = -1, lastStart = -1, firstHit = -1, hits = 0, hp = p.hp;
  for (let t = 0; t < (maxSec + 10) * 60; t++) {
    feedInput(w, [d.mode === 'intro' ? {} : pilot.frame(w)]);
    w.tick();
    if (started < 0 && d.mode !== 'intro') started = t;
    if (d.mode === 'attack' && d.chain && d.step === 0 && d.af === 1 && d.ac.clk !== lastStart) { (chains[d.chain] ??= { starts: 0, hurt: 0 }).starts++; lastStart = d.ac.clk; }
    if (p.hp < hp) {
      hits += hp - p.hp; if (firstHit < 0) firstHit = t;
      const cn = d.chain ?? 'вне связки'; (chains[cn] ??= { starts: 0, hurt: 0 }).hurt++;
    }
    hp = p.hp;
    if (b.state === 'dead' || w.wiping || p.downed) break;
    if (started >= 0 && t - started > maxSec * 60) break;
  }
  const end = Math.max(started, 0), now = w.tickN;
  return {
    seed, won: b.state === 'dead', flawless: b.state === 'dead' && hits === 0, hits,
    sec: Math.max(0, now - end) / 60, noHitSec: ((firstHit >= 0 ? firstHit : now) - end) / 60,
    chains, forced: pilot.forced, replans: pilot.stats.replans, nodes: pilot.stats.nodes,
  };
}
