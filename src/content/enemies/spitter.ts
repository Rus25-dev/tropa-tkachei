// Плевальщик: держит дистанцию и плюёт дугой; вблизи убегает, в углу перепрыгивает через героя.
import { P, clamp } from '../../core/balance';
import { defineEnemy, ledgeAhead, e2Knock, mk2 } from '../../core/enemy-kit';
import type { Enemy, Player } from '../../core/types';
import type { World } from '../../core/world';

// (1) Плевальщик: держит дистанцию и плюёт дугой; вблизи убегает, в углу перепрыгивает через игрока
function stepSpitter(sc: World, e: Enemy, dt: number): void {
  e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
  if (e2Knock(sc, e, dt, false)) return;
  e['st'] -= dt; e['cd'] -= dt;
  const [tp, d] = sc.nearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
  const dx = tp ? tp.x + 7 - (e.x + e.w / 2) : 0, ad = Math.abs(dx), dy = tp ? tp.y + 13 - (e.y + e.h / 2) : 0, away = dx > 0 ? -1 : 1;
  switch (e['state']) {
    case 'idle':
      e.vx = 0;
      if (!tp || d > 480) { // дежурит возле места
        if (Math.abs(e.x - e['hx']) > 50) e.face = e.x < e['hx'] ? 1 : -1;
        else if (e.hitL || e.hitR || ledgeAhead(sc, e) || sc.rEnemy() < dt * 0.3) e.face = -e.face;
        e.vx = e.face * 28; if (ledgeAhead(sc, e)) { e.face = -e.face; e.vx = 0; }
      } else {
        e.face = dx > 0 ? 1 : -1;
        if (ad < 115 && Math.abs(dy) < 90) { e['state'] = 'flee'; e['st'] = 0.9; }
        else if (e['cd'] <= 0 && ad <= 420 && Math.abs(dy) < 200) { e['state'] = 'wind'; e['st'] = 0.65; sc.sfx('spit'); }
      }
      break;
    case 'flee':
      e.face = away; e.vx = away * 150;
      if (ledgeAhead(sc, e) || e.hitL || e.hitR) { // загнали в угол — прыжок через игрока
        e['state'] = 'hop'; e.vy = -430; e.vx = -away * 210; e.face = -away; e['st'] = 0.2;
      } else if (e['st'] <= 0 && ad > 170) { e['state'] = 'idle'; e['cd'] = Math.min(e['cd'], 0.35); }
      break;
    case 'hop':
      if (e.onGround && e['st'] <= 0) { e['state'] = 'idle'; e['cd'] = 0.5; e.vx = 0; }
      break;
    case 'wind': // щёки раздуваются: время уйти с линии
      e.vx = 0; if (tp) e.face = dx > 0 ? 1 : -1;
      if (e['st'] <= 0) { if (tp) spitAt(sc, e, tp); e['state'] = 'recover'; e['st'] = 0.5; e['cd'] = 2.0; }
      break;
    case 'recover': e.vx = 0; if (e['st'] <= 0) e['state'] = 'idle'; break;
  }
  sc.moveBody(e, dt);
}
function spitAt(sc: World, e: Enemy, tp: Player): void {
  const ox = e.x + e.w / 2 + e.face * 10, oy = e.y + 6, G = 700;
  const tx = tp.x + 7 + clamp((tp.vx || 0) * 0.2, -40, 40), ty = tp.y + 13;
  const tf = clamp(Math.abs(tx - ox) / 260, 0.45, 1.1);
  sc.projs.push({ kind: 'glob', x: ox - 6, y: oy - 6, w: 12, h: 12, vx: clamp((tx - ox) / tf, -420, 420), vy: clamp((ty - oy - 0.5 * G * tf * tf) / tf, -800, 400), life: 3.2 });
  sc.sfx('spit'); sc.burst(5, ox, oy, 0xc7f08a);
}

export default defineEnemy({
  id: 'spitter', order: 3, e2: true, states: ['idle', 'flee', 'hop', 'wind', 'recover'],
  spawn: (sc, _d, base, { fx, fy }) => [mk2(sc, base, { w: 22, h: 20, x: fx - 11, y: fy - 20, hp: 3, beads: 4, state: 'idle', hx: fx, face: -1 })],
  step: stepSpitter,
});
