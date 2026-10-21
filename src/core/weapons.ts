// Оружие v1.8 (legacy/src/loadout.js + weapons.js): пять клинков, заряженный удар, воздушные цепочки, обёртки над боем.
// Урон W.dmg применяется к обычным врагам и боссам через обёртки damageEnemy/damageBoss (только пока идёт resolveAttack героя):
// всполох, казнь (RAW), бомбы и отбив W.dmg не затрагивают.
import { BAL, CH_SHOW, CH_SLOW, CH_T, SPIKE, T } from './balance';
import type { Boss, Enemy, Player, Rect } from './types';
import type { World } from './world';
import { overlap } from './world';
import { resolveAttackBase, atkBoxBase, gainSilkBase, damageEnemyBase } from './combat';
import { needleBonus } from './campaign';
import { killEnemy } from './combat';

/* eslint-disable @typescript-eslint/no-explicit-any -- реестр оружия: свободные поля, как в v1.8 */
export interface SwingDef { t?: number; cd?: number; dm?: number; hits?: number; box?: (sc: World, p: Player, sw: Swing, el: number, rm: number, cx: number, cy: number) => Rect; flip?: boolean; tot?: number; pulses?: number; pulse?: number; noRecoil?: boolean; snd?: string; start?: (sc: World, p: Player, sw: Swing) => void; cutAll?: boolean; br?: boolean; pm?: number }
export interface Swing { wid: string; k: string; e: SwingDef | null; hits: number; dm: number; f0: number; x0: number; y0: number; fy: number; dur: number; pulse: number; pn: number; cn: Map<unknown, number>; pm?: number; cutAll: boolean; noRecoil: boolean; len: number }
export interface WeaponDef {
  id: string; name: string; desc: string; reach: number; thick: number; atkT: number; cd: number; combo: number; comboWin: number; finisher: boolean; finT: number; finCd: number; dmg: number;
  unlock: string; col?: number; pm?: number; kb?: number; recoil?: number; hs?: number; noPogo?: boolean; cutAll?: boolean;
  geo?: Record<string, any[]>; sw?: Record<string, SwingDef>; onSwing?: (sc: World, p: Player) => void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- геометрия ----------
const fr = (sw: Swing, cx: number, w: number, h: number, top: number, off?: number): Rect => { const o = off == null ? 2 : off; return { x: sw.f0 > 0 ? cx + o : cx - o - w, y: top, w, h }; };
const ctr = (cx: number, w: number, h: number, top: number): Rect => ({ x: cx - w / 2, y: top, w, h });
// длина волны до ближайшей стены
const clipLen = (sc: World, x0: number, y: number, f: number, max: number): number => {
  for (let d = 16; d <= max; d += 16) if (sc.isSolid(Math.floor((x0 + f * d) / T), Math.floor(y / T))) return Math.max(24, d - 16);
  return max;
};
const waveBox = (_sc: World, _p: Player, sw: Swing, el: number): Rect => { const L = Math.max(10, sw.len * Math.min(1, el / (sw.dur! * 0.7))); return { x: sw.f0 > 0 ? sw.x0 + 6 : sw.x0 - 6 - L, y: sw.y0 - 30, w: L, h: 60 }; };
const shockBox = (_sc: World, _p: Player, sw: Swing, el: number): Rect => { const half = 200 * Math.min(1, el / (sw.dur * 0.5)) + 10; return { x: sw.x0 - half, y: sw.fy - 40, w: half * 2, h: 46 }; };

// ---------- реестр ----------
export const WEAPONS: Record<string, WeaponDef> = {
  needle: {
    id: 'needle', name: 'Игла', desc: 'Лёгкая и быстрая. Третий удар подряд — тяжёлый. В прыжке — взмах и разворот, с зарядом — волна.', reach: 1, thick: 1, atkT: 0.12, cd: 0.26, combo: 3, comboWin: 0.6, finisher: true, finT: 0.16, finCd: 0.42, dmg: 1, unlock: 'start', col: 0xf6f3e8,
    sw: {
      a1: { t: 0.14, cd: 0.3, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(58 * rm), 46, cy - 36) },
      a2: { t: 0.14, cd: 0.3, dm: 1.1, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(60 * rm), 44, cy - 26) },
      c: { t: 0.5, cd: 0.5, tot: 4.6, hits: 2, noRecoil: true, snd: 'wave', start: (sc, p, sw) => { sw.len = clipLen(sc, sw.x0, sw.y0, sw.f0, 250); }, box: waveBox },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS['needle']!),
  },
  twin: {
    id: 'twin', name: 'Парные иглы', col: 0xb8ecff,
    desc: 'Очень быстрые, но короткие и слабо отбрасывают. Четвёртый удар — вихрь вокруг героя. С зарядом — шквал.',
    reach: 0.8, thick: 0.9, atkT: 0.08, cd: 0.11, combo: 4, comboWin: 0.4, finisher: true, finT: 0.22, finCd: 0.45, dmg: 0.69,
    pm: 0.65, kb: 0.4, recoil: 0.4, hs: 0.018, unlock: 'boss:misha',
    geo: { f: [40, 28, -14], fh: [96, 58, -29, 'c'], u: [34, 44, 40], d: [34, 40] },
    sw: {
      f: { hits: 2, snd: 'whirl' },
      a1: { t: 0.09, cd: 0.14, dm: 0.8, hits: 2, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(46 * rm), 38, cy - 20) },
      a2: { t: 0.12, cd: 0.2, dm: 1.15, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(80 * rm), 52, cy - 26) },
      c: { t: 0.56, cd: 0.45, tot: 4.8, hits: 1, pulses: 4, pulse: 0.13, noRecoil: true, snd: 'whirl', box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(116 * rm), 66, cy - 33) },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS['twin']!),
  },
  sickle: {
    id: 'sickle', name: 'Серп', col: 0xd9f2a8,
    desc: 'Длинная широкая дуга вверх-вперёд, рубит и летящие снаряды. Медленный замах. Заряд — «жатва» вокруг героя.',
    reach: 1.6, thick: 1.8, atkT: 0.2, cd: 0.52, combo: 2, comboWin: 0.9, finisher: true, finT: 0.24, finCd: 0.66, dmg: 1.62,
    pm: 1.6, kb: 1.15, recoil: 1, hs: 0.05, cutAll: true, unlock: 'boss:vladik',
    geo: { f: [80, 62, -46], fh: [102, 68, -50], u: [66, 70, 62], d: [40, 46] },
    sw: {
      f: { hits: 2, snd: 'reap' },
      a1: { t: 0.2, cd: 0.4, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(74 * rm), 66, cy - 12) },
      a2: { t: 0.2, cd: 0.45, dm: 1.1, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(128 * rm), 80, cy - 46) },
      c: { t: 0.34, cd: 0.5, tot: 4.8, hits: 2, noRecoil: true, cutAll: true, snd: 'reap', box: (sc, p, sw, el, rm, cx, cy) => ({ x: sw.f0 > 0 ? cx - 14 : cx + 14 - Math.round(168 * rm), y: cy - 104, w: Math.round(168 * rm), h: 132 }) },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS['sickle']!),
  },
  mace: {
    id: 'mace', name: 'Колотушка', col: 0xffc58a,
    desc: 'Очень медленная, зато каждый удар тяжёлый: огромный урон, втрое сильнее сбивает стойкость босса, ломает броню. Не отскакивает при ударе вниз. Заряд — удар оземь.',
    reach: 1, thick: 1.4, atkT: 0.22, cd: 0.7, combo: 1, comboWin: 0.6, finisher: false, finT: 0.22, finCd: 0.7, dmg: 3,
    pm: 3, kb: 1.8, recoil: 1.35, hs: 0.1, noPogo: true, unlock: 'shop:60',
    geo: { f: [58, 46, -26], u: [46, 52, 46], d: [48, 50] },
    sw: {
      g: { hits: 1, br: true, snd: 'hammer' },
      a1: { t: 0.24, cd: 0.6, dm: 1.0, hits: 1, br: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(58 * rm), 62, cy - 8) },
      a2: { t: 0.24, cd: 0.62, dm: 0.9, hits: 1, br: true, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(108 * rm), 58, cy - 30) },
      c: { t: 0.5, cd: 0.5, tot: 5.2, hits: 2, noRecoil: true, snd: 'quake', box: shockBox },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS['mace']!),
  },
  lance: {
    id: 'lance', name: 'Игла-копьё', col: 0xcfe6ff,
    desc: 'Колющий удар на огромную дистанцию вперёд, узкий и пробивает всех на линии. Третий выпад — ещё длиннее. Заряд — рывок-прокол.',
    reach: 2.8, thick: 0.4, atkT: 0.14, cd: 0.38, combo: 3, comboWin: 0.7, finisher: true, finT: 0.18, finCd: 0.62, dmg: 1.4,
    pm: 1.05, kb: 0.85, recoil: 0.5, hs: 0.04, unlock: 'shop:40',
    geo: { f: [138, 13, -8], fh: [188, 15, -9], u: [20, 76, 70], d: [22, 62] },
    sw: {
      f: { hits: 2, snd: 'lunge' },
      a1: { t: 0.14, cd: 0.34, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(104 * rm), 44, cy - 4) },
      a2: { t: 0.14, cd: 0.34, dm: 1.0, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(126 * rm), 14, cy - 8) },
      c: { t: 0.26, cd: 0.5, tot: 4.8, hits: 2, noRecoil: true, snd: 'lunge', start: (sc, p, sw) => { p.kbx = sw.f0 * 1500; p.inv = Math.max(p.inv, 0.2); }, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(216 * rm), 17, cy - 9, 0) },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS['lance']!),
  },
};

export const wdef = (p: Player): WeaponDef => WEAPONS[p['weaponId'] as string] ?? WEAPONS['needle']!;

// ---------- начало удара ----------
const mkSw = (W: WeaponDef, k: string, p: Player, dur: number): Swing => {
  const e = (W.sw && W.sw[k]) || null;
  const hits = e && e.hits != null ? e.hits : (p['heavy'] ? 2 : 1);
  let dm = e && e.dm != null ? e.dm : 1;
  if (e && e.tot != null) dm = e.tot / (hits * (e.pulses || 1) * W.dmg);
  return { wid: W.id, k, e, hits, dm, f0: p.face, x0: p.x + p.w / 2, y0: p.y + p.h / 2, fy: p.y + p.h, dur, pulse: (e && e.pulse) || 0, pn: 0, cn: new Map(),
    pm: e ? e.pm : undefined, cutAll: !!(e && e.cutAll), noRecoil: !!(e && e.noRecoil), len: 0 };
};
// вызывается из stepPlayer сразу после того, как посчитаны atkT/atkCd/heavy; выбирает вид удара (земля / воздух / финишер)
function begin(sc: World, p: Player, W: WeaponDef): void {
  const d = p.atkDir;
  let k = 'g';
  if (!p.onGround && d === 'f') { p['airN'] = (p['airN'] || 0) + 1; k = p['airN'] === 1 ? 'a1' : p['airN'] === 2 ? 'a2' : 'g'; }
  if (k === 'g' && p['heavy']) k = 'f';
  if ((k === 'a1' || k === 'a2') && !(W.sw && W.sw[k])) k = p['heavy'] ? 'f' : 'g';
  const e = (W.sw && W.sw[k]) || null;
  let back = 0;
  if (e) {
    if (e.flip) { back = -p.face; const inp = p.inp || {}; if (!inp.left && !inp.right) p.face = back; } // разворот: бьёт назад, без нажатия — герой разворачивается
    if (e.t != null) p.atkT = e.t;
    if (e.cd != null) p.atkCd = e.cd;
    if (e.hits != null) p['heavy'] = e.hits > 1 || !!e.br; else if (e.br) p['heavy'] = true;
    if (e.snd) sc.snd(e.snd);
  }
  if (W.noPogo && d === 'd') p.pogoed = true;
  p['sw'] = mkSw(W, k, p, p.atkT); p['swk'] = k;
  if (back) (p['sw'] as Swing).f0 = back;
}

// ---------- заряженный удар ----------
function fireCharge(sc: World, p: Player, W: WeaponDef): void {
  const e = W.sw && W.sw['c']; if (!e) return;
  p.atkDir = 'f'; p['combo'] = 0; p['comboT'] = 0; p['atkBuf'] = 0; p['swk'] = 'c';
  p.atkT = e.t!; p.atkCd = e.cd!; p.atkHits = new Set(); p.pogoed = true; p['seq'] = (p['seq'] || 0) + 1;
  p['sw'] = mkSw(W, 'c', p, e.t!); p['heavy'] = true; p['chgWait'] = p.atkCd; // следующий заряд копится только после восстановления
  if (e.start) e.start(sc, p, p['sw'] as Swing);
  sc.snd(e.snd || 'slam'); sc.shake(220, 0.007 + (W.id === 'mace' ? 0.012 : 0));
  sc.parts(16, p.x + 7 + p.face * 14, p.y + 16, W.col || 0xffffff);
  if (W.id === 'mace') { sc.hitstop = Math.max(sc.hitstop || 0, 0.06); sc.dustAt(12, p.x + 7, p.y + 26); }
}
const stopChargeSnd = (sc: World, p: Player): void => { if (p['chgSnd']) { sc.emit('chargeSnd', { i: p.i, on: false }); p['chgSnd'] = null; } };
function chargeTick(sc: World, p: Player, dt: number): void {
  if (p.remote) return;
  const inp = p.inp || {}, held = !!inp.atk, W = wdef(p);
  p['chgWait'] = Math.max(0, ((p['chgWait'] as number) || 0) - dt);
  const ok = !p.downed && p.hurtT <= 0 && p.dashT <= 0 && !(p['healCh'] > 0) && !p.sit && !(p['execT'] > 0) && p.onGround && !sc.td;
  if (!held) {
    if (((p['chg'] as number) || 0) >= CH_T && !p['chgLock'] && ok) fireCharge(sc, p, W);
    stopChargeSnd(sc, p); p['chg'] = 0; p['chgLock'] = false; return;
  }
  if (p['chgLock'] || (p['chgWait'] as number) > 0) { p['chg'] = 0; return; }
  if (!ok || inp.dashP) { // рывок, урон, прыжок или лечение отменяют заряд до отпускания кнопки
    if (((p['chg'] as number) || 0) > CH_SHOW) sc.snd('clink');
    stopChargeSnd(sc, p); p['chg'] = 0; p['chgLock'] = true; return;
  }
  const was = (p['chg'] as number) || 0; p['chg'] = was + dt;
  if (was < CH_SHOW && (p['chg'] as number) >= CH_SHOW) { p['chgSnd'] = true; sc.emit('chargeSnd', { i: p.i, on: true, dur: CH_T - CH_SHOW, id: W.id }); }
  if (was < CH_T && (p['chg'] as number) >= CH_T) { sc.snd('chargeFull'); sc.parts(10, p.x + 7, p.y + 14, 0xffffff); }
}
/** weapons.js: обёртка stepPlayer */
export function weaponsPre(sc: World, p: Player, dt: number): void {
  chargeTick(sc, p, dt);
  if (p.onGround || p.wallDir) p['airN'] = 0;
}
/** множитель скорости: лужи Тимы (tima.js) и замедление при заряде (weapons.js) */
export function speedMul(sc: World, p: Player | null): number {
  let m = 1;
  if (sc.puddles && p && p.onGround) for (const q of sc.puddles) if (p.x + p.w > q.x && p.x < q.x + q.w && Math.abs(p.y + p.h - q.y) < 6) { m = 0.5; break; }
  if (!sc.puddles || !p || !p.onGround) m = 1;
  return p && !p.remote && (p['chg'] as number) > CH_SHOW ? m * CH_SLOW : m;
}

// ---------- коробка удара ----------
export function atkBox(sc: World, p: Player): Rect {
  const W = wdef(p), sw = p['sw'] as Swing | undefined, e = sw && sw.wid === W.id && sw.e;
  const rm = 1, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  if (e && e.box && p.atkDir === 'f') return e.box(sc, p, sw!, sw!.dur - p.atkT, rm, cx, cy);
  const g = W.geo; if (!g) return atkBoxBase(sc, p, W);
  if (p.atkDir === 'f') {
    const q = p['heavy'] && g['fh'] ? g['fh'] : g['f']!, w = Math.round(q[0] * rm);
    return q[3] === 'c' ? ctr(cx, w, q[1], cy + q[2]) : { x: p.face > 0 ? cx + 2 : cx - 2 - w, y: cy + q[2], w, h: q[1] };
  }
  if (p.atkDir === 'u') return { x: cx - g['u']![0] / 2, y: p.y - Math.round(g['u']![2] * rm), w: g['u']![0], h: Math.round(g['u']![1] * rm) };
  return { x: cx - g['d']![0] / 2, y: p.y + p.h - 8, w: g['d']![0], h: Math.round(g['d']![1] * rm) };
}

// ---------- разрешение удара и урон ----------
const EXTRA_CUT = new Set(['clef', 'drip', 'rock', 'trophy']);
export function resolveAttack(sc: World, p: Player): void {
  if (p.downed || p.atkT <= 0 || !p.atkHits) return resolveAttackBase(sc, p);
  const W = wdef(p);
  if (!p['sw'] || (p['sw'] as Swing).wid !== W.id) p['sw'] = mkSw(W, 'g', p, p.atkT);
  const sw = p['sw'] as Swing;
  if (sw.pulse) { const n = Math.floor((sw.dur - p.atkT) / sw.pulse); if (n !== sw.pn) { sw.pn = n; p.atkHits = new Set(); sw.cn.clear(); } }
  const kb0 = p.kbx; sc._inAtk = p;
  try { resolveAttackBase(sc, p); } finally { sc._inAtk = null; sc._hd = 1; }
  if (p.kbx !== kb0) { const r = sw.noRecoil ? 0 : (W.recoil == null ? 1 : W.recoil); p.kbx = kb0 + (p.kbx - kb0) * r; }
  if (sw.cutAll || W.cutAll) {
    const box = atkBox(sc, p);
    for (const pr of sc.projs) if (!pr.dead && EXTRA_CUT.has(pr.kind) && !((pr.delay ?? 0) > 0) && overlap(box, pr)) {
      pr.dead = true; sc.burst(6, pr.x + pr.w / 2, pr.y + pr.h / 2, 0xffd47a);
      sc.sfx('clink');
    }
  }
}
// особый ли это удар (иначе — исходная игла без изменений) и сколько урона несёт один вызов damageX
export const special = (sc: World, p: Player): { W: WeaponDef; sw: Swing; d: number } | null => {
  if (sc._inAtk !== p || !p['sw']) return null;
  const W = wdef(p), sw = p['sw'] as Swing, d = W.dmg * sw.dm;
  if (d === 1 && W.hs == null && W.kb == null && sw.hits === (p['heavy'] ? 2 : 1)) return null;
  return { W, sw, d };
};
// второй вызов «тяжёлого» удара пропускаем, если у удара одно попадание
export const dup = (p: Player, sw: Swing, tgt: unknown): boolean => { if (sw.hits !== 1 || !p['heavy']) return false; const c = sw.cn.get(tgt) || 0; sw.cn.set(tgt, c + 1); return c >= 1; };

/** weapons.js: обёртка damageEnemy (внутри — база) */
export function damageEnemyWeapons(sc: World, e: Enemy, p: Player): void {
  const s = special(sc, p); if (!s) return damageEnemyBase(sc, e, p);
  const { W, sw, d } = s;
  if (dup(p, sw, e)) return;
  const h0 = e.hp, est = 1 + needleBonus(sc); let bump = 0;
  if (d < 1) { bump = est * (1 - d); e.hp += bump; }
  sc._hd = d;
  try { damageEnemyBase(sc, e, p); } finally { sc._hd = 1; }
  if (e.hp === h0 + bump) { e.hp = h0; return; } // не прошёл (броня, под землёй)
  if (d > 1 && !e.dead) { e.hp -= (h0 - e.hp) * (d - 1); if (e.hp <= 0) killEnemy(sc, e); }
  if (!e.dead && e.kbT > 0) { const k = W.kb == null ? 1 : W.kb; e.kbx *= k; e.kby *= k; }
  if (!p.remote && W.hs != null) sc.hitstop = W.hs;
}
/** weapons.js: обёртка damageBoss/Vladik/Tima. orig — следующий слой (стойкость → база) */
export function damageBossWeapons(sc: World, b: Boss | null, p: Player, orig: () => void): void {
  const s = special(sc, p);
  if (!s || !b) return orig();
  const { W, sw, d } = s;
  if (dup(p, sw, b)) return;
  // урон оружия добавляем до исходного вызова: фазы, смерть и двойной урон по оглушённому считает он сам
  if (!['rage', 'dead', 'gone', 'sleep', 'intro'].includes(b.state)) b.hp -= (b.stagger > 0 ? 2 : 1) * (d - 1);
  sc._hd = d;
  try { orig(); } finally { sc._hd = 1; }
  if (!p.remote && W.hs != null && sc.hitstop > 0) sc.hitstop = W.hs;
}
/** weapons.js: обёртка poiseAdd — свой множитель стойкости у каждого клинка */
export function poiseMul(sc: World, n: number): number {
  const p = sc._inAtk;
  if (p && p['sw']) { const W = wdef(p), sw = p['sw'] as Swing; n *= (W.pm == null ? 1 : W.pm) * (sw.pm == null ? 1 : sw.pm); }
  return n;
}
/** weapons.js: нить копится за нанесённый урон, а не за число ударов (иначе быстрые клинки лечили бы слишком быстро) */
export function gainSilkWeapons(sc: World, p: Player, boss?: boolean): void {
  if (sc._inAtk === p && sc._hd != null && sc._hd !== 1) {
    p['silkAcc'] = ((p['silkAcc'] as number) || 0) + sc._hd / (boss ? BAL.silkEvery : 1);
    while ((p['silkAcc'] as number) >= 1) { (p['silkAcc'] as number) -= 1; gainSilkBase(sc, p, false); }
    return;
  }
  gainSilkBase(sc, p, boss);
}

// проверка, что колючки в зоне удара вниз используют тот же SPIKE
export const _spike = SPIKE;
