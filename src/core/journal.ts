// Журнал ввода (legacy/src/journal.js): формат, кодирование, контрольные хэши и исход партии для золотых записей.
// Партия целиком описывается зерном, настройками и вводом по тикам; ядро детерминировано, поэтому журнал воспроизводит её в тот же исход.
import type { Inp, Player } from './types';
import type { World } from './world';

export const BITS = ['left', 'right', 'up', 'down', 'jump', 'atk', 'dash', 'heal', 'bomb', 'tool'] as const;
export const EBITS = ['jumpP', 'atkP', 'dashP', 'healP', 'upP', 'bombP', 'toolP'] as const;
/** как часто (в тиках) пишется контрольный хэш */
export const CHK = 300;

export const enc = (o: Inp | undefined, names: readonly string[]): number => { let m = 0; if (o) for (let i = 0; i < names.length; i++) if ((o as Record<string, boolean>)[names[i]!]) m |= 1 << i; return m; };
export const dec = (m: number, names: readonly string[]): Inp => { const o: Record<string, boolean> = {}; for (let i = 0; i < names.length; i++) o[names[i]!] = !!(m & (1 << i)); return o as Inp; };

export type Act = [tick: number, name: string, a: number, b: number, c: number];
export interface JournalSeg {
  seed: number; np: number; hv: 1 | 2;
  data: { players: number; mode: 'story' | 'bosstest'; boss: string | null; camp: unknown };
  n: number; rle: number[]; acts: Act[]; chk: number[];
}
export interface Journal {
  v: 1; mem?: boolean; ver: string; cat: 'trail' | 'boss' | null; race: unknown; seed: number;
  segs: JournalSeg[]; splits: ({ rta: number; igt: number } | null)[]; pauses: [number, number | null][];
  wall0?: number; wallT0?: number | null; wallSave?: number; restored?: number; downMs?: number; st?: unknown; meta?: unknown;
}

/** значение тика: ввод первого игрока, у двух локальных игроков второй добавляется старшими разрядами (по 17 бит на игрока) */
export function tickValue(ps: Player[]): number {
  const p = ps[0]!;
  let v = enc(p.raw, BITS) | (enc(p.pend, EBITS) << 10);
  if (ps.length > 1) v += (enc(ps[1]!.raw, BITS) | (enc(ps[1]!.pend, EBITS) << 10)) * 131072;
  return v;
}
/** разворачивает значение тика в ввод игроков */
export function applyTickValue(ps: Player[], v: number): void {
  const v0 = v % 131072, v1 = Math.floor(v / 131072);
  ps[0]!.raw = dec(v0 & 1023, BITS); ps[0]!.pend = dec(v0 >> 10, EBITS);
  if (ps.length > 1) { ps[1]!.raw = dec(v1 & 1023, BITS); ps[1]!.pend = dec(v1 >> 10, EBITS); }
}
/** RLE: добавляет значение тика в конец */
export function rlePush(rle: number[], v: number): void {
  const L = rle.length;
  if (L && rle[L - 2] === v) rle[L - 1]!++; else rle.push(v, 1);
}

// богатый хэш для золотых записей (hv:2): все игроки, босс, враги, снаряды; на нём проверяется перенос ядра на v2
export function hash2(gs: World): number {
  const b = gs.testBoss() ?? gs.boss; let h = 2166136261;
  const mix = (n: number): void => { h = Math.imul(h ^ (Math.round(n) | 0), 16777619) >>> 0; };
  const str = (s: string): void => { for (let i = 0; i < String(s).length; i++) mix(String(s).charCodeAt(i)); };
  // (номер тика в хэш не входит: при записи он уже увеличен, при проверке — ещё нет)
  for (const p of gs.players) { mix(p.x * 16); mix(p.y * 16); mix(p.vx); mix(p.vy); mix(p.hp); mix(p.silk * 10); mix(p.inv * 100); mix(p.downed ? 1 : 0); mix(p.dashT * 100); mix(p.atkT * 100); }
  if (b) { mix(b.x * 16); mix(b.y * 16); mix(b.hp * 10); mix(b.phase || 1); str(b.state); mix((b.stagger || 0) * 100); }
  let ex = 0, ey = 0, n = 0; for (const e of gs.enemies) if (!e.dead) { n++; ex += e.x; ey += e.y; } mix(n); mix(ex * 16); mix(ey * 16);
  mix(gs.projs.length); let px = 0; for (const q of gs.projs) px += q.x + q.y; mix(px * 16);
  mix(gs.beads | 0); mix(gs.deaths | 0); mix(gs.bossDead ? 1 : 0); mix(gs.beadsArr.length); mix(gs.won ? 1 : 0); mix(gs.wiping ? 1 : 0);
  return h;
}
/** мелкое состояние для контрольных хэшей (hv:1) */
export function hash1(gs: World): number {
  const p = gs.players[0]!, b = gs.testBoss() ?? gs.boss; let h = 2166136261;
  const mix = (n: number): void => { h = Math.imul(h ^ (Math.round(n) | 0), 16777619) >>> 0; };
  mix(p.x * 16); mix(p.y * 16); mix(p.hp); mix(gs.beads | 0); mix(((b && b.hp) || 0) * 10); mix(gs.deaths | 0);
  mix(gs.enemies.filter((e) => !e.dead).length); mix(gs.beadsArr.length); mix(gs.projs.length); mix(gs.bossDead ? 1 : 0);
  return h;
}
export const hashFor = (gs: World, hv: number): number => (hv === 2 ? hash2(gs) : hash1(gs));

/** итог партии для золотых записей: всё, что должно совпасть в другой реализации ядра */
export function outcome(gs: World): Record<string, unknown> {
  const b = gs.testBoss() ?? gs.boss, r = gs.sr;
  return { tick: gs.tickN, won: !!gs.won, wiping: !!gs.wiping, deaths: gs.deaths | 0, beads: gs.beads | 0, bossDead: !!gs.bossDead,
    boss: b ? { hp: Math.round(b.hp * 1000) / 1000, phase: b.phase || 1, state: b.state } : null,
    players: gs.players.map((p) => ({ x: Math.round(p.x * 16), y: Math.round(p.y * 16), hp: p.hp, maxHp: p.maxHp, silk: Math.round(p.silk * 10), downed: !!p.downed })),
    camp: gs.camp ? { ch: gs.camp.ch, st: gs.camp.st } : null,
    sr: r ? { igt: Math.round(r.igt), splits: r.splits.map((s) => s && Math.round(s.igt)), deaths: r.deaths, done: !!r.done } : null,
    hash: hash2(gs) };
}

// ----- подготовки золотых записей (acts 'ex'): их обязано воспроизвести любое ядро, поэтому они часть формата -----
// 10 — Корнематка: герои у арены с двойным прыжком; 11 — выдать двойной прыжок; 12 — +70 бусин; 20 (x, y) — перенос героя в пиксели.
export const GOLDEN_EXT: Record<number, (sc: World, y: number, z: number) => void> = {
  10: (sc) => {
    const tr = sc.L.boss!.trigger; sc.abil = { double: true, ledge: false, glide: false, ...sc.abil };
    sc.players.forEach((p, i) => { p.x = (tr + 1) * 32 + i * 20; p.y = (sc.L.boss!.y + 1) * 32 - 26; p.vx = p.vy = 0; p.safeX = p.x; p.safeY = p.y; });
    sc.respawn = { x: (tr - 1) * 32, y: (sc.L.boss!.y + 1) * 32 };
  },
  11: (sc) => { sc.abil = { ...sc.abil, double: true }; },
  12: (sc) => { sc.beads += 70; },
  20: (sc, x, y) => { const p = sc.players[0]!; p.x = x; p.y = y; p.vx = p.vy = 0; p.safeX = x; p.safeY = y; },
};
