// Прыгун-засадник: прячется под полом, ползёт под героем, трещит землёй и выпрыгивает; потом ещё бросок.
import { E2_UNDER, E2_VULN, P, T } from '../../core/balance';
import { defineEnemy, e2Knock, mk2 } from '../../core/enemy-kit';
import type { Enemy } from '../../core/types';
import type { World } from '../../core/world';

// (4) Прыгун-засадник: прячется под полом, ползёт под игроком, трещит землёй и выпрыгивает; потом ещё бросок
function stepLurker(sc: World, e: Enemy, dt: number): void {
  const under = E2_UNDER.includes(e['state']);
  if (!under) e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
  if (!under && e2Knock(sc, e, dt, false)) return;
  e['st'] -= dt; e['cd'] -= dt;
  const [tp] = sc.nearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
  const cx = e.x + e.w / 2, row = Math.round(e['fy'] / T);
  const px = tp ? tp.x + 7 : 0, onFloor = tp && tp.onGround && Math.abs(tp.y + 26 - e['fy']) < 48;
  switch (e['state']) {
    case 'hidden':
      e.y = e['fy'] + 50; e.vx = e.vy = 0;
      if (tp && e['cd'] <= 0 && onFloor && Math.abs(px - cx) < 170) { e['state'] = 'track'; e['st'] = 2.2; }
      break;
    case 'track': {
      e.y = e['fy'] + 50;
      if (!tp || Math.abs(px - cx) > 280 || Math.abs(tp.y + 26 - e['fy']) > 140) { e['state'] = 'hidden'; e['cd'] = 1.2; break; }
      const dir = Math.sign(px - cx) || 1, nx = e.x + dir * 150 * dt, col = Math.floor((nx + e.w / 2) / T);
      if (!sc.isSolid(col, row - 1) && sc.groundBelowSolid(col * T + 4, row * T + 4)) e.x = nx;
      if (Math.abs(px - (e.x + e.w / 2)) < 24 || e['st'] <= 0) { e['state'] = 'warn'; e['st'] = 0.75; sc.sfx('squish'); } // замирает там, где остановился
      break;
    }
    case 'warn': // трещины и красный круг на земле: уходи с этого места
      e.y = e['fy'] + 50;
      if (e['st'] <= 0) { e['state'] = 'erupt'; e['air'] = 0; e.y = e['fy'] - e.h; e.vy = -640; e.vx = 0; sc.shake(200, 0.008); sc.sfx('slam'); sc.dustAt(10, cx, e['fy']); }
      break;
    case 'erupt':
      e['air'] += dt; sc.moveBody(e, dt);
      if (e.onGround && e['air'] > 0.15) { e['state'] = 'tell'; e['st'] = 0.35; e.vx = 0; e['fy'] = e.y + e.h; }
      return;
    case 'tell': // присел перед броском
      e.vx = 0; if (tp) e.face = px > cx ? 1 : -1;
      if (e['st'] <= 0) { e['state'] = 'pounce'; e['air'] = 0; e.vx = e.face * 240; e.vy = -420; sc.sfx('jump'); }
      break;
    case 'pounce':
      e['air'] += dt; sc.moveBody(e, dt);
      if (e.onGround && e['air'] > 0.1) { e['state'] = 'tired'; e['st'] = 1.1; e.vx = 0; e['fy'] = e.y + e.h; }
      return;
    case 'tired': e.vx = 0; if (e['st'] <= 0) { e['state'] = 'dig'; e['st'] = 0.5; e.y = e['fy'] + 50; sc.dustAt(6, cx, e['fy']); } break;
    case 'dig': e.y = e['fy'] + 50; if (e['st'] <= 0) { e['state'] = 'hidden'; e['cd'] = 2.2; } break;
  }
  if (!under || e['state'] === 'erupt') sc.moveBody(e, dt);
}

export default defineEnemy({
  id: 'lurker', order: 6, e2: true, flies: true, trapImmune: true, states: ['hidden', 'track', 'warn', 'erupt', 'tell', 'pounce', 'tired', 'dig'],
  spawn: (sc, _d, base, { fx, fy }) => [mk2(sc, base, { w: 28, h: 24, x: fx - 14, y: fy + 50, hp: 3, beads: 5, state: 'hidden', fy, cd: 0.5 })],
  step: stepLurker,
  blocked: (_sc, e) => !E2_VULN.includes(e['state']), // бить можно только вне земли
  dotImmune: (e) => E2_UNDER.includes(e['state']),
});
