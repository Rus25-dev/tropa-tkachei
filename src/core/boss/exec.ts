// Исполнитель боссов на данных (2.5): один автомат на всех — замах → активные кадры → восстановление, связки, фазы.
// Время идёт кадрами (60/с): шаг мира копит d.acc и выполняет целые кадры, так что замедление/оглушение из stepBossLayered работает без изменений.
// Урон идёт через hurtPlayer (с типом удара hk), снаряды — через sc.projs, движение — через moveBody. Все числа лежат в data/bosses/*.json.
import { P, T, clamp, dataKey, dataIdx } from '../balance';
import type { BossRef } from '../balance';
import { STEP } from '../constants';
import type { Boss, HitKind, Player, Proj, Rect } from '../types';
import type { World } from '../world';
import { inset, overlap } from '../world';
import { bossDeathFx, bossHitSnd, checkPhase, stepBossLayered } from '../bosses2';
import { gainSilk, hurtPlayer } from '../damage';
import { bossDeath } from '../korne';
import { winGame } from '../win';
import { activeEnd, type Attack, type BossDef, type BoxDef, type Chain } from './schema';
import { bossDef } from './registry';
import { newMem, noteUse, pickChain, policyOf, priorities, priorityChain, tickMem, type ArenaSide, type PickCtx, type PolicyMem } from './policy';
import { framesOf, newAc, poiseMulOf, resolveAnti, staggerBegin, staggerRoom, type AcState } from './anti';

export type DMode = 'intro' | 'idle' | 'rage' | 'scene' | 'attack' | 'dead';
/** Состояние исполнителя: лежит в b['d'] обычными данными (без функций), чтобы его можно было снять в снимок. */
export interface DState {
  id: string; i: number; mode: DMode;
  /** кадр внутри режима (intro/idle/rage/scene) */
  f: number;
  /** накопитель дробных кадров */
  acc: number;
  /** запрошена пауза до следующего выбора связки (кадров) */
  rest: number;
  atk: string | null; af: number; chain: string | null; step: number; enter: boolean;
  /** направление взгляда, зафиксированное к концу замаха; точка героя на тот же момент */
  dir: number; lock: { x: number; y: number };
  /** какие удары уже попали: «номер удара:номер героя» */
  hits: string[];
  /** направления сегментов движения: по индексу сегмента */
  mdir: Record<number, number>;
  punish: boolean;
  cue: { color: string; left: number; total: number } | null;
  closeF: Record<string, number>;
  mem: PolicyMem;
  bar: boolean;
  /** защита от читов (anti.ts) */
  ac: AcState;
}

export const dstate = (b: Boss): DState => b['d'] as DState;
export const isDataBoss = (b: Boss | null | undefined): boolean => !!b && !!b['d'];
export const defOfBoss = (b: Boss): BossDef => bossDef(dstate(b).id)!;
export const attackOf = (def: BossDef, id: string): Attack => def.attacks.find((a) => a.id === id)!;
export const chainOf = (def: BossDef, id: string): Chain => def.chains.find((c) => c.id === id)!;

/** Создать (или пересоздать) босса на данных с индексом i. */
export function makeDataBoss(sc: World, id: string, i = 0): Boss {
  const def = bossDef(id);
  if (!def) throw new Error(`нет босса на данных «${id}»`);
  const sp = sc.L[def.arena]!, hp = def.hp[sc.nPlayers === 2 ? 1 : 0]!;
  const b: Boss = {
    x: sp.x * T - def.size.w / 2, y: (sp.y + 1) * T - def.size.h, w: def.size.w, h: def.size.h, vx: 0, vy: 0, hp, maxHp: hp, phase: 1, state: 'intro', t: def.intro.frames / 60, face: -1, flash: 0,
    name: def.name, thr: def.phases.slice(1).map((p) => p.fromHp), stagger: 0,
    d: { id, i, mode: 'intro', f: 0, acc: 0, rest: 0, atk: null, af: 0, chain: null, step: 0, enter: false, dir: -1, lock: { x: 0, y: 0 }, hits: [], mdir: {}, punish: false, cue: null, closeF: {}, mem: newMem(), bar: false, ac: newAc() } satisfies DState,
  };
  sc.bosses[i] = b;
  return b;
}

// ---------- шаг ----------
export function stepDataBoss(sc: World, i: number, dt: number): void { stepBossLayered(sc, dataKey(i), dt, (s, dt2) => stepBase(s, i, dt2)); }

function stepBase(sc: World, i: number, dt: number): void {
  const b = sc.bosses[i]; if (!b) return;
  const d = dstate(b), def = bossDef(d.id)!;
  b.flash -= dt;
  if (!d.bar) { d.bar = true; sc.bossBar(true, def.name, b.hp / b.maxHp); }
  d.acc += dt / STEP;
  while (d.acc > 1 - 1e-6) { d.acc -= 1; frame(sc, b, d, def); }
  b.vy = Math.min(b.vy + P.G * dt, P.MAXFALL);
  const vx0 = b.vx;
  sc.moveBody(b, dt);
  wallStun(sc, b, d, def, vx0);
}

const centerX = (b: Boss): number => b.x + b.w / 2;
function arenaSide(sc: World, b: Boss): ArenaSide {
  const w = (sc.L.W - 2) * T, k = (centerX(b) - T) / w;
  return k < 1 / 3 ? 'left' : k > 2 / 3 ? 'right' : 'center';
}
/** герой у боковой стены арены (для «отогнать» порог короче) */
function heroInCorner(sc: World, tp: Player | null, margin: number): boolean {
  if (!tp) return false;
  const x = tp.x + 7;
  return x - T <= margin || (sc.L.W - 1) * T - x <= margin;
}
function ctxOf(sc: World, b: Boss, d: DState, tp: Player | null, def: BossDef): PickCtx {
  const cfg = resolveAnti(def);
  return { dist: tp ? Math.abs(tp.x + 7 - centerX(b)) : Infinity, side: arenaSide(sc, b), hpFrac: b.hp / b.maxHp, phase: b.phase || 1, closeF: d.closeF, corner: cfg ? heroInCorner(sc, tp, cfg.shove.cornerMargin) : false, calmF: d.ac.calm };
}

function frame(sc: World, b: Boss, d: DState, def: BossDef): void {
  const ph = b.phase || 1;
  tickMem(def, d.mem, ph);
  d.ac.clk++;
  const [tp] = sc.nearestPlayer(centerX(b), b.y + b.h / 2);
  const toward = tp ? (tp.x + 7 > centerX(b) ? 1 : -1) : b.face;
  // «вплотную»: считаем кадры, пока герой ближе порога приоритета и на одной высоте с боссом
  const dx = tp ? Math.abs(tp.x + 7 - centerX(b)) : Infinity;
  const level = !!tp && Math.abs(tp.y + 13 - (b.y + b.h / 2)) <= b.h / 2 + 40;
  for (const p of priorities(def, ph)) d.closeF[p.chain] = dx <= p.closeDist && level ? (d.closeF[p.chain] ?? 0) + 1 : 0;
  trackCalm(sc, d, def, dx);
  switch (d.mode) {
    case 'intro':
      if (d.f === 0 && def.intro.say) sc.toast(def.intro.say, 2);
      b.state = 'intro'; b.vx = 0; d.f++; b.t = Math.max(0, def.intro.frames - d.f) / 60;
      if (d.f >= def.intro.frames) toIdle(sc, d, def, b);
      break;
    case 'rage': {
      b.vx = 0; d.f++;
      const ps = def.phases[ph - 1]!;
      b.t = Math.max(0, ps.rageFrames - d.f) / 60;
      if (d.f >= ps.rageFrames) { d.f = 0; if (ps.scene) d.mode = 'scene'; else afterScene(sc, b, d, def); }
      break;
    }
    case 'scene': {
      b.vx = 0;
      const sn = def.phases[ph - 1]!.scene!;
      if (d.f === 0 && sn.say) sc.toast(sn.say, 2);
      d.f++;
      const skip = sn.skippable && sc.players.some((p) => !p.remote && !p.downed && (p.inp.jumpP || p.inp.atkP));
      if (d.f >= sn.frames || skip) afterScene(sc, b, d, def);
      break;
    }
    case 'idle': {
      b.state = 'idle'; d.punish = false; d.cue = null; if (tp) b.face = toward;
      if (b.onGround) b.vx = def.idle.walkSpeed > 0 && dx > def.idle.keepDist && tp ? toward * def.idle.walkSpeed : 0;
      d.f++; b.t = Math.max(0, d.rest - d.f) / 60;
      if (d.f >= d.rest || priorityChain(def, ctxOf(sc, b, d, tp, def), d.mem)) choose(sc, b, d, def, tp);
      break;
    }
    case 'attack': attackFrame(sc, b, d, def, tp); break;
    case 'dead': d.f++; b.t = Math.max(0, def.deathFrames - d.f) / 60; b.vx = 0; break;
  }
}

function toIdle(sc: World, d: DState, def: BossDef, b: Boss): void {
  d.mode = 'idle'; d.f = 0; d.atk = null; d.chain = null; d.enter = false;
  const r = policyOf(def, b.phase || 1).restFrames;
  d.rest = r[0] + Math.floor(sc.rBoss() * (r[1] - r[0] + 1));
}
function afterScene(sc: World, b: Boss, d: DState, def: BossDef): void {
  const ps = def.phases[(b.phase || 1) - 1]!;
  if (ps.enterChain) startChain(sc, b, d, def, ps.enterChain, true); else toIdle(sc, d, def, b);
}
/** (е) счёт кадров «герой рядом с боссом и не получает урона»; в вступлении, рёве и сцене не идёт */
function trackCalm(sc: World, d: DState, def: BossDef, dx: number): void {
  const cfg = resolveAnti(def), ac = d.ac;
  const php = sc.players.reduce((n, p) => n + (p.downed ? 0 : p.hp), 0), hurt = ac.php >= 0 && php < ac.php;
  ac.php = php;
  ac.calm = cfg && (d.mode === 'idle' || d.mode === 'attack') && dx <= cfg.relocate.dist && !hurt ? ac.calm + 1 : 0;
}
/** (д) самооглушение босса от удара о стену на рывке; с откатом */
function wallStun(sc: World, b: Boss, d: DState, def: BossDef, vx0: number): void {
  const cfg = resolveAnti(def), ws = cfg?.wallStun;
  if (!cfg || !ws || d.mode !== 'attack' || b.state !== 'active' || b.stagger > 0) return;
  if (!((vx0 > 0 && b.hitR) || (vx0 < 0 && b.hitL)) || Math.abs(vx0) < ws.minSpeed || d.ac.clk < d.ac.wallCd) return;
  d.ac.wallCd = d.ac.clk + framesOf(ws.cooldownSec);
  b.stagger = ws.sec * staggerBegin(d.ac, cfg, b.hp); b['poise'] = 0; b['executed'] = false; b.flash = 0.1;
  sc.sfx('stagger'); sc.shake(200, 0.01); sc.burst(18, b.x + b.w / 2, b.y + 10, 0xffd47a);
  onStagger(b);
}
/** Запустить связку сразу, минуя выбор (тренировка и инструменты проверки): false, если босс не в бою или связки нет. */
export function forceChain(sc: World, i: number, chainId: string): boolean {
  const b = sc.bosses[i]; if (!b || !isDataBoss(b)) return false;
  const d = dstate(b), def = bossDef(d.id)!;
  if (!def.chains.some((c) => c.id === chainId) || d.mode === 'dead' || d.mode === 'intro' || b.stagger > 0) return false;
  startChain(sc, b, d, def, chainId, true);
  return true;
}
function choose(sc: World, b: Boss, d: DState, def: BossDef, tp: Player | null): void {
  const id = pickChain(def, ctxOf(sc, b, d, tp, def), d.mem, sc.rBoss());
  if (!id) { d.f = 0; d.rest = 20; return; } // «сухое правило»: подходящих нет — подождать
  startChain(sc, b, d, def, id, false);
}
function startChain(sc: World, b: Boss, d: DState, def: BossDef, id: string, enter: boolean): void {
  const c = chainOf(def, id);
  d.chain = id; d.step = 0; d.enter = enter;
  if (!enter) { noteUse(def, d.mem, c, b.phase || 1); for (const k in d.closeF) if (k === id) d.closeF[k] = 0; if (id === resolveAnti(def)?.relocateChain) d.ac.calm = 0; }
  startAttack(sc, b, d, def, c.steps[0]!.attack);
}
function startAttack(sc: World, b: Boss, d: DState, def: BossDef, id: string): void {
  const a = attackOf(def, id), [tp] = sc.nearestPlayer(centerX(b), b.y + b.h / 2);
  d.mode = 'attack'; d.atk = id; d.af = 0; d.hits = []; d.mdir = {}; d.punish = false;
  d.cue = { color: a.tell.cue.color, left: a.tell.frames, total: a.tell.frames };
  if (a.tell.lockFace && tp) b.face = tp.x + 7 > centerX(b) ? 1 : -1;
  d.dir = b.face; d.lock = { x: tp ? tp.x + 7 : centerX(b) + b.face * 100, y: tp ? tp.y + 13 : b.y + b.h / 2 };
  sc.sfx(a.tell.cue.sfx);
}

/** Прямоугольник удара в мире. face — куда смотрит босс, lock — точка героя. */
export function boxRect(b: Boss, face: number, h: BoxDef, lock: { x: number; y: number }): Rect {
  if (h.at === 'target') return { x: lock.x + h.x, y: lock.y + h.y, w: h.w, h: h.h };
  const cx = centerX(b);
  return { x: face > 0 ? cx + h.x : cx - h.x - h.w, y: b.y + h.y, w: h.w, h: h.h };
}

function attackFrame(sc: World, b: Boss, d: DState, def: BossDef, tp: Player | null): void {
  const a = attackOf(def, d.atk!), c = chainOf(def, d.chain!);
  const T0 = a.tell.frames, end = activeEnd(a), af = d.af;
  if (af < T0) {
    b.state = 'tell'; b.t = (T0 - af) / 60; if (d.cue) d.cue.left = T0 - af;
    if (!a.tell.lockFace && tp) b.face = tp.x + 7 > centerX(b) ? 1 : -1;
    if (b.onGround) b.vx = 0;
    d.dir = b.face; d.lock = { x: tp ? tp.x + 7 : d.lock.x, y: tp ? tp.y + 13 : d.lock.y };
  } else {
    const t = af - T0;
    if (t <= end) {
      b.state = 'active'; d.cue = null; d.punish = false; b.t = (end - t) / 60;
      if (t === 0) b.face = d.dir;
      runActive(sc, b, d, a, t);
    } else {
      const r = t - end - 1, last = d.step >= c.steps.length - 1;
      b.state = 'recover'; d.cue = null; if (b.onGround) b.vx = 0;
      const pw = a.recovery.punishWindow;
      d.punish = r >= pw.from && r <= pw.to;
      b.t = Math.max(0, (last ? a.recovery.frames : (c.steps[d.step]!.gapFrames ?? a.recovery.frames)) - r) / 60;
    }
  }
  d.af++;
  const last = d.step >= c.steps.length - 1;
  const pause = last ? a.recovery.frames : (c.steps[d.step]!.gapFrames ?? a.recovery.frames);
  if (d.af >= T0 + end + 1 + pause) {
    if (last) toIdle(sc, d, def, b);
    else { d.step++; startAttack(sc, b, d, def, c.steps[d.step]!.attack); }
  }
}

function runActive(sc: World, b: Boss, d: DState, a: Attack, t: number): void {
  const cx = centerX(b);
  // движение
  let moving = false;
  a.move.forEach((m, mi) => {
    if (t < m.from || t > m.to) return;
    moving = true;
    if (d.mdir[mi] === undefined) {
      const [tp] = sc.nearestPlayer(cx, b.y + b.h / 2);
      d.mdir[mi] = m.toward === 'fixed' ? 1 : m.toward === 'wall' ? (cx < (sc.L.W * T) / 2 ? -1 : 1) : tp ? (tp.x + 7 > cx ? 1 : -1) : b.face;
      if (m.vy !== 0) b.vy = m.vy;
    }
    b.vx = d.mdir[mi]! * m.vx;
  });
  if (!moving && b.onGround) b.vx = 0;
  // удары
  a.active.forEach((h, ai) => {
    if (t < h.from || t > h.to) return;
    const box = boxRect(b, d.dir, h.hit, d.lock);
    for (const p of sc.players) {
      if (p.remote || p.downed || p.inv > 0) continue;
      const key = `${ai}:${p.i}`;
      if (d.hits.includes(key) || !overlap(inset(p, 2), box)) continue;
      d.hits.push(key);
      const hurt0 = p.hurtT;
      hurtPlayer(sc, p, h.dmg, box.x + box.w / 2, false, h.kind);
      if (h.knock && p.hurtT > hurt0) { p.kbx = (Math.sign(p.x + 7 - cx) || d.dir) * h.knock.vx; p.vy = h.knock.vy; }
    }
  });
  // снаряды
  for (const s of a.spawn) if (s.at === t) spawnProj(sc, b, d, s);
}

/** место без тайла-стены: сдвигаем вниз от потолка (снаряд, появившийся в камне, умер бы сразу) */
function freeSpot(sc: World, r: Rect): Rect {
  const q = { ...r };
  for (let k = 0; k < 24 && sc.solidRect(q); k++) q.y += T / 2;
  return q;
}
function spawnProj(sc: World, b: Boss, d: DState, s: Attack['spawn'][number]): void {
  const cx = centerX(b), cy = b.y + b.h / 2, f = d.dir, [tp] = sc.nearestPlayer(cx, cy);
  const base = s.from === 'target' ? { x: d.lock.x + s.ox, y: d.lock.y + s.oy } : { x: cx + f * s.ox, y: cy + s.oy };
  let vx = s.from === 'target' ? s.vx : f * s.vx, vy = s.vy;
  if (s.aim && tp) { const sp = Math.hypot(s.vx, s.vy), ax = tp.x + 7 - base.x, ay = tp.y + 13 - base.y, l = Math.hypot(ax, ay) || 1; vx = (ax / l) * sp; vy = (ay / l) * sp; }
  const a0 = Math.atan2(vy, vx), sp = Math.hypot(vx, vy);
  for (let k = 0; k < s.count; k++) {
    const ang = a0 + (k - (s.count - 1) / 2) * s.spread * (Math.PI / 180);
    const r = freeSpot(sc, { x: base.x - s.proj.w / 2, y: base.y - s.proj.h / 2, w: s.proj.w, h: s.proj.h });
    const pr: Proj = { kind: s.proj.kind, x: r.x, y: r.y, w: r.w, h: r.h, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: s.proj.life / 60, hk: s.kind, src: 'd', o: d.i };
    if (s.dmg !== undefined) pr.dmg = s.dmg;
    sc.projs.push(pr);
  }
}

// ---------- телеграф для отрисовки ----------
export interface DrawBox { r: Rect; kind: HitKind }
/** Прямоугольники ударов текущей атаки: в замахе — предупреждение (где ударит), в активных кадрах — живые. */
export function liveBoxes(sc: World, b: Boss): DrawBox[] {
  const d = b['d'] as DState | undefined; if (!d || d.mode !== 'attack' || !d.atk) return [];
  const a = attackOf(bossDef(d.id)!, d.atk), out: DrawBox[] = [];
  if (b.state === 'tell') {
    const [tp] = sc.nearestPlayer(centerX(b), b.y + b.h / 2), lock = tp ? { x: tp.x + 7, y: tp.y + 13 } : d.lock;
    for (const h of a.active) out.push({ r: boxRect(b, b.face, h.hit, lock), kind: h.kind });
  } else if (b.state === 'active') {
    const t = d.af - 1 - a.tell.frames;
    for (const h of a.active) if (t >= h.from && t <= h.to) out.push({ r: boxRect(b, d.dir, h.hit, d.lock), kind: h.kind });
  }
  return out;
}
/** Название текущей атаки (тренировка показывает его в телеграфе) или null. */
export function currentAttackName(b: Boss): string | null {
  const d = b['d'] as DState | undefined; if (!d || !d.atk) return null;
  const a = attackOf(bossDef(d.id)!, d.atk);
  return a.name ?? a.id;
}

// ---------- урон по боссу, фазы, смерть ----------
/** Исходная функция урона (RAW) — вызывается слоями damage.ts. */
export function rawData(sc: World, key: BossRef, p: Player): void {
  const i = dataIdx(key), b = sc.bosses[i]; if (!b) return;
  const d = dstate(b), def = bossDef(d.id)!;
  if (b.state === 'rage' || b.state === 'dead' || (b.stagger > 0 && !dataStaggerRoom(b))) { sc.snd('clink'); return; }
  b.hp -= 1; b.flash = 0.09; gainSilk(sc, p, true); if (!p.remote) sc.hitstop = 0.04; sc.sfx(bossHitSnd(sc, key, p));
  sc.burst(9, clamp(p.x + 7 + p.face * 26, b.x, b.x + b.w), b.y + b.h / 2, 0xf4f1e6);
  sc.bossBar(true, def.name, Math.max(0, b.hp) / b.maxHp);
  if (checkPhase(sc, b, def.name)) beginRage(b, d, def);
  if (b.hp <= 0 && b.state !== 'dead') dataDie(sc, i);
}
function beginRage(b: Boss, d: DState, def: BossDef): void {
  const ps = def.phases[(b.phase || 1) - 1]!;
  d.mode = 'rage'; d.f = 0; d.atk = null; d.chain = null; d.punish = false; d.cue = null; d.hits = [];
  b.t = ps.rageFrames / 60; b.vx = 0;
}
/** Хук оглушения (bosses2.poiseAdd): текущая атака обрывается, после оглушения босс снова в покое. */
export function onStagger(b: Boss): void {
  const d = b['d'] as DState | undefined; if (!d || d.mode === 'dead') return;
  if (d.mode === 'attack' || d.mode === 'idle') { d.mode = 'idle'; d.f = 0; d.rest = 24; d.atk = null; d.chain = null; d.punish = false; d.cue = null; d.enter = false; }
}
// ---------- защита от читов: хуки для общей стойки (bosses2.ts) ----------
/** во сколько раз порог стойки выше обычного (убывающая отдача оглушений) */
export function dataPoiseMul(b: Boss): number { const d = b['d'] as DState | undefined; return d ? poiseMulOf(d.ac, resolveAnti(bossDef(d.id)!)) : 1; }
/** оглушение началось: множитель его длительности; открывает окно потолка урона */
export function dataStaggerBegin(b: Boss): number { const d = b['d'] as DState | undefined; return d ? staggerBegin(d.ac, resolveAnti(bossDef(d.id)!), b.hp) : 1; }
/** можно ли ещё наносить урон оглушённому боссу (потолок за окно оглушения) */
export function dataStaggerRoom(b: Boss): boolean { const d = b['d'] as DState | undefined; return !d || staggerRoom(d.ac, resolveAnti(bossDef(d.id)!), b.hp, b.maxHp); }

export function dataDie(sc: World, i: number): void { bossDeath(sc, 'dataDie', (s) => dieBase(s, i)); }
function dieBase(sc: World, i: number): void {
  const b = sc.bosses[i]!, d = dstate(b), def = bossDef(d.id)!;
  b.state = 'dead'; d.mode = 'dead'; d.f = 0; d.atk = null; d.cue = null; d.punish = false; b.vx = 0; b.t = def.deathFrames / 60;
  sc.bossDead = true; bossDeathFx(sc);
  for (const pr of sc.projs) pr.dead = true;
  sc.sfx('roar'); sc.shake(700, 0.008);
  sc.emit('bossBursts', { x: b.x, y: b.y, w: b.w, h: b.h });
  sc.after(def.deathFrames / 60 + 0.7, () => { sc.bossBar(false); winGame(sc); });
}
