// Существа-приспешники боссов на данных (волна 0): появляются по призыву (attack.summon, spawner арены), ходят или летают, бьют своими мини-связками
// (приёмы существа — тот же язык атак: замах, удары, снаряды, восстановление), исчезают по таймеру life (за fade кадров бледнеют и безвредны) и досрочно (vanishOn).
// Существо — обычный враг мира (sc.enemies, type 'dmin') с данными в e.m: герой бьёт его обычным оружием, бот копирует вместе с миром.
// Потолки: creature.max одновременно и rules.minions.maxTotal на весь бой.
import { P } from '../balance';
import { STEP } from '../constants';
import { hurtPlayer } from '../damage';
import type { Enemy } from '../types';
import type { World } from '../world';
import { inset, overlap } from '../world';
import { BOSS_RULES, bossDef } from './registry';
import { activeEnd, type Attack, type Creature } from './schema';
import { aimAt, boxRect, centerX, dstate, fireShots, freeSpot } from './shared';

export interface MinionRt {
  /** индекс босса-хозяина, id его определения и id существа в разделе creatures */
  o: number; bid: string; cid: string;
  age: number; acc: number;
  /** фаза хозяина при рождении (vanishOn: phase) */
  ph: number;
  mode: 'idle' | 'attack'; f: number; rest: number;
  atk: string | null; af: number; chain: string | null; step: number;
  hits: string[]; dir: number; lock: { x: number; y: number };
  /** замах для отрисовки: цвет и оставшиеся кадры */
  cue: { color: string; left: number; total: number } | null;
  fading: boolean;
  /** скорость вертикали, заданная приёмом (полёт) */
  mvy: boolean;
}

const creatureOf = (sc: World, m: MinionRt): Creature | undefined => {
  const b = sc.bosses[m.o]; const def = b ? bossDef(dstate(b).id) : undefined;
  return def?.creatures.find((c) => c.id === m.cid);
};
/** живые существа (все или одного вида) */
export const minionsAlive = (sc: World, cid?: string): Enemy[] => sc.enemies.filter((e) => !e.dead && e['m'] && (cid === undefined || (e['m'] as MinionRt).cid === cid));

/** Призвать существо cid босса own в точке (x, y) — центр тела. false — потолок (creature.max или rules.minions.maxTotal) или нет такого существа. */
export function spawnCreature(sc: World, own: number, cid: string, x: number, y: number): boolean {
  const b = sc.bosses[own]; if (!b) return false;
  const def = bossDef(dstate(b).id), cr = def?.creatures.find((c) => c.id === cid); if (!def || !cr) return false;
  if (sc.enemies.some((e) => e.dead && e['m'])) sc.enemies = sc.enemies.filter((e) => !(e.dead && e['m'])); // погибших убираем
  const alive = minionsAlive(sc);
  if (alive.length >= (BOSS_RULES.minions?.maxTotal ?? 8) || alive.filter((e) => (e['m'] as MinionRt).cid === cid).length >= cr.max) return false;
  const r = freeSpot(sc, { x: x - cr.size.w / 2, y: y - cr.size.h / 2, w: cr.size.w, h: cr.size.h });
  const m: MinionRt = { o: own, bid: def.id, cid, age: 0, acc: 0, ph: b.phase || 1, mode: 'idle', f: 0, rest: cr.rest[0], atk: null, af: 0, chain: null, step: 0, hits: [], dir: -1, lock: { x: 0, y: 0 }, cue: null, fading: false, mvy: false };
  sc.enemies.push({ type: 'dmin', x: r.x, y: r.y, w: r.w, h: r.h, vx: 0, vy: 0, face: -1, flash: 0, kbT: 0, kbx: 0, kby: 0, dead: false, t: 0, hp: cr.hp, beads: cr.beads, m } as Enemy);
  sc.burst(10, x, y, cr.color); sc.sfx('puff');
  return true;
}

function vanish(sc: World, e: Enemy): void {
  e.dead = true; sc.burst(10, e.x + e.w / 2, e.y + e.h / 2, 0xcfd8d4); sc.emit('minionVanish', { x: e.x, y: e.y, w: e.w, h: e.h });
}

/** Шаг существа (вызывает stepEnemy): дробные кадры копятся, как у босса, поэтому замедление и оцепенение работают */
export function stepMinion(sc: World, e: Enemy, dt: number): void {
  const m = e['m'] as MinionRt, cr = creatureOf(sc, m);
  e.flash -= dt; e.t += dt;
  if (!cr) { vanish(sc, e); return; }
  m.acc += dt / STEP;
  while (m.acc > 1 - 1e-6 && !e.dead) { m.acc -= 1; frame(sc, e, m, cr); }
  if (e.dead) return;
  if (e.kbT > 0) { e.kbT -= dt; e.vx = e.kbx; if (cr.fly) e.vy = e.kby; }
  if (!cr.fly) e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
  sc.moveBody(e, dt);
}

function frame(sc: World, e: Enemy, m: MinionRt, cr: Creature): void {
  const ob = sc.bosses[m.o];
  m.age++;
  if (cr.life !== undefined && m.age >= cr.life) { vanish(sc, e); return; }
  if (ob && ((cr.vanishOn.includes('bossDeath') && ob.state === 'dead') || (cr.vanishOn.includes('stagger') && ob.stagger > 0) || (cr.vanishOn.includes('phase') && (ob.phase || 1) !== m.ph))) { vanish(sc, e); return; }
  m.fading = cr.life !== undefined && cr.life - m.age <= cr.fade;
  const cx = centerX(e), cy = e.y + e.h / 2, [tp] = sc.nearestPlayer(cx, cy);
  if (e.kbT > 0) return;
  if (m.mode === 'idle') {
    m.cue = null;
    const dir = tp ? (tp.x + 7 > cx ? 1 : -1) : e.face, dx = tp ? Math.abs(tp.x + 7 - cx) : 0;
    if (tp) e.face = dir;
    if (cr.speed > 0 && dx > 26 && (e.onGround || cr.fly)) e.vx = dir * cr.speed; else if (e.onGround || cr.fly) e.vx = 0;
    if (cr.fly) {
      const A = sc.arena, floor = A ? A.floor : (e.y + e.h), want = floor - cr.fly.hover - e.h, err = want + Math.sin(e.t * 2) * cr.fly.bob - e.y;
      e.vy = Math.max(-cr.fly.speed, Math.min(cr.fly.speed, err * 4));
    }
    m.f++;
    if (m.f >= m.rest && cr.chains.length && !m.fading) startChain(sc, e, m, cr, tp);
  } else attackFrame(sc, e, m, cr, tp);
  if (cr.contact && !m.fading) {
    for (const p of sc.players) if (!p.remote && !p.downed && p.inv <= 0 && overlap(inset(p, 2), inset(e, 2))) hurtPlayer(sc, p, cr.contact.dmg, cx, false, cr.contact.kind);
  }
}

function startChain(sc: World, e: Enemy, m: MinionRt, cr: Creature, tp: { x: number; y: number } | null): void {
  const rng = sc.rngFor('minion'), sum = cr.chains.reduce((s, c) => s + c.weight, 0);
  let x = rng() * sum, pick = cr.chains[cr.chains.length - 1]!;
  for (const c of cr.chains) { x -= c.weight; if (x < 0) { pick = c; break; } }
  m.chain = pick.id; m.step = 0; startAtk(e, m, cr, tp);
}
function startAtk(e: Enemy, m: MinionRt, cr: Creature, tp: { x: number; y: number } | null): void {
  const c = cr.chains.find((x) => x.id === m.chain)!, a = cr.attacks.find((x) => x.id === c.steps[m.step])!;
  m.mode = 'attack'; m.atk = a.id; m.af = 0; m.hits = []; m.mvy = false;
  m.cue = { color: a.tell.cue.color, left: a.tell.frames, total: a.tell.frames };
  if (a.tell.lockFace && tp) e.face = tp.x + 7 > centerX(e) ? 1 : -1;
  m.dir = e.face; m.lock = { x: tp ? tp.x + 7 : centerX(e) + e.face * 100, y: tp ? tp.y + 13 : e.y + e.h / 2 };
}

function attackFrame(sc: World, e: Enemy, m: MinionRt, cr: Creature, tp: ReturnType<World['nearestPlayer']>[0]): void {
  const a: Attack = cr.attacks.find((x) => x.id === m.atk)!, c = cr.chains.find((x) => x.id === m.chain)!;
  const T0 = a.tell.frames, end = activeEnd(a), af = m.af, last = m.step >= c.steps.length - 1;
  if (af < T0) {
    if (m.cue) m.cue.left = T0 - af;
    if (!a.tell.lockFace && tp) e.face = tp.x + 7 > centerX(e) ? 1 : -1;
    if (e.onGround || cr.fly) e.vx = 0;
    m.dir = e.face; m.lock = { x: tp ? tp.x + 7 : m.lock.x, y: tp ? tp.y + 13 : m.lock.y };
  } else {
    const t = af - T0;
    m.cue = null;
    if (t <= end) {
      if (t === 0) e.face = m.dir;
      let moving = false;
      a.move.forEach((mv, mi) => {
        if (t < mv.from || t > mv.to) return;
        moving = true;
        const key = `m${mi}`;
        if (!m.hits.includes(key)) {
          m.hits.push(key);
          if (mv.vy !== 0 && !cr.fly) e.vy = mv.vy;
        }
        const sgn = mv.toward === 'fixed' ? 1 : tp ? (tp.x + 7 > centerX(e) ? 1 : -1) : e.face;
        e.vx = sgn * mv.vx; if (cr.fly && mv.vy !== 0) e.vy = mv.vy;
      });
      if (!moving && (e.onGround || cr.fly)) e.vx = 0;
      a.active.forEach((h, ai) => {
        if (t < h.from || t > h.to) return;
        const box = boxRect(e, m.dir, h.hit, m.lock);
        for (const p of sc.players) {
          if (p.remote || p.downed || p.inv > 0) continue;
          const key = `${ai}:${p.i}`;
          if (m.hits.includes(key) || !overlap(inset(p, 2), box)) continue;
          m.hits.push(key);
          hurtPlayer(sc, p, h.dmg, box.x + box.w / 2, false, h.kind);
        }
      });
      for (const s of a.spawn) if (s.at === t) {
        const cx = centerX(e), cy = e.y + e.h / 2, base = s.from === 'target' ? { x: m.lock.x + s.ox, y: m.lock.y + s.oy } : { x: cx + m.dir * s.ox, y: cy + s.oy };
        let vx = s.from === 'target' ? s.vx : m.dir * s.vx, vy = s.vy;
        if (s.aim) { const v = aimAt(base, tp, Math.hypot(s.vx, s.vy), m.dir); vx = v.vx; vy = v.vy; }
        fireShots(sc, base, vx, vy, s, m.o);
      }
    } else if (e.onGround || cr.fly) e.vx = 0;
  }
  m.af++;
  if (m.af >= T0 + Math.max(0, end) + 1 + a.recovery.frames) {
    if (last) { m.mode = 'idle'; m.chain = null; m.atk = null; m.f = 0; const r = sc.rngFor('minion'); m.rest = cr.rest[0] + Math.floor(r() * (cr.rest[1] - cr.rest[0] + 1)); }
    else { m.step++; startAtk(e, m, cr, tp); }
  }
}
