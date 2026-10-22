// Инструменты: метательная игла, капкан, нитяная бомба, нитяной крюк (legacy/src/tools.js).
// Снаряды-инструменты живут в w.tl (не в projs: иначе их сбивали бы отбив/всполох и они ранили бы героев).
import { FLY_TYPES, P, SOLID, PLAT, T, TOOL } from './balance';
import type { BossRef } from './balance';
import { bossOf, bossRefs } from './bosses2';
import type { Boss, Enemy, Player } from './types';
import type { World } from './world';
import { inset, overlap } from './world';
import { e2Blocked } from './enemies';
import { killEnemy } from './combat';
import { poiseAdd } from './bosses2';
import { damageBoss } from './damage';
import { SPELL_IDS, SPELL_KINDS, spellSpawn, stepSpell } from './kit/spells';

type Q = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- сущности инструментов: мешок полей, как в v1.8

// направление броска / нити по вводу: ↑ — вверх, ↑ + сторона — диагональ, иначе вперёд
function toolAim(p: Player): { dx: number; dy: number; f: number } {
  const i = p.inp || {}, dir = (i.right ? 1 : 0) - (i.left ? 1 : 0), f = dir || p.face || 1;
  if (i.up) return dir ? { dx: f * 0.7071, dy: -0.7071, f } : { dx: 0, dy: -1, f };
  return { dx: f, dy: 0, f };
}
export function toolCast(sc: World, id: string, p: Player): boolean {
  const a = toolAim(p);
  if (id === 'hook') { hookCast(sc, p, a); return true; }
  const msg = { k: 'tool', id, i: p.i, x: Math.round(p.x + 7), y: Math.round(id === 'trap' ? p.y + 26 : p.y + 13), dx: Math.round(a.dx * 1000) / 1000, dy: Math.round(a.dy * 1000) / 1000, f: a.f };
  sc.snd(id === 'trap' ? 'pickup' : 'throw');
  if (sc.auth()) toolSpawn(sc, msg); else sc.sendEv(msg);
  return true;
}
/** снаряды-инструменты у гостя приходят в снимке строками снарядов этих видов */
export const TOOL_KIND: Record<string, [number, number]> = { tneedle: [12, 12], ttrap: [26, 10], tbomb: [12, 12] };
export const isToolKind = (k: string): boolean => k === 'tneedle' || k === 'ttrap' || k === 'tbomb' || SPELL_KINDS.has(k);
export interface ToolMsg { id: string; i: number; x: number; y: number; dx: number; dy: number; f: number }
export function toolSpawn(sc: World, m: ToolMsg): void {
  if (SPELL_IDS.has(m.id)) return spellSpawn(sc, m);
  const tl = sc.tl as Q[];
  if (m.id === 'throwneedle') {
    tl.push({ kind: 'tneedle', x: m.x + m.dx * 14 - 6, y: m.y + m.dy * 14 - 6, w: 12, h: 12, vx: m.dx * TOOL.NEEDLE_SPD, vy: m.dy * TOOL.NEEDLE_SPD, st: 0, ft: 0.65, life: 25, owner: m.i, hit: new Set(), ang: Math.atan2(m.dy, m.dx) });
  } else if (m.id === 'trap') {
    const mine = tl.filter((q) => q['kind'] === 'ttrap' && q['owner'] === m.i);
    if (mine.length >= TOOL.TRAP_MAX) mine[0]!['life'] = 0; // третий капкан заменяет самый старый
    tl.push({ kind: 'ttrap', x: m.x - 13, y: m.y - 10, w: 26, h: 10, vx: 0, vy: 0, life: TOOL.TRAP_LIFE, arm: 0.3, tick: 0, owner: m.i });
    sc.burst(6, m.x, m.y - 3, 0xe8d9a8);
  } else if (m.id === 'threadbomb') {
    const up = m.dy < 0, diag = up && m.dx !== 0;
    const vx = up ? (diag ? m.f * 240 : 0) : m.f * 340, vy = up ? (diag ? -520 : -680) : -330;
    tl.push({ kind: 'tbomb', x: m.x + m.f * 8 - 6, y: m.y - 8, w: 12, h: 12, vx, vy, fuse: TOOL.BOMB_FUSE, life: 5, owner: m.i });
  }
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
    if (q['kind'] === 'tneedle') stepToolNeedle(sc, q, dt, bosses);
    else if (q['kind'] === 'ttrap') stepToolTrap(sc, q, dt, bosses);
    else if (q['kind'] === 'tbomb') stepToolBomb(sc, q, dt, bosses);
    else if (SPELL_KINDS.has(q['kind'])) stepSpell(sc, q, dt, bosses);
  }
  sc.tl = tl.filter((q) => !q['dead']);
}
function stepToolNeedle(sc: World, q: Q, dt: number, bosses: [Boss, BossRef][]): void {
  const owner = toolOwner(sc, q['owner']);
  if (q['st'] === 0) { // полёт: два подшага, чтобы не пролетать сквозь тонкие стены
    q['ft'] -= dt; if (q['ft'] <= 0) { q['st'] = 3; q['vx'] *= 0.2; q['vy'] = 0; }
    for (let s = 0; s < 2 && q['st'] === 0; s++) {
      const px = q['x'], py = q['y'];
      q['x'] += q['vx'] * dt / 2; q['y'] += q['vy'] * dt / 2;
      const cx = q['x'] + 6, cy = q['y'] + 6;
      if (sc.isSolid(Math.floor(cx / T), Math.floor(cy / T))) {
        q['x'] = px; q['y'] = py; q['st'] = 1; q['vx'] = q['vy'] = 0; q['life'] = 25;
        sc.sfx('clink'); sc.burst(5, cx, cy, 0xffe3a3); break;
      }
      for (const e of sc.enemies) {
        if (e.dead || q['hit'].has(e) || !overlap(q as never, e)) continue;
        q['hit'].add(e);
        const ok = toolHurtEnemy(sc, e, TOOL.NEEDLE_DMG, Math.sign(q['vx']) || 1, false);
        if (!ok) { q['st'] = 3; q['vx'] = -q['vx'] * 0.15; q['vy'] = -120; sc.sfx('clink'); break; }
        if (!e.dead) { q['st'] = 3; q['vx'] = -Math.sign(q['vx']) * 40; q['vy'] = -140; break; } // не пробила — упала; слабых (убитых) пробивает насквозь
      }
      if (q['st'] !== 0) break;
      for (const [b, key] of bosses) {
        if (!liveBoss(b) || !overlap(q as never, inset(b, 4))) continue;
        if (b.state === 'rage') { sc.sfx('clink'); q['st'] = 3; q['vx'] = -q['vx'] * 0.15; q['vy'] = -120; break; }
        toolHurtBoss(sc, key, owner, TOOL.NEEDLE_DMG);
        q['st'] = 2; q['boss'] = b; q['ox'] = q['x'] - b.x; q['oy'] = q['y'] - b.y; q['stuckT'] = TOOL.NEEDLE_STICK; q['vx'] = q['vy'] = 0;
        sc.sfx('clink'); break;
      }
    }
  } else if (q['st'] === 2) { // воткнута в босса
    const b = q['boss'] as Boss | null; q['stuckT'] -= dt;
    if (b && liveBoss(b)) { q['x'] = b.x + q['ox']; q['y'] = b.y + q['oy']; }
    if (q['stuckT'] <= 0 || !b || !liveBoss(b)) { q['st'] = 3; q['vx'] = 0; q['vy'] = -80; q['boss'] = null; }
  } else if (q['st'] === 3) { // падает
    q['vy'] = Math.min(q['vy'] + 1100 * dt, 800); sc.moveBody(q as never, dt);
    if (q['onGround']) { q['st'] = 4; q['vx'] = q['vy'] = 0; }
  }
  // подобрать обратно (владелец): нить возвращается
  if ((q['st'] === 1 || q['st'] === 4) && owner && !owner.downed) {
    const r = { x: q['x'] - 22, y: q['y'] - 22, w: 56, h: 56 };
    if (overlap(owner, r)) {
      q['dead'] = true; sc.snd('pickup');
      if (owner.remote) sc.sendEv({ k: 'silk', i: owner.i }); else owner.silk = Math.min(sc.silkMax, owner.silk + 1);
      sc.burst(6, q['x'] + 6, q['y'] + 6, owner.pal.accent);
    }
  }
}
function stepToolTrap(sc: World, q: Q, dt: number, bosses: [Boss, BossRef][]): void {
  q['vy'] = Math.min(q['vy'] + 1100 * dt, 800); q['vx'] = 0; sc.moveBody(q as never, dt);
  if (q['arm'] > 0) { q['arm'] -= dt; return; }
  q['tick'] -= dt;
  const cx = q['x'] + q['w'] / 2, cy = q['y'] + q['h'] / 2;
  let near = false;
  for (const e of sc.enemies) {
    if (e.dead || e.type === 'lurker') continue;
    if (Math.abs(e.x + e.w / 2 - cx) < 200 && Math.abs(e.y + e.h / 2 - cy) < 100) near = true;
    if (overlap(q as never, { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 2 }) && !((e['frozenT'] as number) > 0)) {
      freezeEnemy(sc, e, TOOL.TRAP_FREEZE); return trapSnap(sc, q);
    }
  }
  for (const [b] of bosses) {
    if (!liveBoss(b)) continue;
    if (overlap(q as never, { x: b.x + 4, y: b.y + 4, w: b.w - 8, h: b.h - 4 })) { poiseAdd(sc, b, TOOL.TRAP_POISE); return trapSnap(sc, q, true); }
  }
  if (near && q['tick'] <= 0) { q['tick'] = 0.8; sc.sfx('clink'); } // предупреждающий щелчок, когда враг рядом
}
function trapSnap(sc: World, q: Q, boss?: boolean): void {
  q['dead'] = true; sc.sfx('slam'); sc.shake(80, 0.004);
  sc.burst(14, q['x'] + q['w'] / 2, q['y'], 0xffe3a3); tfxAdd(sc, { f: 'snap', x: q['x'] + q['w'] / 2, y: q['y'] + q['h'], t: 0.35, T: 0.35 }, true);
  if (boss) sc.toastAll('Капкан! Стойка босса растёт');
}
function stepToolBomb(sc: World, q: Q, dt: number, bosses: [Boss, BossRef][]): void {
  q['vy'] = Math.min(q['vy'] + 1100 * dt, 800); q['fuse'] -= dt;
  sc.moveBody(q as never, dt);
  if (q['onGround']) { q['vx'] *= 0.75; if (Math.abs(q['vy']) < 1) q['vy'] = 0; }
  if (q['hitL'] || q['hitR']) q['vx'] = 0;
  let boom = q['fuse'] <= 0;
  if (!boom) for (const e of sc.enemies) if (!e.dead && overlap(q as never, e)) { boom = true; break; }
  if (!boom) for (const [b] of bosses) if (liveBoss(b) && overlap(q as never, inset(b, 4))) { boom = true; break; }
  if (!boom) return;
  q['dead'] = true;
  toolExplode(sc, q['x'] + 6, q['y'] + 6, toolOwner(sc, q['owner']));
}
function toolExplode(sc: World, cx: number, cy: number, p: Player): void {
  const R = TOOL.BOMB_R;
  sc.sfx('slam'); sc.shake(220, 0.01); sc.hitstop = Math.max(sc.hitstop || 0, 0.05);
  sc.burst(30, cx, cy, p && p.pal ? p.pal.accent : 0xffe3a3); sc.burst(14, cx, cy, 0xffffff);
  tfxAdd(sc, { f: 'boom', x: cx, y: cy, t: 0.45, T: 0.45 }, true);
  for (const pr of sc.projs) if (!pr.dead && pr.kind !== 'bomb' && !(pr.kind === 'tneedle' || pr.kind === 'ttrap' || pr.kind === 'tbomb') && Math.hypot(pr.x - cx, pr.y - cy) < R) pr.dead = true;
  for (const e of sc.enemies) {
    if (e.dead || Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) > R) continue;
    toolHurtEnemy(sc, e, TOOL.BOMB_DMG, Math.sign(e.x + e.w / 2 - cx) || 1, true);
  }
  for (const [b, k2] of bossRefs(sc)) {
    if (!liveBoss(b)) continue;
    if (Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < R + b.w / 2) toolHurtBoss(sc, k2, p, TOOL.BOMB_DMG);
  }
}

// ----- нитяной крюк (считает владелец) -----
function hookCast(sc: World, p: Player, a: { dx: number; dy: number; f: number }): void {
  const cx = p.x + 7, cy = p.y + 13;
  type Hit = { k: 'tile'; x: number; y: number; tx: number; ty: number; plat: boolean } | { k: 'enemy'; x: number; y: number; e: Enemy } | { k: 'boss'; x: number; y: number; b: Boss; key: BossRef };
  let hit: Hit | null = null, ex = cx + a.dx * TOOL.HOOK_R, ey = cy + a.dy * TOOL.HOOK_R;
  const bosses = bossRefs(sc).filter(([b]) => liveBoss(b));
  for (let d = 12; d <= TOOL.HOOK_R && !hit; d += 4) {
    const x = cx + a.dx * d, y = cy + a.dy * d, tx = Math.floor(x / T), ty = Math.floor(y / T), t = sc.tileAt(tx, ty);
    if (t === SOLID || t === PLAT) { hit = { k: 'tile', x, y, tx, ty, plat: t === PLAT }; break; }
    for (const e of sc.enemies) if (!e.dead && x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) { hit = { k: 'enemy', x, y, e }; break; }
    if (hit) break;
    for (const [b, key] of bosses) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { hit = { k: 'boss', x, y, b, key }; break; }
  }
  if (hit) { ex = hit.x; ey = hit.y; }
  sc.snd('throw');
  let pull: { x: number; y: number } | null = null;
  if (hit && hit.k === 'tile') {
    sc.snd('clink');
    pull = hit.plat ? { x: hit.x, y: hit.ty * T - 14 } : { x: hit.x - a.dx * 16, y: hit.y - a.dy * 16 };
  } else if (hit && hit.k === 'enemy') {
    const e = hit.e, small = e.hp <= 3 && e.type !== 'shell' && e.type !== 'beetle';
    sc.snd('clink');
    if (sc.auth()) freezeEnemy(sc, e, small ? TOOL.HOOK_STUN : 0.2); else sc.sendEv({ k: 'thook', i: p.i, t: 'e', idx: sc.enemies.indexOf(e), s: small ? 1 : 0 });
    if (small) { const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2, k = e.w / 2 + 14; pull = { x: ecx - a.dx * k, y: ecy - a.dy * k }; }
  } else if (hit && hit.k === 'boss') {
    const b = hit.b;
    if (b.stagger > 0 && !b.executed) {
      sc.snd('hitCrit');
      if (sc.auth()) toolHurtBoss(sc, hit.key, p, 1); else sc.sendEv({ k: 'thook', i: p.i, t: 'b', key: hit.key });
      const k = b.w / 2 + 14; pull = { x: b.x + b.w / 2 - a.dx * k, y: b.y + b.h / 2 - a.dy * k };
    } else sc.snd('clink');
  }
  tfxAdd(sc, { f: 'hook', x: cx, y: cy, x1: ex, y1: ey, t: 0.28, T: 0.28, i: p.i }, true);
  if (pull) p['hk'] = { tx: pull.x, ty: pull.y, ax: ex, ay: ey, t: 0.5, stuck: 0 };
}
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
