// Инструменты: метательная игла, капкан, нитяная бомба, нитяной крюк (legacy/src/tools.js).
// Снаряды-инструменты живут в w.tl (не в projs: иначе их сбивали бы отбив/всполох и они ранили бы героев).
import { FLY_TYPES, P, TOOL } from './balance';
import type { BossRef } from './balance';
import { bossOf, bossRefs } from './bosses2';
import type { Boss, Enemy, Player } from './types';
import type { World } from './world';
import { e2Blocked } from './enemies';
import { killEnemy } from './combat';
import { damageBoss } from './damage';

import { toolEntReg, toolMsgs, toolReg } from './plugin/regs';
import { toolAim, type Q, type ToolDef, type ToolMsg } from './tool-kit';

export type { ToolMsg } from './tool-kit';
/** все инструменты и навыки нити в порядке order (живой объект; описания — src/content/tools/<id>.ts) */
export const TOOLS: Record<string, ToolDef> = toolReg.record;

/** бросок по умолчанию: прицел по вводу, звук, сообщение; сущность создаёт хост (spawn) */
export function toolCast(sc: World, T_: ToolDef, p: Player): boolean {
  const a = toolAim(p);
  const msg = { k: 'tool', id: T_.id, i: p.i, x: Math.round(p.x + 7), y: Math.round(p.y + (T_.castY ?? 13)), dx: Math.round(a.dx * 1000) / 1000, dy: Math.round(a.dy * 1000) / 1000, f: a.f };
  sc.snd(T_.castSnd ?? 'throw');
  if (sc.auth()) toolSpawn(sc, msg); else sc.sendEv(msg);
  return true;
}
/** применить инструмент кнопкой: своё применение (use) или бросок */
export const useToolDef = (sc: World, T_: ToolDef, p: Player): boolean => (T_.use ? T_.use(sc, p) : toolCast(sc, T_, p));
/** сущность ли инструмента этот вид (в снимке гостя они идут строками снарядов) */
export const isToolKind = (k: string): boolean => toolEntReg.has(k);
/** у хоста: сообщение 'tool' (свой бросок или от гостя) */
export function toolSpawn(sc: World, m: ToolMsg): void {
  const T_ = toolReg.get(m.id);
  if (T_?.spawn) T_.spawn(sc, m); else toolMsgs.get(m.id)?.(sc, m);
}
export const toolOwner = (sc: World, i: number): Player => sc.players[i] || sc.players[0]!;

// урон врагу от инструмента (мимо игольного пути: ни нити, ни бонуса острой иглы); false — не засчитан (броня, засадник под землёй)
export function toolHurtEnemy(sc: World, e: Enemy, n: number, kdir: number, pierceArmor: boolean): boolean {
  const dummy = { x: e.x + e.w / 2 - kdir * 40, heavy: false, atkDir: 'f', remote: true, face: kdir } as unknown as Player;
  if (pierceArmor) sc._e2burst = true;
  const blocked = (() => { try { return !!(e['e2'] && e2Blocked(sc, e, dummy)); } finally { if (pierceArmor) sc._e2burst = false; } })();
  if (blocked) return false;
  e.hp -= n; e.flash = 0.1; sc.sfx('hit');
  sc.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xf4f1e6);
  e.kbT = 0.2; e.kbx = kdir * (e.type === 'beetle' ? 140 : 280); e.kby = -150;
  if (e.type === 'beetle' && e['state'] === 'charge') { e['state'] = 'stun'; e['st'] = 0.6; }
  if (e.hp <= 0) killEnemy(sc, e);
  return true;
}
export const liveBoss = (b: Boss | null | undefined): boolean => !!b && !['dead', 'gone', 'sleep', 'intro'].includes(b.state);
// урон боссу от инструмента — через те же damageBoss/Vladik/Tima, что и у всполоха (фазы, стойка, оглушение работают)
export function toolHurtBoss(sc: World, key: BossRef, p: Player, n: number): void {
  const b = bossOf(sc, key);
  p['noSilkGain'] = true;
  try { for (let i = 0; i < n && liveBoss(b); i++) damageBoss(sc, key, p); } finally { p['noSilkGain'] = false; }
}
export function freezeEnemy(sc: World, e: Enemy | undefined, t: number): void {
  if (!e || e.dead) return;
  e['frozenT'] = Math.max((e['frozenT'] as number) || 0, t); e.kbT = 0; e.flash = 0.12;
  sc.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xffe3a3);
}
export const tfxAdd = (sc: World, f: Q, send?: boolean): void => { sc.tfx.push(f); if (send) sc.sendEv({ k: 'tfx', ...f, t: f['t'] }); };

// ----- шаг сущностей -----
export function stepTools(sc: World, dt: number): void {
  const tl = sc.tl as Q[]; if (!tl.length) return;
  const bosses = bossRefs(sc);
  for (const q of tl) {
    if (q['dead']) continue;
    q['life'] -= dt; if (q['life'] <= 0) { q['dead'] = true; continue; }
    toolEntReg.get(q['kind'])?.step(sc, q, dt, bosses);
  }
  sc.tl = tl.filter((q) => !q['dead']);
}
/** взрыв нити: урон врагам и боссам в радиусе, сбивает снаряды */
export function toolExplode(sc: World, cx: number, cy: number, p: Player): void {
  const R = TOOL.BOMB_R;
  sc.sfx('slam'); sc.shake(220, 0.01); sc.hitstop = Math.max(sc.hitstop || 0, 0.05);
  sc.burst(30, cx, cy, p && p.pal ? p.pal.accent : 0xffe3a3); sc.burst(14, cx, cy, 0xffffff);
  tfxAdd(sc, { f: 'boom', x: cx, y: cy, t: 0.45, T: 0.45 }, true);
  for (const pr of sc.projs) if (!pr.dead && pr.kind !== 'bomb' && !isToolKind(pr.kind) && Math.hypot(pr.x - cx, pr.y - cy) < R) pr.dead = true;
  for (const e of sc.enemies) {
    if (e.dead || Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) > R) continue;
    toolHurtEnemy(sc, e, TOOL.BOMB_DMG, Math.sign(e.x + e.w / 2 - cx) || 1, true);
  }
  for (const [b, k2] of bossRefs(sc)) {
    if (!liveBoss(b)) continue;
    if (Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < R + b.w / 2) toolHurtBoss(sc, k2, p, TOOL.BOMB_DMG);
  }
}

// ----- тяга нити к точке (крюк и др.): p['hk'] = { tx, ty, ax, ay, t, stuck } -----
function hookEnd(p: Player): void {
  p['hk'] = null; p.vx = 0; p.vy = Math.min(p.vy, 0) * 0.3;
}

/** tools.js: тяга крюка — обёртка stepPlayer (внутри — вызов inner) */
export function hookStep(sc: World, p: Player, dt: number, inner: (sc: World, p: Player, dt: number) => void): void {
  const hk = p['hk'] as Q | null;
  if (!hk) return inner(sc, p, dt);
  const inp = p.inp || {};
  if (p.downed || p.hurtT > 0 || (p['healCh'] as number) > 0 || inp.jumpP || inp.dashP) { p['hk'] = null; return inner(sc, p, dt); }
  const x0 = p.x, y0 = p.y;
  inner(sc, p, dt);
  if (p.downed || p.hurtT > 0) { p['hk'] = null; return; }
  p.x = x0; p.y = y0; // движение этого кадра заменяет тяга; рывок, его перезарядка и стамина не трогаются
  const cx = p.x + 7, cy = p.y + 13, dx = hk['tx'] - cx, dy = hk['ty'] - cy, d = Math.hypot(dx, dy);
  hk['t'] -= dt;
  if (d < 9 || hk['t'] <= 0) { hookEnd(p); return; }
  const sp = Math.min(TOOL.HOOK_SPD, d / dt);
  p.vx = dx / d * sp; p.vy = dy / d * sp; p.face = Math.abs(dx) > 4 ? Math.sign(dx) : p.face;
  sc.moveBody(p, dt);
  if (Math.hypot(p.x - x0, p.y - y0) < sp * dt * 0.35) { if (++hk['stuck'] >= 2) hookEnd(p); } else hk['stuck'] = 0;
  if (p.onGround) p.coyote = P.COYOTE;
}

/** tools.js: замёрзший враг — обёртка stepEnemy; возвращает true, если шаг обработан */
export function stepFrozen(sc: World, e: Enemy, dt: number): boolean {
  if (!((e['frozenT'] as number) > 0)) return false;
  (e['frozenT'] as number) -= dt; e.flash -= dt; e.kbT = 0; e.vx = 0;
  if (FLY_TYPES.has(e.type)) e.vy = 0; else { e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL); sc.moveBody(e, dt); }
  return true;
}
