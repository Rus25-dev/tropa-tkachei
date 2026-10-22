// Стая мышей (точка уровня «bats» — три мыши): висят под потолком; проснувшись, кружат над героем и по очереди пикируют.
import { T, clamp } from '../../core/balance';
import { defineEnemy, e2Knock, mk2 } from '../../core/enemy-kit';
import type { Enemy } from '../../core/types';
import type { World } from '../../core/world';

type Sq = { bats: Enemy[]; awake: boolean; t: number; n: number };

// (3) Стая мышей: висят под потолком; проснувшись, кружат над игроком, а по очереди пикируют
function stepBat(sc: World, e: Enemy, dt: number): void {
  const sq = e['sq'] as Sq;
  if (sq.bats.find((b) => !b.dead) === e) batSquad(sc, sq, dt);
  if (e.kbT > 0 && (e['state'] === 'dive' || e['state'] === 'wind')) { e['state'] = 'rise'; e['st'] = 0.8; }
  if (e2Knock(sc, e, dt, true)) return;
  e['st'] -= dt;
  const [tp] = sc.nearestPlayer(e.x + 10, e.y + 8), cx = e.x + 10, cy = e.y + 8;
  const steer = (tx: number, ty: number, spd: number, k: number): void => {
    const dx = tx - cx, dy = ty - cy, dl = Math.hypot(dx, dy) || 1;
    e.vx += ((dx / dl) * spd - e.vx) * Math.min(1, dt * k); e.vy += ((dy / dl) * spd - e.vy) * Math.min(1, dt * k);
  };
  const above = (): { x: number; y: number } => ({ x: tp ? clamp(tp.x + 7 + (e['k'] - 1) * 70 + Math.sin(e.t * 1.3 + e['k'] * 2) * 26, e['hx'] - 340, e['hx'] + 340) : e['hx'], y: tp ? Math.max(tp.y - 105 + Math.sin(e.t * 2 + e['k']) * 14, e['hy'] + 36) : e['hy'] + 40 });
  switch (e['state']) {
    case 'roost': e.vx = e.vy = 0; e.x = e['hx'] - 10; e.y = e['hy']; return;
    case 'hover': { const a = above(); steer(a.x, a.y, 120, 2.4); e.face = e.vx >= 0 ? 1 : -1; break; }
    case 'wind': // замирает, багровеют глаза, потом бросок в то место, где был игрок
      e.vx += (0 - e.vx) * Math.min(1, dt * 8); e.vy += (-25 - e.vy) * Math.min(1, dt * 8);
      if (tp) e.face = tp.x + 7 > cx ? 1 : -1;
      if (e['st'] <= 0 && tp) {
        const ax = tp.x + 7 + clamp((tp.vx || 0) * 0.12, -30, 30) - cx, ay = tp.y + 16 - cy, dl = Math.hypot(ax, ay) || 1;
        e.vx = (ax / dl) * 400; e.vy = (ay / dl) * 400; e['state'] = 'dive'; e['st'] = 1.0; sc.sfx('dash');
      } else if (e['st'] <= 0) { e['state'] = 'rise'; e['st'] = 0.5; }
      break;
    case 'dive': {
      const rx = tp ? tp.x + 7 - cx : 0, ry = tp ? tp.y + 13 - cy : 0;
      if (e['st'] <= 0 || e.onGround || e.hitL || e.hitR || e.hitU || (tp && rx * e.vx + ry * e.vy < 0 && Math.hypot(rx, ry) > 30)) { e['state'] = 'rise'; e['st'] = 0.9; }
      break;
    }
    case 'rise': {
      const home = !sq.awake, a = above();
      steer(home ? e['hx'] : a.x, home ? e['hy'] + 8 : a.y, 150, 3); e.face = e.vx >= 0 ? 1 : -1;
      if (home && Math.hypot(e['hx'] - cx, e['hy'] + 8 - cy) < 10) { e['state'] = 'roost'; e.vx = e.vy = 0; return; }
      if (!home && e['st'] <= 0) e['state'] = 'hover';
      break;
    }
  }
  sc.moveBody(e, dt);
}
// дирижёр стаи (его ведёт первая живая мышь): будит, выпускает в пике по одной, усыпляет
function batSquad(sc: World, sq: Sq, dt: number): void {
  const alive = sq.bats.filter((b) => !b.dead), lead = alive[0]!;
  const [tp] = sc.nearestPlayer(lead['hx'], lead['hy']);
  const near = (r: number): boolean => !!tp && Math.abs(tp.x + 7 - lead['hx']) < r && tp.y + 13 > lead['hy'] - 80 && tp.y + 13 < lead['hy'] + 520;
  if (!sq.awake) {
    if (near(300)) { sq.awake = true; sq.t = 1.0; for (const b of alive) if (b['state'] === 'roost') { b['state'] = 'hover'; b.vy = 70; } sc.sfx('dash'); }
    return;
  }
  if (!near(460)) { sq.awake = false; for (const b of alive) if (b['state'] === 'hover') { b['state'] = 'rise'; b['st'] = 99; } return; } // игрок ушёл — возвращаются на потолок
  sq.t -= dt;
  if (sq.t <= 0) { // пикирует та, что дольше всех не пикировала
    const cand = alive.filter((b) => b['state'] === 'hover').sort((a, b) => a['order'] - b['order'])[0];
    if (cand) { cand['state'] = 'wind'; cand['st'] = 0.55; cand['order'] = ++sq.n; sq.t = 1.15; sc.sfx('spit'); } else sq.t = 0.3;
  }
}

export default defineEnemy({
  id: 'bat', order: 5, levelType: 'bats', e2: true, flies: true, states: ['roost', 'hover', 'wind', 'dive', 'rise'],
  spawn: (sc, d, base, { fx }) => { // три мыши висят под потолком (d.y — первая свободная клетка под ним)
    const sq: Sq = { bats: [], awake: false, t: 1, n: 0 };
    return [-22, 0, 22].map((ox, k) => {
      const b = mk2(sc, base, { type: 'bat', w: 20, h: 16, x: fx + ox - 10, y: d.y * T, hx: fx + ox, hy: d.y * T, hp: 2, beads: 2, state: 'roost', k, sq, order: 0 });
      sq.bats.push(b); return b;
    });
  },
  step: stepBat,
});
