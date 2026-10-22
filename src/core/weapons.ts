// Оружие v1.8 (legacy/src/loadout.js + weapons.js): пять клинков, заряженный удар, воздушные цепочки, обёртки над боем.
// Урон W.dmg применяется к обычным врагам и боссам через обёртки damageEnemy/damageBoss (только пока идёт resolveAttack героя):
// всполох, казнь (RAW), бомбы и отбив W.dmg не затрагивают.
import { BAL, CH_SHOW, CH_SLOW, CH_T, SPIKE } from './balance';
import type { Boss, Enemy, Player, Rect } from './types';
import type { World } from './world';
import { overlap } from './world';
import { resolveAttackBase, atkBoxBase, gainSilkBase, damageEnemyBase } from './combat';
import { needleBonus } from './campaign';
import { killEnemy } from './combat';
import { kitSlow } from './kit/moves';
import { projReg, weaponReg } from './plugin/regs';
import { ctr, type Swing, type WeaponDef } from './weapon-kit';
import type { BossHit } from './hit';

// ---------- реестр (описания — src/content/weapons/<id>.ts) ----------
export type { Swing, SwingDef, WeaponDef } from './weapon-kit';
export { weaponReg };
/** все виды оружия в порядке order (живой объект: заполняется при загрузке содержимого) */
export const WEAPONS: Record<string, WeaponDef> = weaponReg.record;

export const wdef = (p: Player): WeaponDef => weaponReg.get(p['weaponId'] as string) ?? weaponReg.get('needle')!;

// ---------- начало удара ----------
export const mkSw = (W: WeaponDef, k: string, p: Player, dur: number): Swing => {
  const e = (W.sw && W.sw[k]) || null;
  const hits = e && e.hits != null ? e.hits : (p['heavy'] ? 2 : 1);
  let dm = e && e.dm != null ? e.dm : 1;
  if (e && e.tot != null) dm = e.tot / (hits * (e.pulses || 1) * W.dmg);
  return { wid: W.id, k, e, hits, dm, f0: p.face, x0: p.x + p.w / 2, y0: p.y + p.h / 2, fy: p.y + p.h, dur, pulse: (e && e.pulse) || 0, pn: 0, cn: new Map(),
    pm: e ? e.pm : undefined, cutAll: !!(e && e.cutAll), noRecoil: !!(e && e.noRecoil), len: 0 };
};
// вызывается из stepPlayer сразу после того, как посчитаны atkT/atkCd/heavy; выбирает вид удара (земля / воздух / финишер)
export function beginSwing(sc: World, p: Player, W: WeaponDef): void {
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
  sc.snd(e.snd || 'slam'); sc.shake(220, 0.007 + (W.chargeShake ?? 0));
  sc.parts(16, p.x + 7 + p.face * 14, p.y + 16, W.col || 0xffffff);
  W.onCharge?.(sc, p);
}
const stopChargeSnd = (sc: World, p: Player): void => { if (p['chgSnd']) { sc.emit('chargeSnd', { i: p.i, on: false }); p['chgSnd'] = null; } };
function chargeTick(sc: World, p: Player, dt: number): void {
  if (p.remote) return;
  const inp = p.inp || {}, held = !!inp.atk, W = wdef(p);
  p['chgWait'] = Math.max(0, ((p['chgWait'] as number) || 0) - dt);
  const ok = !p.downed && p.hurtT <= 0 && p.dashT <= 0 && !(p['healCh'] > 0) && !p.sit && !(p['execT'] > 0) && p.onGround;
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
  if (p && !p.remote && (p['kcF'] as number) > 0) m *= kitSlow(p);
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
    for (const pr of sc.projs) if (!pr.dead && projReg.get(pr.kind)?.cutAll && !((pr.delay ?? 0) > 0) && overlap(box, pr)) {
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
export function damageBossWeapons(sc: World, b: Boss | null, p: Player, orig: (hit?: BossHit) => void): void {
  const s = special(sc, p);
  if (!s || !b) return orig();
  const { W, sw, d } = s;
  if (dup(p, sw, b)) return;
  sc._hd = d;
  try { orig({ amount: d }); } finally { sc._hd = 1; }
  if (!p.remote && W.hs != null && sc.hitstop > 0) sc.hitstop = W.hs;
}
/** weapons.js: обёртка poiseAdd — свой множитель стойкости у каждого клинка */
export function poiseMul(sc: World, n: number): number {
  const p = sc._inAtk;
  if (p && p['sw']) { const W = wdef(p), sw = p['sw'] as Swing; n *= (W.pm == null ? 1 : W.pm) * (sw.pm == null ? 1 : sw.pm); }
  return n * sc._cm;
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
