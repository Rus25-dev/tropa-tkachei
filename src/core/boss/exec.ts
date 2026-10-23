// Исполнитель боссов на данных (2.5): один автомат на всех — замах → активные кадры → восстановление, связки, фазы.
// Время идёт кадрами (60/с): шаг мира копит d.acc и выполняет целые кадры, так что замедление/оглушение из stepBossLayered работает без изменений.
// Урон идёт через hurtPlayer (с типом удара hk), снаряды — через sc.projs, движение — через moveBody. Все числа лежат в data/bosses/*.json.
// Волна 0: сцены и трансформация фаз (form), неподвижные и летающие тела, уязвимые точки, сущности арены, существа-приспешники,
// несколько боссов под дирижёром (conductor.ts) и особая логика босса из kinds/<id>.ts.
import { P, T, clamp, dataKey, dataIdx } from '../balance';
import type { BossRef } from '../balance';
import { STEP } from '../constants';
import type { Boss, HitKind, Player, Rect } from '../types';
import type { World } from '../world';
import { inset, overlap, phaseOf } from '../world';
import { bossDeathFx, bossHitSnd, checkPhase, stepBossLayered } from '../bosses2';
import { gainSilk, hurtPlayer } from '../damage';
import { bossDeath } from './death';
import { atkBox } from '../weapons';
import { winGame } from '../win';
import { arenaAbort, arenaClear, arenaFire, arenaOnPhase, arenaOnStart, arenaOnStep, arenaStep, makeArena } from './arena';
import { barFrac, condOnChainEnd, conducted, deathIsFinal, makeCond, syncPool } from './conductor';
import { effForm } from './form';
import { kindOf, type KindApi } from './kinds';
import { spawnCreature } from './minions';
import { chainAllowed, meets, newMem, noteUse, pickChain, policyOf, priorities, priorityChain, tickMem, type ArenaSide, type PickCtx, type PolicyMem } from './policy';
import { BOSS_RULES, bossDef } from './registry';
import { activeEnd, arenaLevel, type Attack, type BossDef, type Chain, type Weak } from './schema';
import { arenaSpot } from '../arena-kit';
import { aimAt, boxRect, centerX, dstate, fireShots, freeSpot } from './shared';
import { attackEvents } from './validate';
import { framesOf, newAc, poiseMulOf, resolveAnti, staggerBegin, staggerRoom, type AcState } from './anti';
import { staggerCap } from './anti';
import { shapeHits, type BossHit, type HitResult } from '../hit';
import { projReg } from '../plugin/regs';

export { boxRect, dstate };
export type DMode = 'intro' | 'idle' | 'rage' | 'scene' | 'attack' | 'dead';
/** Состояние исполнителя: лежит в b['d'] обычными данными (без функций), чтобы его можно было снять в снимок. */
export interface DState {
  /** Номер экземпляра атаки: связывает с ней отменяемые снаряды. */
  serial?: number;
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
  /** фаза, чьё тело (form) сейчас на боссе; фаза, для которой запущены сущности арены */
  formPh: number; phA: number;
  /** поверхность пола, px; для неподвижного — точка, где он закреплён */
  floor: number; pin: { x: number; y: number } | null;
  /** кадр исполнителя: приём задал вертикальную скорость полёта (выравнивание по высоте отключается) */
  flyMove: boolean;
  /** подсказка про броню уже показана */
  hinted: boolean;
  /** сцена: уже сыгранные события morph (применены) */
  morphed: boolean;
}

export const isDataBoss = (b: Boss | null | undefined): boolean => !!b && !!b['d'];
export const defOfBoss = (b: Boss): BossDef => bossDef(dstate(b).id)!;
export const attackOf = (def: BossDef, id: string): Attack => def.attacks.find((a) => a.id === id)!;
export const chainOf = (def: BossDef, id: string): Chain => def.chains.find((c) => c.id === id)!;

const apiOf = (sc: World, b: Boss, d: DState, def: BossDef): KindApi => ({ sc, b, d, def, i: d.i, rng: sc.rBoss });
const kindHook = (sc: World, b: Boss, d: DState, def: BossDef): { k: ReturnType<typeof kindOf>; api: KindApi } => ({ k: kindOf(def.id), api: apiOf(sc, b, d, def) });

/** Создать (или пересоздать) босса на данных с индексом i. place — положение участника из раздела conductor. */
export function makeDataBoss(sc: World, id: string, i = 0, place?: { x?: number; y?: number }): Boss {
  const def = bossDef(id);
  if (!def) throw new Error(`нет босса на данных «${id}»`);
  const sp = arenaSpot(sc.L, arenaLevel(def))!, hp = def.hp[sc.nPlayers === 2 ? 1 : 0]!;
  const e = effForm(def, 1), pl = place ?? def.place, floor = (sp.y + 1) * T;
  const cx = pl?.x !== undefined ? T + pl.x * (sc.L.W - 2) * T : sp.x * T;
  const bottom = floor - (pl?.y ?? (e.fly ? e.fly.hover : 0));
  const b: Boss = {
    x: cx - e.size.w / 2, y: bottom - e.size.h, w: e.size.w, h: e.size.h, vx: 0, vy: 0, hp, maxHp: hp, phase: 1, state: 'intro', t: def.intro.frames / 60, face: -1, flash: 0,
    name: def.name, thr: def.phases.slice(1).map((p) => p.fromHp), stagger: 0,
    d: { id, i, mode: 'intro', f: 0, acc: 0, rest: 0, atk: null, af: 0, chain: null, step: 0, enter: false, dir: -1, lock: { x: 0, y: 0 }, hits: [], mdir: {}, punish: false, cue: null, closeF: {}, mem: newMem(), bar: false, ac: newAc(), formPh: 1, phA: 0, floor, pin: null, flyMove: false, hinted: false, morphed: false } satisfies DState,
  };
  (b['d'] as DState).pin = e.still ? { x: b.x, y: b.y } : null;
  sc.bosses[i] = b;
  return b;
}

/** Создать весь бой: ведущий босс, участники дирижёра, дирижёр, арена. Прежние боссы и существа убираются. */
export function makeFight(sc: World, id: string): Boss {
  const def = bossDef(id);
  if (!def) throw new Error(`нет босса на данных «${id}»`);
  sc.bosses = []; sc.enemies = sc.enemies.filter((e) => !e['m']);
  const lead = makeDataBoss(sc, id, 0);
  const cd = def.conductor;
  if (cd) cd.members.forEach((m, k) => {
    const mb = makeDataBoss(sc, m.boss, k + 1, m.place);
    if (cd.pool) { mb.hp = mb.maxHp = lead.maxHp; mb.thr = bossDef(m.boss)!.phases.slice(1).map((p) => p.fromHp); }
  });
  makeCond(sc);
  makeArena(sc);
  return lead;
}
/** Начать бой заново (обрыв нити, сброс в тренировке) */
export function resetFight(sc: World): void {
  const lead = sc.bosses[0]; if (!lead) return;
  makeFight(sc, dstate(lead).id);
}

// ---------- шаг ----------
export function stepDataBoss(sc: World, i: number, dt: number): void { stepBossLayered(sc, dataKey(i), dt, (s, dt2) => stepBase(s, i, dt2)); }

/** Ход оглушённого (и вообще любого) тела: неподвижный стоит, летающий висит, остальные падают и ходят по тайлам */
export function dataBody(sc: World, b: Boss, dt: number): void {
  const d = dstate(b), def = bossDef(d.id)!, e = effForm(def, d.formPh);
  if (e.still) { b.vx = 0; b.vy = 0; b.onGround = true; b.hitL = b.hitR = false; return; }
  if (e.fly) {
    if (!d.flyMove) {
      const want = d.floor - e.fly.hover - b.h + Math.sin(sc.animT * 2) * e.fly.bob, err = want - b.y;
      b.vy = clamp(err * 5, -e.fly.speed, e.fly.speed);
    }
  } else b.vy = Math.min(b.vy + P.G * dt, P.MAXFALL);
  sc.moveBody(b, dt);
}

function stepBase(sc: World, i: number, dt: number): void {
  const b = sc.bosses[i]; if (!b) return;
  const d = dstate(b), def = bossDef(d.id)!;
  b.flash -= dt;
  if (!d.bar && (i === 0 || !sc.cond)) { d.bar = true; sc.bossBar(true, def.name, barFrac(sc)); }
  if (sc.cond && !sc.cond.over && b.state !== 'dead') { // несколько боссов: общий пул и фазы по общему здоровью
    syncPool(sc);
    if (b.hp <= 0) { dataDie(sc, i); return; }
    if ((d.mode === 'idle' || d.mode === 'attack') && checkPhase(sc, b, def.name, !!def.phases[phaseOf(b) - 1]?.silent)) beginPhase(sc, b, d, def);
  }
  d.acc += dt / STEP;
  while (d.acc > 1 - 1e-6) { d.acc -= 1; frame(sc, b, d, def); }
  const vx0 = b.vx;
  dataBody(sc, b, dt);
  if (!effForm(def, d.formPh).still) wallStun(sc, b, d, def, vx0);
}

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

// ---------- сцены ----------
type SceneEv = NonNullable<BossDef['phases'][number]['scene']>['events'][number];
const skipPressed = (sc: World): boolean => sc.players.some((p) => !p.remote && !p.downed && (p.inp.jumpP || p.inp.atkP));
/** События сцены на кадре f (камера, надпись, звук, превращение) */
function sceneEvents(sc: World, b: Boss, d: DState, def: BossDef, evs: readonly SceneEv[], f: number): void {
  for (const e of evs) {
    if (e.at !== f) continue;
    if (e.say) sc.toast(e.say, 2);
    if (e.sfx) sc.sfx(e.sfx);
    if (e.shake) sc.shake(e.shake.ms, e.shake.i);
    if (e.flash) sc.emit('flash', { ms: e.flash.ms, r: e.flash.r, g: e.flash.g, b: e.flash.b });
    if (e.fade) sc.emit('fade', { out: e.fade.out, ms: e.fade.ms });
    if (e.zoom) sc.emit('camZoom', { zoom: e.zoom.k, frames: e.zoom.frames });
    if (e.morph) { applyFormNow(sc, b, d, def); d.morphed = true; }
  }
}
/** Сцену пропустили: недоигранные превращения применяются, камера и экран возвращаются */
function sceneSkipped(sc: World, b: Boss, d: DState, def: BossDef, evs: readonly SceneEv[], f: number): void {
  for (const e of evs) if (e.at > f && e.morph) { applyFormNow(sc, b, d, def); d.morphed = true; }
  if (evs.some((e) => e.at <= f && e.fade?.out)) sc.emit('fade', { out: false, ms: 150 });
  if (evs.some((e) => e.zoom)) sc.emit('camZoom', { zoom: 1, frames: 1 });
  sc.emit('sceneSkip');
}

/** Идёт ли сейчас сцена босса (рёв не в счёт) и можно ли её пропустить: интерфейс рисует чёрные полосы и подсказку */
export function sceneOn(sc: World): { skippable: boolean } | null {
  for (const b of sc.bosses) {
    const d = b['d'] as DState | undefined; if (!d) continue;
    const def = bossDef(d.id)!;
    if (d.mode === 'scene') return { skippable: def.phases[(b.phase || 1) - 1]?.scene?.skippable ?? true };
    if (d.mode === 'intro' && def.intro.events.length) return { skippable: def.intro.skippable };
  }
  return null;
}

// ---------- тело (форма) ----------
/** Применить тело текущей фазы: размер (низ и центр сохраняются), режим полёта и неподвижности, закрепление */
function applyFormNow(sc: World, b: Boss, d: DState, def: BossDef): void {
  const ph = b.phase || 1;
  if (d.formPh === ph) return;
  d.formPh = ph;
  const e = effForm(def, ph), cx = centerX(b), bottom = b.y + b.h;
  if (e.size.w !== b.w || e.size.h !== b.h) {
    b.w = e.size.w; b.h = e.size.h; b.x = cx - b.w / 2; b.y = bottom - b.h;
    const r = freeSpot(sc, { x: b.x, y: b.y, w: b.w, h: b.h }); b.y = r.y;
    for (let k = 0; k < 16 && sc.solidRect({ x: b.x, y: b.y, w: b.w, h: b.h }); k++) b.y -= T / 2;
  }
  d.pin = e.still ? { x: b.x, y: b.y } : null;
  if (!e.fly && !e.still) b.vy = 0;
  sc.burst(24, cx, b.y + b.h / 2, e.color);
}

function frame(sc: World, b: Boss, d: DState, def: BossDef): void {
  const ph = b.phase || 1;
  tickMem(def, d.mem, ph);
  d.ac.clk++; d.flyMove = false;
  const e = effForm(def, d.formPh);
  const [tp] = sc.nearestPlayer(centerX(b), b.y + b.h / 2);
  const toward = tp ? (tp.x + 7 > centerX(b) ? 1 : -1) : b.face;
  // «вплотную»: считаем кадры, пока герой ближе порога приоритета и на одной высоте с боссом
  const dx = tp ? Math.abs(tp.x + 7 - centerX(b)) : Infinity;
  const level = !!tp && Math.abs(tp.y + 13 - (b.y + b.h / 2)) <= b.h / 2 + 40;
  for (const p of priorities(def, ph)) d.closeF[p.chain] = dx <= p.closeDist && level ? (d.closeF[p.chain] ?? 0) + 1 : 0;
  trackCalm(sc, d, def, dx, e.still);
  // фаза началась без рёва (тренировка с фазы 2): тело и сущности арены подхватываются в покое
  if ((d.mode === 'idle' || d.mode === 'attack') && d.formPh !== ph) { applyFormNow(sc, b, d, def); const k = kindHook(sc, b, d, def); k.k?.onPhase?.(k.api, ph); }
  if (d.mode !== 'intro' && d.mode !== 'dead' && d.phA !== ph) { d.phA = ph; arenaOnPhase(sc, d.i, ph); }
  switch (d.mode) {
    case 'intro': {
      if (d.f === 0 && def.intro.say) sc.toast(def.intro.say, 2);
      sceneEvents(sc, b, d, def, def.intro.events, d.f);
      b.state = 'intro'; b.vx = 0; d.f++; b.t = Math.max(0, def.intro.frames - d.f) / 60;
      const skip = def.intro.skippable && skipPressed(sc);
      if (skip) sceneSkipped(sc, b, d, def, def.intro.events, d.f);
      if (d.f >= def.intro.frames || skip) { toIdle(sc, d, def, b); arenaOnStart(sc, d.i); }
      break;
    }
    case 'rage': {
      b.vx = 0; d.f++;
      const ps = def.phases[ph - 1]!;
      b.t = Math.max(0, ps.rageFrames - d.f) / 60;
      if (d.f >= ps.rageFrames) { d.f = 0; if (ps.scene) d.mode = 'scene'; else afterScene(sc, b, d, def); }
      break;
    }
    case 'scene': {
      b.vx = 0;
      const sn = def.phases[ph - 1]!.scene!, cap = Math.min(sn.frames, BOSS_RULES.scene?.maxFrames ?? sn.frames);
      if (d.f === 0 && sn.say) sc.toast(sn.say, 2);
      sceneEvents(sc, b, d, def, sn.events, d.f);
      d.f++;
      const skip = sn.skippable && skipPressed(sc);
      if (skip) sceneSkipped(sc, b, d, def, sn.events, d.f);
      if (d.f >= cap || skip) afterScene(sc, b, d, def);
      break;
    }
    case 'idle': {
      b.state = 'idle'; d.punish = false; d.cue = null; if (tp) b.face = toward;
      if (e.still) b.vx = 0;
      else if (b.onGround || e.fly) b.vx = e.idle.walkSpeed > 0 && dx > e.idle.keepDist && tp ? toward * e.idle.walkSpeed : 0;
      d.f++; b.t = Math.max(0, d.rest - d.f) / 60;
      const urgent = priorityChain(def, ctxOf(sc, b, d, tp, def), d.mem);
      if (urgent || (d.f >= d.rest && !conducted(sc, d.i))) choose(sc, b, d, def, tp);
      break;
    }
    case 'attack': attackFrame(sc, b, d, def, tp); break;
    case 'dead': d.f++; b.t = Math.max(0, def.deathFrames - d.f) / 60; b.vx = 0; break;
  }
  arenaStep(sc, 'b', d.i);
  const kh = kindHook(sc, b, d, def); kh.k?.frame?.(kh.api);
}

function toIdle(sc: World, d: DState, def: BossDef, b: Boss): void {
  const finished = d.chain;
  d.mode = 'idle'; d.f = 0; d.atk = null; d.chain = null; d.enter = false;
  const r = policyOf(def, b.phase || 1).restFrames;
  d.rest = r[0] + Math.floor(sc.rBoss() * (r[1] - r[0] + 1));
  if (finished) condOnChainEnd(sc, d.i, finished);
}
/** Рёв и сцена позади: применяем тело фазы, затем переходный приём (или покой) */
function afterScene(sc: World, b: Boss, d: DState, def: BossDef): void {
  applyFormNow(sc, b, d, def);
  const ps = def.phases[(b.phase || 1) - 1]!;
  const kh = kindHook(sc, b, d, def); kh.k?.onPhase?.(kh.api, b.phase || 1);
  if (b.state === 'rage') b.state = 'idle';
  if (ps.enterChain) startChain(sc, b, d, def, ps.enterChain, true); else toIdle(sc, d, def, b);
}
/** (е) счёт кадров «герой рядом с боссом и не получает урона»; в вступлении, рёве и сцене не идёт. У неподвижного босса дистанция не ограничивает: стоять вдали, куда он не достаёт, нельзя */
function trackCalm(sc: World, d: DState, def: BossDef, dx: number, still: boolean): void {
  const cfg = resolveAnti(def), ac = d.ac;
  const php = sc.players.reduce((n, p) => n + (p.downed ? 0 : p.hp), 0), hurt = ac.php >= 0 && php < ac.php;
  ac.php = php;
  ac.calm = cfg && (d.mode === 'idle' || d.mode === 'attack') && (still || dx <= cfg.relocate.dist) && !hurt ? ac.calm + 1 : 0;
}
/** (д) самооглушение босса от удара о стену на рывке; с откатом */
function wallStun(sc: World, b: Boss, d: DState, def: BossDef, vx0: number): void {
  const cfg = resolveAnti(def), ws = cfg?.wallStun;
  if (!cfg || !ws || d.mode !== 'attack' || b.state !== 'active' || b.stagger > 0) return;
  if (!((vx0 > 0 && b.hitR) || (vx0 < 0 && b.hitL)) || Math.abs(vx0) < ws.minSpeed || d.ac.clk < d.ac.wallCd) return;
  d.ac.wallCd = d.ac.clk + framesOf(ws.cooldownSec);
  b.stagger = ws.sec * staggerBegin(d.ac, cfg, b.hp); b['poise'] = 0; b['executed'] = false; b.flash = 0.1;
  sc.sfx('stagger'); sc.shake(200, 0.01); sc.burst(18, b.x + b.w / 2, b.y + 10, 0xffd47a);
  onStagger(b); onStaggerWorld(sc, b);
}
/** Запустить связку сразу, минуя выбор (тренировка, дирижёр и инструменты проверки): false, если босс не в бою или связки нет. */
export function forceChain(sc: World, i: number, chainId: string): boolean {
  const b = sc.bosses[i]; if (!b || !isDataBoss(b)) return false;
  const d = dstate(b), def = bossDef(d.id)!;
  if (!def.chains.some((c) => c.id === chainId) || d.mode === 'dead' || d.mode === 'intro' || b.stagger > 0) return false;
  startChain(sc, b, d, def, chainId, true);
  return true;
}
/** Боевой приказ в отличие от отладочного force уважает фазу, форму и объявленный режим условий. */
export function commandChain(sc: World, i: number, chainId: string, mode: 'scripted' | 'policy' = 'scripted'): boolean {
  const b = sc.bosses[i]; if (!b || !isDataBoss(b) || b.stagger > 0) return false;
  const d = dstate(b), def = bossDef(d.id)!, c = def.chains.find((x) => x.id === chainId);
  if (!c || d.mode !== 'idle') return false;
  const [tp] = sc.nearestPlayer(centerX(b), b.y + b.h / 2), ctx = ctxOf(sc, b, d, tp, def), set = effForm(def, d.formPh).attacks;
  if (!meets(c.requires, ctx, mode === 'policy') || c.steps.some((s) => (set && !set.has(s.attack)) || !meets(attackOf(def, s.attack).requires, ctx, false))) return false;
  if (mode === 'policy' && !chainAllowed(def, c, ctx, d.mem)) return false;
  if (kindOf(def.id)?.allow?.(apiOf(sc, b, d, def), chainId) === false) return false;
  startChain(sc, b, d, def, chainId, mode === 'scripted'); return true;
}
function choose(sc: World, b: Boss, d: DState, def: BossDef, tp: Player | null): void {
  const ctx = ctxOf(sc, b, d, tp, def), k = kindOf(def.id);
  const id = pickChain(def, ctx, d.mem, sc.rBoss());
  if (!id || (k?.allow && !k.allow(apiOf(sc, b, d, def), id))) { d.f = 0; d.rest = 20; return; } // «сухое правило»: подходящих нет — подождать
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
  d.serial = (d.serial ?? 0) + 1;
  d.mode = 'attack'; d.atk = id; d.af = 0; d.hits = []; d.mdir = {}; d.punish = false;
  d.cue = { color: a.tell.cue.color, left: a.tell.frames, total: a.tell.frames };
  if (a.tell.lockFace && tp) b.face = tp.x + 7 > centerX(b) ? 1 : -1;
  d.dir = b.face; d.lock = { x: tp ? tp.x + 7 : centerX(b) + b.face * 100, y: tp ? tp.y + 13 : b.y + b.h / 2 };
  sc.sfx(a.tell.cue.sfx);
  const kinds = [...a.active.map((x) => x.kind), ...a.spawn.map((x) => x.kind)];
  if (kinds.includes('unblockable')) sc.sfx('tellUnblockable');
  else if (kinds.includes('dodge')) sc.sfx('tellDodge');
  else if (kinds.includes('parry')) sc.sfx('tellParry');
  if (d.chain) arenaOnStep(sc, d.i, d.chain, d.step);
  const kh = kindHook(sc, b, d, def); kh.k?.onAttack?.(kh.api, id);
}

function attackFrame(sc: World, b: Boss, d: DState, def: BossDef, tp: Player | null): void {
  const a = attackOf(def, d.atk!), c = chainOf(def, d.chain!);
  const T0 = a.tell.frames, end = activeEnd(a), af = d.af, e = effForm(def, d.formPh);
  if (af < T0) {
    b.state = 'tell'; b.t = (T0 - af) / 60; if (d.cue) d.cue.left = T0 - af;
    const tracking = af < T0 - (a.tell.commitFrames ?? 0);
    if (tracking && !a.tell.lockFace && tp) b.face = tp.x + 7 > centerX(b) ? 1 : -1;
    if (b.onGround || e.fly) b.vx = 0;
    d.dir = b.face; if (tracking) d.lock = { x: tp ? tp.x + 7 : d.lock.x, y: tp ? tp.y + 13 : d.lock.y };
  } else {
    const t = af - T0;
    if (t <= end) {
      b.state = 'active'; d.cue = null; d.punish = false; b.t = (end - t) / 60;
      if (t === 0) b.face = d.dir;
      runActive(sc, b, d, def, a, t);
    } else {
      const r = t - end - 1, last = d.step >= c.steps.length - 1;
      b.state = 'recover'; d.cue = null; if (b.onGround || e.fly) b.vx = 0;
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

function runActive(sc: World, b: Boss, d: DState, def: BossDef, a: Attack, t: number): void {
  const cx = centerX(b), e = effForm(def, d.formPh);
  // движение (неподвижный босс не двигается; у летающего vy — непрерывная вертикальная скорость)
  let moving = false;
  if (!e.still) a.move.forEach((m, mi) => {
    if (t < m.from || t > m.to) return;
    moving = true;
    if (d.mdir[mi] === undefined) {
      const [tp] = sc.nearestPlayer(cx, b.y + b.h / 2);
      d.mdir[mi] = m.toward === 'facing' ? d.dir : m.toward === 'fixed' ? 1 : m.toward === 'wall' ? (cx < (sc.L.W * T) / 2 ? -1 : 1) : tp ? (tp.x + 7 > cx ? 1 : -1) : b.face;
      if (m.vy !== 0 && !e.fly) b.vy = m.vy;
    }
    b.vx = d.mdir[mi]! * m.vx;
    if (e.fly && m.vy !== 0) { b.vy = m.vy; d.flyMove = true; }
  });
  if (!moving && (b.onGround || e.fly)) b.vx = 0;
  // удары
  a.active.forEach((h, ai) => {
    if (t < h.from || t > h.to) return;
    const box = boxRect(b, d.dir, h.hit, d.lock);
    for (const p of sc.players) {
      if (p.remote || p.downed || p.inv > 0) continue;
      const key = `${ai}:${p.i}`;
      const touches = h.shape === 'circle' ? shapeHits({ type: 'circle', x: box.x + box.w / 2, y: box.y + box.h / 2, radius: Math.min(box.w, box.h) / 2 }, inset(p, 2)) : overlap(inset(p, 2), box);
      if (d.hits.includes(key) || !touches) continue;
      d.hits.push(key);
      const hurt0 = p.hurtT;
      hurtPlayer(sc, p, h.dmg, box.x + box.w / 2, false, h.kind, { boss: b });
      if (h.knock && p.hurtT > hurt0) { p.kbx = (Math.sign(p.x + 7 - cx) || d.dir) * h.knock.vx; p.vy = h.knock.vy; }
    }
  });
  // снаряды, призывы, запуск сущностей арены, особые эффекты
  for (const s of a.spawn) if (s.at === t) spawnProj(sc, b, d, s);
  for (const s of a.summon) if (s.at === t) for (let k = 0; k < s.count; k++) spawnCreature(sc, d.i, s.creature, cx + d.dir * (s.ox + k * 30), b.y + b.h / 2 + s.oy);
  for (const f of a.fire) if (f.at === t) arenaFire(sc, f.ent, 'b', d.i);
  const kind = kindOf(def.id);
  for (const f of a.fx) if (f.at === t) kind?.fx?.[f.name]?.(apiOf(sc, b, d, def), f.args);
}

function spawnProj(sc: World, b: Boss, d: DState, s: Attack['spawn'][number]): void {
  const cx = centerX(b), cy = b.y + b.h / 2, f = d.dir, [tp] = sc.nearestPlayer(cx, cy);
  const base = s.from === 'target' ? { x: d.lock.x + s.ox, y: d.lock.y + s.oy } : { x: cx + f * s.ox, y: cy + s.oy };
  let vx = s.from === 'target' ? s.vx : f * s.vx, vy = s.vy;
  if (s.aim && s.aimTarget === 'locked') {
    const dx = d.lock.x - base.x, dy = d.lock.y - base.y, len = Math.hypot(dx, dy), speed = Math.hypot(s.vx, s.vy);
    vx = len ? dx / len * speed : f * speed; vy = len ? dy / len * speed : 0;
  } else if (s.aim && tp) { const v = aimAt(base, tp, Math.hypot(s.vx, s.vy), f); vx = v.vx; vy = v.vy; }
  fireShots(sc, base, vx, vy, s, d.i, d.serial);
}

// ---------- телеграф для отрисовки ----------
export interface DrawBox { r: Rect; kind: HitKind; shape?: 'circle' }
/** Прямоугольники ударов текущей атаки: в замахе — предупреждение (где ударит), в активных кадрах — живые. */
export function liveBoxes(sc: World, b: Boss): DrawBox[] {
  const d = b['d'] as DState | undefined; if (!d || d.mode !== 'attack' || !d.atk) return [];
  const a = attackOf(bossDef(d.id)!, d.atk), out: DrawBox[] = [];
  if (b.state === 'tell') {
    for (const h of a.active) out.push({ r: boxRect(b, b.face, h.hit, d.lock), kind: h.kind, ...(h.shape ? { shape: h.shape } : {}) });
  } else if (b.state === 'active') {
    const t = d.af - 1 - a.tell.frames;
    for (const h of a.active) if (t >= h.from && t <= h.to) out.push({ r: boxRect(b, d.dir, h.hit, d.lock), kind: h.kind, ...(h.shape ? { shape: h.shape } : {}) });
  }
  return out;
}
/** Кадровые данные текущей атаки для тренировки: какая атака, какой кадр (от начала замаха), часть, тип ближайшего удара, окно наказания. */
export interface FrameInfo { attack: string; chain: string | null; step: number; frame: number; total: number; part: 'tell' | 'active' | 'recover'; kind: HitKind | null; hitIn: number | null; punish: boolean }
export function frameInfo(b: Boss): FrameInfo | null {
  const d = b['d'] as DState | undefined; if (!d || d.mode !== 'attack' || !d.atk) return null;
  const a = attackOf(bossDef(d.id)!, d.atk), T0 = a.tell.frames, end = activeEnd(a), af = d.af;
  const ev = attackEvents(a), next = ev.find((e) => e.t >= af) ?? ev[ev.length - 1];
  return {
    attack: a.name ?? a.id, chain: d.chain, step: d.step, frame: af, total: T0 + Math.max(0, end) + 1 + a.recovery.frames,
    part: af < T0 ? 'tell' : af - T0 <= end ? 'active' : 'recover', kind: (next?.kind as HitKind | undefined) ?? null, hitIn: next && next.t >= af ? next.t - af : null, punish: d.punish,
  };
}
/** Название текущей атаки (тренировка показывает его в телеграфе) или null. */
export function currentAttackName(b: Boss): string | null {
  const d = b['d'] as DState | undefined; if (!d || !d.atk) return null;
  const a = attackOf(bossDef(d.id)!, d.atk);
  return a.name ?? a.id;
}

// ---------- уязвимые точки ----------
/** Прямоугольник точки в мире */
export function weakRect(b: Boss, w: Weak): Rect {
  const x = w.mirror && b.face < 0 ? b.x + b.w - w.box.x - w.box.w : b.x + w.box.x;
  return { x, y: b.y + w.box.y, w: w.box.w, h: w.box.h };
}
/** Кадров в текущем состоянии босса (для окон from/to) */
function stateFrames(b: Boss, d: DState, a: Attack | null): number {
  if (!a) return d.f;
  const T0 = a.tell.frames, end = Math.max(0, activeEnd(a));
  if (b.state === 'tell') return d.af;
  if (b.state === 'active') return d.af - 1 - T0;
  if (b.state === 'recover') return d.af - 1 - T0 - end - 1;
  return d.f;
}
/** Точка открыта сейчас? Окон нет — открыта всегда; окна объединяются по «или». */
export function weakOpen(b: Boss, w: Weak): boolean {
  const d = dstate(b); if (!w.open.length || b.stagger > 0) return true;
  const def = bossDef(d.id)!, a = d.atk ? attackOf(def, d.atk) : null, sf = stateFrames(b, d, a);
  for (const o of w.open) {
    if (o.attack && d.atk !== o.attack) continue;
    const st = b.state, pw = a?.recovery.punishWindow;
    const inState = o.on === 'always' || (o.on === 'idle' ? d.mode === 'idle' : o.on === 'punish' ? d.punish : o.on === 'stagger' ? b.stagger > 0 : st === o.on);
    if (!inState) continue;
    // окно punish считается от начала окна наказания
    const f = o.on === 'punish' && pw && a ? sf - pw.from : sf;
    if (o.from !== undefined && f < o.from) continue;
    if (o.to !== undefined && f > o.to) continue;
    return true;
  }
  return false;
}
/** Точки тела босса сейчас: прямоугольник и открыта ли (для отрисовки и инструментов) */
export function weakStates(b: Boss): { w: Weak; r: Rect; open: boolean }[] {
  const d = b['d'] as DState | undefined; if (!d) return [];
  const e = effForm(bossDef(d.id)!, d.formPh);
  return e.weak.map((w) => ({ w, r: weakRect(b, w), open: weakOpen(b, w) }));
}
/** Сколько единиц урона получит босс от этого удара: 0 — броня (бьют не в открытую точку), иначе hits точки. Оглушённый броню теряет. */
function weakHits(sc: World, b: Boss, d: DState, def: BossDef, p: Player, hit: BossHit): number {
  const e = effForm(def, d.formPh);
  if (!e.weak.length || b.stagger > 0 || hit.weak === 'bypass') return 1;
  const swing = p.atkT > 0 && !!p.atkHits && !p['noSilkGain'];
  const shape = hit.shape ?? (swing ? { type: 'rect' as const, rect: atkBox(sc, p) } : null);
  if (hit.weak === 'geometry' && !shape) return 0;
  let best = 0;
  for (const w of e.weak) {
    if (!weakOpen(b, w)) continue;
    if (shape && !shapeHits(shape, weakRect(b, w))) continue;
    best = Math.max(best, w.hits);
  }
  return best;
}

// ---------- урон по боссу, фазы, смерть ----------
function barSet(sc: World, def: BossDef): void { sc.bossBar(true, def.name, barFrac(sc)); }
/** Исходная функция урона (RAW) — вызывается слоями damage.ts. */
export function rawData(sc: World, key: BossRef, p: Player, hit: BossHit = {}): HitResult {
  const immune: HitResult = { outcome: 'immune', damage: 0 };
  const i = dataIdx(key), b = sc.bosses[i]; if (!b || !sc.auth()) return immune;
  const d = dstate(b), def = bossDef(d.id)!;
  if (['rage', 'dead', 'intro', 'sleep', 'gone'].includes(b.state) || d.mode === 'scene' || (b.stagger > 0 && !dataStaggerRoom(b))) { sc.snd('clink'); return immune; }
  const amount = hit.amount ?? 1;
  if (!Number.isFinite(amount) || amount <= 0) return immune;
  const khGuard = kindHook(sc, b, d, def);
  const replyGuard = khGuard.k?.guard?.(khGuard.api, hit);
  if (replyGuard && forceChain(sc, i, replyGuard)) {
    sc.snd('clink'); sc.parts(8, b.x + b.w / 2, b.y + 35, 0xffffff);
    return { outcome: 'armor', damage: 0 };
  }
  const n = weakHits(sc, b, d, def, p, hit);
  if (n <= 0) { // броня: звон, искры, подсказка
    sc.snd('clink'); sc.parts(8, clamp(p.x + 7 + p.face * 26, b.x, b.x + b.w), b.y + b.h / 2, 0xffe3a3); if (!p.remote) sc.hitstop = 0.03;
    if (!d.hinted && !p.remote) { d.hinted = true; sc.toast('Броня: бей в светящуюся уязвимую точку', 3); }
    return { outcome: 'armor', damage: 0 };
  }
  let damage = n * amount;
  const cfg = resolveAnti(def);
  if (b.stagger > 0 && cfg && d.ac.stgHp0 >= 0) damage = Math.min(damage, Math.max(0, staggerCap(cfg, b.maxHp) - (d.ac.stgHp0 - b.hp)));
  damage = Math.min(damage, Math.max(0, b.hp));
  if (damage <= 0) return immune;
  b.hp -= damage; b.flash = 0.09; gainSilk(sc, p, true); if (!p.remote) sc.hitstop = 0.04; sc.sfx(bossHitSnd(sc, key, p));
  sc.burst(9, clamp(p.x + 7 + p.face * 26, b.x, b.x + b.w), b.y + b.h / 2, 0xf4f1e6);
  if (sc.cond) { // общий пул: здоровье у всех одно
    const cd = bossDef(dstate(sc.bosses[0]!).id)!.conductor!;
    if (cd.pool) for (const o of sc.bosses) if (o !== b && o.state !== 'dead') o.hp = Math.min(o.hp, b.hp);
  }
  barSet(sc, def);
  const changedPhase = checkPhase(sc, b, def.name, !!def.phases[phaseOf(b) - 1]?.silent);
  if (changedPhase) beginPhase(sc, b, d, def);
  if (b.hp <= 0 && b.state !== 'dead') dataDie(sc, i);
  if (!changedPhase && b.hp > 0 && b.stagger <= 0 && (d.mode === 'attack' || d.mode === 'idle')) {
    const kh = kindHook(sc, b, d, def), reply = kh.k?.onDamage?.(kh.api, damage);
    const chain = reply ? def.chains.find((c) => c.id === reply) : null;
    const set = effForm(def, d.formPh).attacks;
    if (chain && meets(chain.requires, ctxOf(sc, b, d, sc.nearestPlayer(centerX(b), b.y)[0], def), false)
      && chain.steps.every((s) => (!set || set.has(s.attack)) && meets(attackOf(def, s.attack).requires, ctxOf(sc, b, d, null, def), false))) {
      // Ответ отменяет старые опасности, но не отменяет нанесённый героем урон.
      onStaggerWorld(sc, b);
      startChain(sc, b, d, def, chain.id, true);
    }
  }
  return { outcome: 'damage', damage };
}
/** Фаза началась по урону: рёв (или без него, если silent), затем сцена и переходный приём */
function beginPhase(sc: World, b: Boss, d: DState, def: BossDef): void {
  const ps = def.phases[(b.phase || 1) - 1]!;
  b.stagger = 0; b['poise'] = 0; b.vy = 0;
  d.atk = null; d.chain = null; d.punish = false; d.cue = null; d.hits = []; d.enter = false; b.vx = 0; d.f = 0;
  onStaggerWorld(sc, b);
  if (ps.silent) {
    b.state = 'idle'; d.mode = 'idle';
    if (ps.scene) { d.mode = 'scene'; b.state = 'rage'; b.t = ps.scene.frames / 60; } else afterScene(sc, b, d, def);
    return;
  }
  d.mode = 'rage'; b.t = ps.rageFrames / 60;
}
/** Перевести босса i в фазу ph тем же путём, что и урон (рёв, сцена, переходный приём): здоровье опускается к порогу фазы. Для тренировки и проверки переходов. */
export function enterPhase(sc: World, i: number, ph: number): boolean {
  const b = sc.bosses[i]; if (!b) return false;
  const d = dstate(b), def = bossDef(d.id)!, ps = def.phases[ph - 1]; if (!ps || ph <= (b.phase || 1) || d.mode === 'dead') return false;
  b.hp = Math.min(b.hp, Math.max(1, Math.floor(b.maxHp * ps.fromHp)));
  if (!checkPhase(sc, b, def.name, !!def.phases[phaseOf(b) - 1]?.silent)) return false;
  beginPhase(sc, b, d, def);
  return true;
}
/** Хук оглушения (bosses2.poiseAdd): текущая атака обрывается, после оглушения босс снова в покое. */
export function onStagger(b: Boss): void {
  const d = b['d'] as DState | undefined; if (!d || d.mode === 'dead') return;
  if (d.mode === 'attack' || d.mode === 'idle') { d.mode = 'idle'; d.f = 0; d.rest = 24; d.atk = null; d.chain = null; d.punish = false; d.cue = null; d.enter = false; }
}
/** Оглушение босса i: сущности арены, запущенные его связкой, гаснут (вызывает bosses2.poiseAdd через onStagger-хук мира) */
export function onStaggerWorld(sc: World, b: Boss): void {
  const d = b['d'] as DState | undefined; if (!d) return;
  arenaAbort(sc, d.i);
  for (const pr of sc.projs) if (pr.o === d.i && pr.attackId === d.serial && projReg.get(pr.kind)?.cancelOnInterrupt) pr.dead = true;
}
// ---------- защита от читов: хуки для общей стойки (bosses2.ts) ----------
/** во сколько раз порог стойки выше обычного (убывающая отдача оглушений) */
export function dataPoiseMul(b: Boss): number { const d = b['d'] as DState | undefined; return d ? poiseMulOf(d.ac, resolveAnti(bossDef(d.id)!)) : 1; }
/** оглушение началось: множитель его длительности; открывает окно потолка урона */
export function dataStaggerBegin(b: Boss): number { const d = b['d'] as DState | undefined; return d ? staggerBegin(d.ac, resolveAnti(bossDef(d.id)!), b.hp) : 1; }
/** можно ли ещё наносить урон оглушённому боссу (потолок за окно оглушения) */
export function dataStaggerRoom(b: Boss): boolean { const d = b['d'] as DState | undefined; return !d || staggerRoom(d.ac, resolveAnti(bossDef(d.id)!), b.hp, b.maxHp); }

export function dataDie(sc: World, i: number): void {
  if (!deathIsFinal(sc, i)) { memberDie(sc, i); barSet(sc, bossDef(dstate(sc.bosses[i]!).id)!); return; }
  bossDeath(sc, dstate(sc.bosses[0]!).id, (s) => dieBase(s, i)); // награда и способность — за ведущего босса боя
}
/** Босс пал: состояние и хук kinds; final — бой на этом кончается (громкая смерть), иначе тише */
function memberDie(sc: World, i: number, final = false): void {
  const b = sc.bosses[i]!, d = dstate(b), def = bossDef(d.id)!;
  b.state = 'dead'; d.mode = 'dead'; d.f = 0; d.atk = null; d.cue = null; d.punish = false; b.vx = 0; b.t = def.deathFrames / 60;
  if (sc.cond) b.hp = Math.min(b.hp, 0);
  onStaggerWorld(sc, b);
  sc.sfx('roar'); if (final) sc.shake(700, 0.008); else sc.shake(400, 0.006);
  sc.emit('bossBursts', { x: b.x, y: b.y, w: b.w, h: b.h });
  const kh = kindHook(sc, b, d, def); kh.k?.onDeath?.(kh.api);
}
function dieBase(sc: World, i: number): void {
  const live = sc.bosses.map((b, j) => (j !== i && b.state !== 'dead' ? j : -1)).filter((j) => j >= 0);
  sc.bosses[i]!.state = 'dead';
  if (sc.cond) sc.cond.over = true;
  arenaClear(sc);
  sc.bossDead = true; bossDeathFx(sc);
  for (const pr of sc.projs) pr.dead = true;
  memberDie(sc, i, true);
  for (const j of live) memberDie(sc, j, true);
  sc.after(Math.max(...sc.bosses.map((b) => bossDef(dstate(b).id)!.deathFrames)) / 60 + 0.7, () => { sc.bossBar(false); winGame(sc); });
}
