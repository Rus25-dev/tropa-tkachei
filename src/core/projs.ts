// Снаряды и бусины (legacy/src/game.js: stepProjs, stepBeads; обёртка «Зов нити» из charms.js).
// Поведение вида снаряда — в src/content/projectiles/<kind>.ts; здесь общий цикл: задержка, срок жизни, шаг вида, попадание в героя.
import type { Proj } from './types';
import type { World } from './world';
import { inset, overlap } from './world';
import { hurtPlayer } from './damage';
import { projReg } from './plugin/regs';
import { projDmg } from './proj-kit';
import { charmsOn } from './loadout';

export function stepProjs(sc: World, dt: number): void {
  for (const pr of sc.projs) {
    if (pr.dead) continue;
    if ((pr.delay ?? 0) > 0) { pr.delay! -= dt; continue; }
    pr.life -= dt; if (pr.life <= 0) { pr.dead = true; continue; }
    const d = projReg.get(pr.kind);
    d?.step?.(sc, pr, dt); // вид снаряда: src/content/projectiles/<kind>.ts
    if (pr.dead || d?.hero) continue;
    for (const p of sc.players) if (!p.remote && !p.downed && p.inv <= 0 && overlap(inset(p, 2), pr)) { hurtPlayer(sc, p, projDmg(pr), pr.x + pr.w / 2, false, pr.hk); if (!d?.persist) pr.dead = true; }
  }
  sc.projs = sc.projs.filter((pr: Proj) => !pr.dead);
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
