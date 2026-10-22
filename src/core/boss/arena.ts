// Сущности арены по расписанию (волна 0): платформы, барьеры, лучи и зоны урона, точки появления снарядов и существ.
// Описываются в data/bosses/<id>.json, раздел arena: { level, ents }; запускаются началом боя, фазой, шагом связки или вручную (attack.fire, дирижёр).
// Состояние лежит в sc.arena обычными данными (копируется ботом вместе с миром). Платформы и барьеры — динамические тайлы мира (sc.dyn):
// герой, боссы и снаряды сталкиваются с ними через те же tileAt/isSolid, что и с картой; ход платформы идёт по клеткам, герой на ней едет вместе с ней.
// Время расписания — кадры: у привязанных к связке и к attack.fire — кадры исполнителя босса-хозяина (замедление босса замедляет и их), у остальных — кадры мира.
import { PLAT, SOLID, T } from '../balance';
import { hurtPlayer } from '../damage';
import type { Rect } from '../types';
import type { World } from '../world';
import { inset, overlap } from '../world';
import { dstate } from './shared';
import { spawnCreature } from './minions';
import { aimAt, fireShots } from './shared';
import { bossDef } from './registry';
import { arenaEnts, arenaLevel, type Area, type ArenaEnt } from './schema';

export type Clk = 'b' | 'w';
export interface StrikeRt { rect: Rect; aim: boolean; tell: number; active: number; f: number; hits: number[]; hit: 'parry' | 'dodge' | 'unblockable'; dmg: number }
export interface EntRt {
  own: number; id: string; kind: ArenaEnt['kind'];
  on: boolean; clk: Clk; t: number; next: number;
  /** платформа и барьер: видна, положение в клетках, размер в клетках */
  shown: boolean; tx: number; ty: number; tw: number; th: number;
  /** кадров до появления / исчезновения (мерцающий контур), 0 — нет */
  warnShow: number; warnHide: number; pend: boolean;
  mv: { dx: number; dy: number; tx: number; ty: number; every: number; wait: number } | null;
  strikes: StrikeRt[];
  /** точка появления: отложенные выстрелы */
  q: { due: number; op: number; kind: string }[];
}
export interface ArenaRt {
  /** левая внутренняя стена, px */
  x0: number;
  /** поверхность пола, px */
  floor: number;
  /** правая внутренняя стена, px */
  x1: number;
  ents: EntRt[];
}

/** прямоугольник арены (x от левой стены, y от пола вверх до нижней грани) → мир */
export const worldRect = (A: { x0: number; floor: number }, a: Area): Rect => ({ x: A.x0 + a.x, y: A.floor - a.y - a.h, w: a.w, h: a.h });

/** определение сущности по её состоянию */
export function entDef(sc: World, e: EntRt): ArenaEnt | undefined {
  const b = sc.bosses[e.own]; if (!b) return undefined;
  const def = bossDef(dstate(b).id); if (!def) return undefined;
  return arenaEnts(def).find((x) => x.id === e.id);
}

/** Построить арену по боссам мира (ведущий и участники): вызывать после создания всех боссов. */
export function makeArena(sc: World): void {
  sc.arena = null; sc.dyn = null;
  const lead = sc.bosses[0] && bossDef(dstate(sc.bosses[0]).id); if (!lead) return;
  const sp = sc.L[arenaLevel(lead) as 'misha' | 'vladik' | 'tima']; if (!sp) return;
  const floor = (sp.y + 1) * T, ents: EntRt[] = [];
  sc.bosses.forEach((b, own) => {
    const def = bossDef(dstate(b).id); if (!def) return;
    for (const d of arenaEnts(def)) {
      const e: EntRt = { own, id: d.id, kind: d.kind, on: false, clk: 'w', t: 0, next: 0, shown: false, tx: 0, ty: 0, tw: 0, th: 0, warnShow: 0, warnHide: 0, pend: false, mv: null, strikes: [], q: [] };
      if (d.kind === 'platform' || d.kind === 'barrier') { e.tx = Math.round((T + d.area.x) / T); e.ty = Math.round((floor - d.area.y - d.area.h) / T); e.tw = Math.round(d.area.w / T); e.th = Math.round(d.area.h / T); e.shown = d.shown; }
      ents.push(e);
    }
  });
  if (!ents.length) return;
  sc.arena = { x0: T, x1: (sc.L.W - 1) * T, floor, ents };
  rebuildDyn(sc);
}

// ---------- динамические тайлы ----------
/** Собрать sc.dyn из видимых платформ и барьеров. Клетка платформы — PLAT (снизу проходима), барьера и solid-платформы — SOLID. */
export function rebuildDyn(sc: World): void {
  const A = sc.arena; if (!A) { sc.dyn = null; return; }
  const m = new Map<number, number>();
  for (const e of A.ents) {
    if (!e.shown || (e.kind !== 'platform' && e.kind !== 'barrier')) continue;
    const d = entDef(sc, e); if (!d || (d.kind !== 'platform' && d.kind !== 'barrier')) continue;
    const t = d.kind === 'barrier' || d.solid ? SOLID : PLAT;
    for (let y = e.ty; y < e.ty + e.th; y++) for (let x = e.tx; x < e.tx + e.tw; x++) {
      const k = y * sc.L.W + x, o = m.get(k);
      if (o === undefined || t === SOLID) m.set(k, t);
    }
  }
  sc.dyn = m.size ? m : null;
}

const px = (e: EntRt): Rect => ({ x: e.tx * T, y: e.ty * T, w: e.tw * T, h: e.th * T });
/** тела, которые нельзя замуровать: живые герои, боссы и существа */
function bodiesIn(sc: World, r: Rect): boolean {
  for (const p of sc.players) if (!p.downed && overlap(inset(p, 1), r)) return true;
  for (const b of sc.bosses) if (b.state !== 'dead' && overlap(b, r)) return true;
  for (const en of sc.enemies) if (!en.dead && en['m'] && overlap(en, r)) return true;
  return false;
}

// ---------- запуск ----------
function startRun(sc: World, e: EntRt, clk: Clk): void {
  const d = entDef(sc, e); if (!d) return;
  e.on = true; e.clk = clk; e.t = 0; e.next = 0; e.strikes = []; e.q = []; e.warnShow = 0; e.warnHide = 0; e.pend = false; e.mv = null;
  if (d.kind === 'platform' || d.kind === 'barrier') {
    e.tx = Math.round((T + d.area.x) / T); e.ty = Math.round((sc.arena!.floor - d.area.y - d.area.h) / T);
    const was = e.shown; e.shown = d.shown; if (was !== e.shown) rebuildDyn(sc);
  }
}
/** сущности босса own с bind.start — с началом боя (после его вступления) */
export function arenaOnStart(sc: World, own: number): void {
  const A = sc.arena; if (!A) return;
  for (const e of A.ents) { const d = entDef(sc, e); if (e.own === own && d?.bind?.start) startRun(sc, e, 'w'); }
}
/** фаза ph босса own началась: сущности этой фазы запускаются заново, сущности других фаз гаснут */
export function arenaOnPhase(sc: World, own: number, ph: number): void {
  const A = sc.arena; if (!A) return;
  for (const e of A.ents) {
    const d = entDef(sc, e); if (e.own !== own || !d?.bind?.phase) continue;
    if (d.bind.phase.includes(ph)) startRun(sc, e, 'w'); else stopEnt(sc, e);
  }
}
/** начался шаг step связки chain босса own: привязанные к нему сущности стартуют (часы — кадры босса) */
export function arenaOnStep(sc: World, own: number, chain: string, step: number): void {
  const A = sc.arena; if (!A) return;
  for (const e of A.ents) { const d = entDef(sc, e); if (e.own === own && d?.bind?.chain === chain && (d.bind.step ?? 0) === step) startRun(sc, e, 'b'); }
}
/** запустить сущность по id (attack.fire — часы босса own; дирижёр — часы мира) */
export function arenaFire(sc: World, id: string, clk: Clk, own = 0): void {
  const A = sc.arena; if (!A) return;
  const e = A.ents.find((x) => x.id === id && x.own === own) ?? A.ents.find((x) => x.id === id);
  if (e) startRun(sc, e, clk);
}
/** остановить: платформа исчезает, лучи гаснут */
function stopEnt(sc: World, e: EntRt): void {
  e.on = false; e.strikes = []; e.q = []; e.warnShow = 0; e.warnHide = 0; e.pend = false; e.mv = null;
  if (e.shown) { e.shown = false; rebuildDyn(sc); }
}
/** обрыв связки (оглушение босса): всё, что запущено её часами, гаснет */
export function arenaAbort(sc: World, own: number): void {
  const A = sc.arena; if (!A) return;
  for (const e of A.ents) if (e.own === own && e.clk === 'b' && (e.on || e.strikes.length || e.q.length)) {
    const d = entDef(sc, e);
    if (d?.bind?.chain || d?.bind === undefined) stopEnt(sc, e);
  }
}
/** конец боя: арена пуста */
export function arenaClear(sc: World): void {
  const A = sc.arena; if (!A) return;
  for (const e of A.ents) { e.on = false; e.strikes = []; e.q = []; e.warnShow = 0; e.warnHide = 0; e.mv = null; e.shown = false; }
  rebuildDyn(sc);
}

// ---------- шаг ----------
/** кадр сущностей: clk 'b' — кадр босса own, 'w' — кадр мира */
export function arenaStep(sc: World, clk: Clk, own: number): void {
  const A = sc.arena; if (!A) return;
  for (const e of A.ents) {
    if (e.clk !== clk || (clk === 'b' && e.own !== own)) continue;
    const d = entDef(sc, e); if (!d) continue;
    if (d.kind === 'platform' || d.kind === 'barrier') stepPlat(sc, e, d);
    else if (d.kind === 'beam') stepBeam(sc, e, d);
    else stepSpawner(sc, e, d);
    if (!e.on) continue;
    e.t++;
    if (d.loop !== undefined && e.t >= d.loop) { e.t = 0; e.next = 0; }
    else if (e.next >= d.timeline.length && !busy(e)) e.on = false;
  }
}
const busy = (e: EntRt): boolean => e.strikes.length > 0 || e.q.length > 0 || e.warnShow > 0 || e.warnHide > 0 || e.pend || !!e.mv;

function stepPlat(sc: World, e: EntRt, d: Extract<ArenaEnt, { kind: 'platform' | 'barrier' }>): void {
  if (e.on) while (e.next < d.timeline.length && d.timeline[e.next]!.at <= e.t) {
    const op = d.timeline[e.next++]!;
    if (op.op === 'show') { if (op.warn > 0) e.warnShow = op.warn; else e.pend = true; }
    else if (op.op === 'hide') { if (op.warn > 0) e.warnHide = op.warn; else if (e.shown) { e.shown = false; rebuildDyn(sc); } }
    else {
      const A = sc.arena!, tx = Math.round((T + op.to.x) / T), ty = Math.round((A.floor - op.to.y - d.area.h) / T);
      const steps = Math.max(Math.abs(tx - e.tx), Math.abs(ty - e.ty));
      if (steps > 0) e.mv = { dx: Math.sign(tx - e.tx), dy: Math.sign(ty - e.ty), tx, ty, every: Math.max(1, Math.ceil(op.frames / steps)), wait: 0 };
    }
  }
  if (e.warnShow > 0 && --e.warnShow === 0) e.pend = true;
  if (e.pend && e.warnShow === 0) {
    const solid = d.kind === 'barrier' || d.solid;
    if (!solid || !bodiesIn(sc, px(e))) { e.pend = false; if (!e.shown) { e.shown = true; rebuildDyn(sc); sc.emit('arenaFx', { what: 'show', x: e.tx * T, y: e.ty * T, w: e.tw * T, h: e.th * T }); } }
  }
  if (e.warnHide > 0 && --e.warnHide === 0 && e.shown) { e.shown = false; rebuildDyn(sc); }
  if (e.mv && --e.mv.wait <= 0) movePlat(sc, e, d);
}
function movePlat(sc: World, e: EntRt, d: Extract<ArenaEnt, { kind: 'platform' | 'barrier' }>): void {
  const m = e.mv!, solid = d.kind === 'barrier' || d.solid;
  const nx = e.tx + (e.tx === m.tx ? 0 : m.dx), ny = e.ty + (e.ty === m.ty ? 0 : m.dy);
  const to: Rect = { x: nx * T, y: ny * T, w: e.tw * T, h: e.th * T };
  if (e.shown && solid && bodiesIn(sc, to)) { m.wait = 1; return; } // не давить: ждём, пока освободят место
  if (e.shown) carry(sc, e, nx - e.tx, ny - e.ty);
  e.tx = nx; e.ty = ny; m.wait = m.every;
  if (e.shown) rebuildDyn(sc);
  if (e.tx === m.tx && e.ty === m.ty) e.mv = null;
}
/** тела на верхней грани платформы едут вместе с ней */
function carry(sc: World, e: EntRt, dx: number, dy: number): void {
  const top = e.ty * T, l = e.tx * T, r = (e.tx + e.tw) * T;
  const ride = (o: { x: number; y: number; w: number; h: number }): boolean => Math.abs(o.y + o.h - top) <= 3 && o.x + o.w > l && o.x < r;
  for (const p of sc.players) if (!p.downed && ride(p)) { const q = { x: p.x + dx * T, y: p.y + dy * T, w: p.w, h: p.h }; if (!sc.solidRect(q)) { p.x = q.x; p.y = q.y; p.safeX = p.x; p.safeY = p.y; } }
  for (const b of sc.bosses) if (b.state !== 'dead' && ride(b)) { const q = { x: b.x + dx * T, y: b.y + dy * T, w: b.w, h: b.h }; if (!sc.solidRect(q)) { b.x = q.x; b.y = q.y; } }
}

function stepBeam(sc: World, e: EntRt, d: Extract<ArenaEnt, { kind: 'beam' }>): void {
  const A = sc.arena!;
  if (e.on) while (e.next < d.timeline.length && d.timeline[e.next]!.at <= e.t) {
    const op = d.timeline[e.next++]!;
    const rect = worldRect(A, op.area ?? d.area);
    e.strikes.push({ rect, aim: op.aim, tell: op.tell, active: op.active, f: 0, hits: [], hit: d.hit, dmg: d.dmg });
    sc.emit('snd', { n: 'swing' });
  }
  for (const s of e.strikes) {
    s.f++;
    if (s.aim && s.f <= s.tell) { // цель: x героя, фиксируется к концу замаха
      const [tp] = sc.nearestPlayer(s.rect.x + s.rect.w / 2, s.rect.y + s.rect.h / 2);
      if (tp) s.rect.x = Math.max(A.x0, Math.min(A.x1 - s.rect.w, tp.x + 7 - s.rect.w / 2));
    }
    if (s.f > s.tell && s.f <= s.tell + s.active) {
      for (const p of sc.players) {
        if (p.remote || p.downed || p.inv > 0 || s.hits.includes(p.i) || !overlap(inset(p, 2), s.rect)) continue;
        s.hits.push(p.i);
        hurtPlayer(sc, p, s.dmg, s.rect.x + s.rect.w / 2, false, s.hit);
      }
    }
  }
  if (e.strikes.some((s) => s.f >= s.tell + s.active)) e.strikes = e.strikes.filter((s) => s.f < s.tell + s.active);
}

function stepSpawner(sc: World, e: EntRt, d: Extract<ArenaEnt, { kind: 'spawner' }>): void {
  const A = sc.arena!;
  const emit = (i: number): void => {
    const op = d.timeline[i]!, x = A.x0 + d.pos.x, y = A.floor - d.pos.y, base = { x, y };
    if (op.creature) { spawnCreature(sc, e.own, op.creature, x, y); return; }
    if (!op.proj) return;
    const [tp] = sc.nearestPlayer(x, y);
    const v = op.aim ? aimAt(base, tp, Math.hypot(op.vx, op.vy), 1) : { vx: op.vx, vy: op.vy };
    fireShots(sc, base, v.vx, v.vy, { proj: op.proj, kind: op.kind, count: op.count, spread: op.spread, dmg: op.dmg }, e.own);
  };
  if (e.on) while (e.next < d.timeline.length && d.timeline[e.next]!.at <= e.t) {
    const i = e.next++, op = d.timeline[i]!;
    if (op.tell > 0) e.q.push({ due: e.t + op.tell, op: i, kind: op.kind }); else emit(i);
  }
  if (e.q.length) {
    const due = e.q.filter((x) => x.due <= e.t);
    if (due.length) { e.q = e.q.filter((x) => x.due > e.t); for (const x of due) emit(x.op); }
    if (!e.on) e.t++; // очередь доигрывается и после конца расписания
  }
}
