// Снаряды и бусины (legacy/src/game.js: stepProjs, stepBeads; обёртка «Зов нити» из charms.js).
import { HEAVY_KINDS, PERSIST_KINDS, T, clamp } from './balance';
import type { Proj } from './types';
import type { World } from './world';
import { inset, overlap } from './world';
import { hurtPlayer } from './damage';
import { stepExtraProj } from './bosses2';
import { stepBomb } from './bombs';
import { charmsOn } from './loadout';

export function stepProjs(sc: World, dt: number): void {
  for (const pr of sc.projs) {
    if (pr.dead) continue;
    if ((pr.delay ?? 0) > 0) { pr.delay! -= dt; continue; }
    pr.life -= dt; if (pr.life <= 0) { pr.dead = true; continue; }
    if (pr.kind === 'spore') {
      pr.vy += 700 * dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (sc.isSolid(Math.floor((pr.x + 6) / T), Math.floor((pr.y + 6) / T))) { pr.dead = true; sc.burst(6, pr.x + 6, pr.y + 6, 0xc7f08a); }
    } else if (pr.kind === 'wave') {
      pr.x += pr.vx * dt;
      const fx = pr.vx > 0 ? pr.x + pr.w : pr.x;
      if (sc.isSolid(Math.floor(fx / T), Math.floor((pr.y + 9) / T))) pr.dead = true;
    } else if (pr.kind === 'rock') {
      pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.y += pr.vy * dt;
      if (sc.isSolid(Math.floor((pr.x + 8) / T), Math.floor((pr.y + 16) / T))) { pr.dead = true; sc.dustAt(8, pr.x + 8, pr.y + 16); }
    } else if (pr.kind === 'bomb') { stepBomb(sc, pr as never, dt); continue; }
    else if (pr.kind === 'clef') stepClef(sc, pr as never, dt);
    else if (pr.kind === 'note') stepNote(sc, pr as never, dt);
    else stepExtraProj(sc, pr, dt); // остальные снаряды боссов: плевок, эхо
    if (pr.dead) continue;
    for (const p of sc.players) if (!p.remote && !p.downed && p.inv <= 0 && overlap(inset(p, 2), pr)) { hurtPlayer(sc, p, pr.dmg ?? (HEAVY_KINDS.has(pr.kind) ? 2 : 1), pr.x + pr.w / 2, false, pr.hk); if (!PERSIST_KINDS.has(pr.kind)) pr.dead = true; }
  }
  sc.projs = sc.projs.filter((pr: Proj) => !pr.dead);
}

// ----- снаряды Владика на данных (kinds/vladik2.ts) -----
/** ключ-бумеранг: вылетает, тормозит, возвращается к Владику и гаснет */
function stepClef(sc: World, pr: Record<string, number> & { x: number; w: number; vx: number; dead?: boolean }, dt: number): void {
  if (pr['t0']! > 0) { pr['t0']! -= dt; return; }
  pr.vx += pr['ax']! * dt; pr.x += pr.vx * dt; pr['rot']! += dt * 10;
  pr['y']! += Math.sin(pr['life']! * 6) * 30 * dt;
  // вернулся к Владику — исчез
  if (Math.sign(pr.vx) === Math.sign(pr['ax']!) && Math.abs(pr.x + 14 - pr['home']!) < 30) pr.dead = true;
  if (pr.x < T || pr.x + pr.w > (sc.L.W - 1) * T) { pr.vx = -pr.vx * 0.6; pr.x = clamp(pr.x, T, (sc.L.W - 1) * T - pr.w); }
}
function stepNote(sc: World, pr: { x: number; y: number; vx: number; vy: number; dead?: boolean }, dt: number): void {
  pr.vy = Math.min(pr.vy + 900 * dt, 700); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
  if (sc.isSolid(Math.floor((pr.x + 7) / T), Math.floor((pr.y + 16) / T))) { pr.dead = true; sc.burst(5, pr.x + 7, pr.y + 14, 0xffd47a); }
}

type BeadObj = { x: number; y: number; w: number; h: number; vx: number; vy: number; t: number; dead?: boolean; onGround?: boolean; hitL?: boolean; hitR?: boolean };
export function stepBeads(sc: World, dt: number): void {
  const beads = sc.beadsArr as unknown as BeadObj[];
  // «Зов нити»: бусины притягиваются издалека
  const callers = sc.players.filter((p) => !p.remote && !p.downed && charmsOn(p).some((c) => c.beadPull));
  if (callers.length) for (const bd of beads) {
    if (bd.dead || bd.t <= 0.35) continue;
    let best = null as (typeof callers)[number] | null, bd2 = 220;
    for (const p of callers) { const d = Math.hypot(p.x + 7 - bd.x - 4, p.y + 13 - bd.y - 4); if (d < bd2 && d >= 80) { bd2 = d; best = p; } }
    if (best) { // подтянуть в зону обычного притяжения
      const dx = best.x + 7 - bd.x - 4, dy = best.y + 13 - bd.y - 4, l = Math.hypot(dx, dy) || 1;
      bd.x += (dx / l) * 300 * dt; bd.y += (dy / l) * 300 * dt; bd.vy = Math.min(bd.vy, 0);
    }
  }
  for (const bd of beads) {
    bd.t += dt;
    const [tp, d] = sc.nearestPlayer(bd.x + 4, bd.y + 4);
    if (tp && d < 80 && bd.t > 0.35) {
      const dx = tp.x + 7 - bd.x, dy = tp.y + 13 - bd.y, l = Math.hypot(dx, dy) || 1;
      bd.x += (dx / l) * 420 * dt; bd.y += (dy / l) * 420 * dt;
      if (overlap(tp, bd)) { bd.dead = true; sc.beads++; sc.sfx('bead'); }
      continue;
    }
    const vy0 = bd.vy; bd.vy = Math.min(bd.vy + 1000 * dt, 700);
    sc.moveBody(bd, dt);
    if (bd.onGround) { if (vy0 > 140) bd.vy = -vy0 * 0.4; bd.vx *= 0.85; }
    if (bd.hitL || bd.hitR) bd.vx = -bd.vx * 0.5;
    if (bd.t > 30) bd.dead = true;
  }
  sc.beadsArr = beads.filter((b) => !b.dead) as never;
}
