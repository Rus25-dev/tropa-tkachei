// Нитяные заклинания (v2.5, набор игрока): «Нитяной снаряд» (Vengeful Spirit), «Нырок» (Desolate Dive), «Вопль» (Howling Wraiths).
// Это записи реестра TOOLS (кнопка инструмента, без новых кнопок): тратят нить, имеют перезарядку, открываются как остальные инструменты (unlock).
// Снаряд и вопль живут в w.tl и считаются хостом (гость шлёт сообщение 'tool', как для иглы и бомбы); нырок ведёт герой-владелец (moves.ts),
// а удары нырка уходят хосту сообщениями 'tool' с id 'divestrike' и 'diveland'.
// Баланс: урон по боссу за одно применение делённый на перезарядку (nominal DPS) лежит в пределах ±25 % от иглы (KIT.NEEDLE_DPS), как у оружия.
import { KIT, T } from '../balance';
import type { BossRef } from '../balance';
import { bossRefs } from '../bosses2';
import type { Boss, Player } from '../types';
import type { World } from '../world';
import { inset, overlap } from '../world';
import { liveBoss, toolHurtBoss, toolHurtEnemy, toolOwner, tfxAdd, type ToolMsg } from '../tools';
import { diveBegin } from './moves';

type Q = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- сущности инструментов: мешок полей, как в tools.ts

export const SPELL_IDS = new Set(['spirit', 'dive', 'wraith']);
/** виды сущностей-заклинаний в w.tl и в снимке гостя (размеры — в netplay.NET_SIZES) */
export const SPELL_KINDS = new Set(['tspirit', 'twraith']);
export const SPIRIT_SIZE: [number, number] = [28, 22];
export const WRAITH_SIZE: [number, number] = [KIT.WRAITH.W, KIT.WRAITH.H];

/** номинальный урон по боссу за одно применение (все удары попали) */
export const spellDamage = (id: string): number =>
  id === 'spirit' ? KIT.SPIRIT.DMG : id === 'dive' ? KIT.DIVE.LAND_DMG + KIT.DIVE.STRIKE : id === 'wraith' ? KIT.WRAITH.DMG * KIT.WRAITH.PULSES : 0;
export const spellCd = (id: string): number => (id === 'spirit' ? KIT.SPIRIT.CD : id === 'dive' ? KIT.DIVE.CD : KIT.WRAITH.CD);

const dirOf = (p: Player): number => ((p.inp.right ? 1 : 0) - (p.inp.left ? 1 : 0)) || p.face || 1;

/** кнопка инструмента: применить заклинание; false — не получилось (нить не потрачена) */
export function spellCast(sc: World, id: string, p: Player): boolean {
  if (id === 'dive') {
    if (p['dv']) return false;
    if (p.onGround) { diveLand(sc, p); return true; } // с земли нырок сразу бьёт оземь
    diveBegin(sc, p); return true;
  }
  const f = dirOf(p);
  const msg: ToolMsg = { id, i: p.i, x: Math.round(p.x + 7), y: Math.round(id === 'wraith' ? p.y + p.h : p.y + 13), dx: f, dy: 0, f };
  sc.snd(id === 'spirit' ? 'spirit' : 'wraith');
  if (sc.auth()) spellSpawn(sc, msg); else sc.sendEv({ k: 'tool', ...msg });
  return true;
}

/** хост (или одиночная игра): создать сущность заклинания или применить удар нырка */
export function spellSpawn(sc: World, m: ToolMsg): void {
  const tl = sc.tl as Q[];
  if (m.id === 'spirit') {
    const [w, h] = SPIRIT_SIZE;
    tl.push({ kind: 'tspirit', x: m.x + m.f * 12 - w / 2, y: m.y - h / 2, w, h, vx: m.f * KIT.SPIRIT.SPD, vy: 0, life: KIT.SPIRIT.LIFE, owner: m.i, hit: new Set(), f: m.f, age: 0 });
  } else if (m.id === 'wraith') {
    const life = KIT.WRAITH.PULSES * KIT.WRAITH.GAP + 0.3;
    tl.push({ kind: 'twraith', x: m.x - KIT.WRAITH.W / 2, y: m.y - KIT.WRAITH.H, w: KIT.WRAITH.W, h: KIT.WRAITH.H, vx: 0, vy: 0, life, T: life, owner: m.i, n: 0, gap: 0 });
    sc.burst(10, m.x, m.y - 6, 0xcfe8ff);
  } else if (m.id === 'divestrike') diveStrikeHit(sc, toolOwner(sc, m.i), m.x, m.y);
  else if (m.id === 'diveland') diveLandHit(sc, toolOwner(sc, m.i), m.x, m.y);
}

const kdirOf = (e: { x: number; w: number }, cx: number): number => Math.sign(e.x + e.w / 2 - cx) || 1;

/** шаг сущностей-заклинаний (вызывается из tools.stepTools) */
export function stepSpell(sc: World, q: Q, dt: number, bosses: [Boss, BossRef][]): void {
  if (q['kind'] === 'tspirit') stepSpirit(sc, q, dt, bosses);
  else stepWraith(sc, q, dt, bosses);
}

function stepSpirit(sc: World, q: Q, dt: number, bosses: [Boss, BossRef][]): void {
  const owner = toolOwner(sc, q['owner']), f = q['f'] as number;
  q['age'] += dt;
  for (let s = 0; s < 2 && !q['dead']; s++) {
    q['x'] += q['vx'] * dt / 2;
    const cx = q['x'] + q['w'] / 2, cy = q['y'] + q['h'] / 2;
    if (sc.isSolid(Math.floor((cx + f * q['w'] / 2) / T), Math.floor(cy / T))) { q['dead'] = true; sc.sfx('clink'); sc.burst(8, cx, cy, 0xcfe8ff); break; }
    for (const e of sc.enemies) {
      if (e.dead || q['hit'].has(e) || !overlap(q as never, e)) continue;
      q['hit'].add(e);
      const ok = toolHurtEnemy(sc, e, KIT.SPIRIT.DMG, f, false);
      if (!ok || !e.dead) { q['dead'] = true; sc.burst(8, cx, cy, 0xcfe8ff); break; } // броня и крепких не пробивает; слабых (убитых) — насквозь
    }
    if (q['dead']) break;
    for (const [b, key] of bosses) {
      if (!liveBoss(b) || !overlap(q as never, inset(b, 4))) continue;
      if (b.state === 'rage') { sc.sfx('clink'); q['dead'] = true; sc.burst(6, cx, cy, 0xffffff); break; }
      toolHurtBoss(sc, key, owner, KIT.SPIRIT.DMG);
      q['dead'] = true; sc.sfx('clink'); sc.burst(14, cx, cy, 0xcfe8ff); break;
    }
    const m = sc.misha;
    if (!q['dead'] && m && !['dead', 'intro'].includes(m.state) && overlap(q as never, inset(m, 6))) { q['dead'] = true; sc.sfx('clink'); sc.burst(6, cx, cy, 0xffffff); }
  }
  if (!q['dead'] && Math.floor(q['age'] * 60) % 3 === 0) sc.parts(1, q['x'] + q['w'] / 2 - f * 10, q['y'] + q['h'] / 2, 0xcfe8ff);
}

function stepWraith(sc: World, q: Q, dt: number, bosses: [Boss, BossRef][]): void {
  const owner = toolOwner(sc, q['owner']);
  q['gap'] -= dt;
  if (q['gap'] > 0 || q['n'] >= KIT.WRAITH.PULSES) return;
  q['gap'] += KIT.WRAITH.GAP; q['n']++;
  const cx = q['x'] + q['w'] / 2;
  sc.sfx('hit');
  for (const e of sc.enemies) {
    if (e.dead || !overlap(q as never, e)) continue;
    if (toolHurtEnemy(sc, e, KIT.WRAITH.DMG, kdirOf(e, cx), false) && !e.dead) { e.kby = -260; e.kbx *= 0.3; }
  }
  for (const [b, key] of bosses) if (liveBoss(b) && b.state !== 'rage' && overlap(q as never, inset(b, 2))) toolHurtBoss(sc, key, owner, KIT.WRAITH.DMG);
  for (const pr of sc.projs) {
    if (pr.dead || pr.kind === 'bomb' || pr.hk === 'unblockable' || (pr.delay ?? 0) > 0 || !overlap(q as never, pr)) continue;
    pr.dead = true; sc.burst(5, pr.x + pr.w / 2, pr.y + pr.h / 2, 0xcfe8ff);
  }
  sc.burst(6, cx + (q['n'] % 2 ? -8 : 8), q['y'] + q['h'] - 24 * q['n'], 0xcfe8ff);
}

// ----- нырок: удары -----
/** герой в падении касается цели (вызывает владелец): один раз за нырок. true — удар засчитан или отправлен */
export function diveStrike(sc: World, p: Player): boolean {
  const r = { x: p.x - 4, y: p.y + p.h - 6, w: p.w + 8, h: 30 };
  const hit = sc.enemies.some((e) => !e.dead && overlap(r, e)) || bossRefs(sc).some(([b]) => liveBoss(b) && overlap(r, inset(b, 4)));
  if (!hit) return false;
  const cx = Math.round(p.x + p.w / 2), fy = Math.round(p.y + p.h);
  if (sc.auth()) diveStrikeHit(sc, p, cx, fy); else sc.sendEv({ k: 'tool', id: 'divestrike', i: p.i, x: cx, y: fy, dx: 0, dy: 0, f: 1 });
  return true;
}
function diveStrikeHit(sc: World, p: Player, cx: number, fy: number): void {
  const r = { x: cx - 18, y: fy - 36, w: 36, h: 66 };
  for (const e of sc.enemies) if (!e.dead && overlap(r, e)) toolHurtEnemy(sc, e, 2, kdirOf(e, cx), false);
  for (const [b, key] of bossRefs(sc)) if (liveBoss(b) && b.state !== 'rage' && overlap(r, inset(b, 4))) toolHurtBoss(sc, key, p, KIT.DIVE.STRIKE);
}
/** приземление нырка: ударная волна по земле */
export function diveLand(sc: World, p: Player): void {
  const cx = Math.round(p.x + p.w / 2), fy = Math.round(p.y + p.h);
  sc.snd('diveLand'); sc.shake(200, 0.009); sc.dustAt(10, cx, fy);
  sc.parts(24, cx, fy - 4, 0xcfe8ff);
  if (sc.auth()) diveLandHit(sc, p, cx, fy); else sc.sendEv({ k: 'tool', id: 'diveland', i: p.i, x: cx, y: fy, dx: 0, dy: 0, f: 1 });
}
function diveLandHit(sc: World, p: Player, cx: number, fy: number): void {
  const R = KIT.DIVE.R, r = { x: cx - R, y: fy - 52, w: R * 2, h: 60 };
  tfxAdd(sc, { f: 'shock', x: cx, y: fy, t: 0.4, T: 0.4 }, true);
  for (const pr of sc.projs) if (!pr.dead && pr.kind !== 'bomb' && pr.hk !== 'unblockable' && !(pr.delay && pr.delay > 0) && overlap(r, pr)) pr.dead = true;
  for (const e of sc.enemies) if (!e.dead && overlap(r, e)) { toolHurtEnemy(sc, e, KIT.DIVE.ENEMY_DMG, kdirOf(e, cx), true); if (!e.dead) e.kby = -240; }
  for (const [b, key] of bossRefs(sc)) if (liveBoss(b) && b.state !== 'rage' && overlap(r, inset(b, 2))) toolHurtBoss(sc, key, p, KIT.DIVE.LAND_DMG);
}
