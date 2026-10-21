// Враги: ползун, комар, жук (legacy/src/game.js) и «Враги 2»: плевальщик, панцирь, стая мышей, засадник (legacy/src/enemies2.js).
import { E2_UNDER, E2_VULN, P, T, clamp } from './balance';
import type { Enemy, Player } from './types';
import type { World } from './world';
import { stepFrozen } from './tools';
import { slowDt } from './status';

type D = { type: string; x: number; y: number };
type Sq = { bats: Enemy[]; awake: boolean; t: number; n: number };

// ----- появление -----
export function spawnEnemies(sc: World): void {
  sc.enemies = sc.L.enemies.flatMap((d): Enemy[] => {
    const base = { type: d.type, vx: 0, vy: 0, face: -1, flash: 0, kbT: 0, kbx: 0, kby: 0, dead: false, t: sc.rEnemy() * 6 };
    const fx = d.x * T + 16, fy = (d.y + 1) * T;
    const n2 = spawnEnemy2(sc, d, base); if (n2) return n2; // новые враги
    if (d.type === 'crawler') return [{ ...base, w: 26, h: 16, x: fx - 13, y: fy - 16, hp: 3, vx: -45, beads: 3 }];
    if (d.type === 'gnat') return [{ ...base, w: 20, h: 18, x: fx - 10, y: d.y * T, hx: fx, hy: d.y * T, hp: 2, beads: 2 }];
    return [{ ...base, w: 36, h: 22, x: fx - 18, y: fy - 22, hp: 6, vx: -40, state: 'walk', st: 0, beads: 6 }];
  });
}
function spawnEnemy2(sc: World, d: D, base: Omit<Enemy, 'w' | 'h' | 'x' | 'y' | 'hp' | 'beads'>): Enemy[] | null {
  const fx = d.x * T + 16, fy = (d.y + 1) * T;
  const mk = (o: Record<string, unknown>): Enemy => ({ ...base, e2: true, st: 0, cd: 0.6 + sc.rEnemy(), ...o }) as unknown as Enemy;
  switch (d.type) {
    case 'spitter': return [mk({ w: 22, h: 20, x: fx - 11, y: fy - 20, hp: 3, beads: 4, state: 'idle', hx: fx, face: -1 })];
    case 'shell': return [mk({ w: 44, h: 28, x: fx - 22, y: fy - 28, hp: 8, beads: 10, state: 'walk', armorT: 0, heavyBody: true })];
    case 'lurker': return [mk({ w: 28, h: 24, x: fx - 14, y: fy + 50, hp: 3, beads: 5, state: 'hidden', fy, cd: 0.5 })];
    case 'bats': { // три мыши висят под потолком (d.y — первая свободная клетка под ним)
      const sq: Sq = { bats: [], awake: false, t: 1, n: 0 };
      return [-22, 0, 22].map((ox, k) => {
        const b = mk({ type: 'bat', w: 20, h: 16, x: fx + ox - 10, y: d.y * T, hx: fx + ox, hy: d.y * T, hp: 2, beads: 2, state: 'roost', k, sq, order: 0 });
        sq.bats.push(b); return b;
      });
    }
  }
  return null;
}

// ----- броня и неуязвимость: true — удар не засчитан -----
export function e2Blocked(sc: World, e: Enemy, p: Player): boolean {
  if (!e['e2']) return false;
  if (e.type === 'lurker') return !E2_VULN.includes(e['state']);
  if (e.type !== 'shell' || e['armorT'] > 0 || sc._e2burst || p['heavy'] || p.atkDir === 'd') return false;
  // панцирь: обычный удар отскакивает; пробивает тяжёлый финишер, удар вниз, отбив (броня трескается на 3 с) и всполох нити
  e['blockT'] = 0.15;
  sc.snd('clink');
  const fx = e.x + e.w / 2 + Math.sign(p.x + 7 - (e.x + e.w / 2)) * e.w * 0.4, fy = e.y + e.h * 0.45;
  sc.parts(8, fx, fy, 0xffe3a3);
  if (!p.remote) sc.hitstop = 0.03;
  if (!sc._shellHint && !p.remote) { sc._shellHint = true; sc.toast('Панцирь не пробить обычным ударом: нужен тяжёлый (3-й удар), удар вниз или отбив'); }
  return true;
}
/** отбив ломает броню рядом стоящим панцирям */
export function e2Parry(sc: World, cx: number, cy: number): void {
  for (const e of sc.enemies) {
    if (e.dead || e.type !== 'shell' || Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) > 110) continue;
    e['state'] = 'stun'; e['st'] = 0.8; e['armorT'] = 3; e.vx = 0; e.flash = 0.15;
    sc.burst(14, e.x + e.w / 2, e.y + e.h / 2, 0xffa040); sc.sfx('slam');
    if (!sc._crackHint) { sc._crackHint = true; sc.toastAll('Броня треснула — бей!'); }
  }
}

// ----- шаг: замедление (status.js) → заморозка (tools.js) → база -----
export function stepEnemy(sc: World, e: Enemy, dt0: number): void {
  const dt = slowDt(sc, e as never, dt0, false);
  if (stepFrozen(sc, e, dt)) return;
  stepEnemyBase(sc, e, dt);
}
function stepEnemyBase(sc: World, e: Enemy, dt: number): void {
  e.flash -= dt; e.t += dt;
  if (e['e2']) { stepEnemy2(sc, e, dt); return; }
  if (e.kbT > 0) {
    e.kbT -= dt; e.vx = e.kbx;
    if (e.type === 'gnat') e.vy = e.kby;
    else e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    sc.moveBody(e, dt);
    return;
  }
  if (e.type === 'crawler') {
    const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
    if (e.onGround && !sc.groundBelowSolid(frontX, e.y + e.h + 4)) e.face = -e.face;
    e.vx = e.face * 45;
    e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    sc.moveBody(e, dt);
    if (e.hitL || e.hitR) e.face = -e.face;
  } else if (e.type === 'gnat') {
    const [tp, d] = sc.nearestPlayer(e.x + 10, e.y + 9);
    let tx = e['hx'] + Math.sin(e.t * 0.9) * 40, ty = e['hy'] + Math.sin(e.t * 2.1) * 12, spd = 70;
    if (tp && d < 300) { tx = tp.x + 7; ty = tp.y + 4; spd = 115; }
    const dx = tx - (e.x + 10), dy = ty - (e.y + 9), dl = Math.hypot(dx, dy) || 1;
    e.vx += ((dx / dl) * spd - e.vx) * Math.min(1, dt * 2.2);
    e.vy += ((dy / dl) * spd - e.vy) * Math.min(1, dt * 2.2) + Math.sin(e.t * 9) * 4;
    e.face = e.vx >= 0 ? 1 : -1;
    sc.moveBody(e, dt);
  } else if (e.type === 'beetle') {
    e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    const [tp] = sc.nearestPlayer(e.x + 18, e.y + 11);
    if (e['state'] === 'walk') {
      const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
      if (e.onGround && !sc.groundBelowSolid(frontX, e.y + e.h + 4)) e.face = -e.face;
      e.vx = e.face * 40;
      if (tp) {
        const dx = tp.x + 7 - (e.x + 18), dy = tp.y + 26 - (e.y + 22);
        if (Math.abs(dx) < 250 && Math.abs(dy) < 50 && Math.sign(dx) === e.face) { e['state'] = 'wind'; e['st'] = 0.45; e.vx = 0; }
      }
    } else if (e['state'] === 'wind') {
      e.vx = 0; e['st'] -= dt; if (e['st'] <= 0) { e['state'] = 'charge'; e.vx = e.face * 330; }
    } else if (e['state'] === 'charge') {
      e.vx = e.face * 330;
      const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
      if (e.onGround && !sc.groundBelowSolid(frontX, e.y + e.h + 4)) { e['state'] = 'stun'; e['st'] = 0.7; e.vx = 0; }
    } else if (e['state'] === 'stun') {
      e.vx = 0; e['st'] -= dt; if (e['st'] <= 0) { e['state'] = 'walk'; e.face = -e.face; }
    }
    sc.moveBody(e, dt);
    if (e.hitL || e.hitR) {
      if (e['state'] === 'charge') { e['state'] = 'stun'; e['st'] = 0.9; sc.shake(80, 0.004); }
      else if (e['state'] === 'walk') e.face = -e.face;
    }
  }
}

// ----- ИИ врагов 2 -----
function stepEnemy2(sc: World, e: Enemy, dt: number): void {
  if (e['blockT'] > 0) e['blockT'] -= dt;
  if (e.type === 'spitter') stepSpitter(sc, e, dt);
  else if (e.type === 'shell') stepShell(sc, e, dt);
  else if (e.type === 'bat') stepBat(sc, e, dt);
  else if (e.type === 'lurker') stepLurker(sc, e, dt);
}
// отброс после удара; fly — летающие без гравитации
function e2Knock(sc: World, e: Enemy, dt: number, fly: boolean): boolean {
  if (e.kbT <= 0) return false;
  e.kbT -= dt; e.vx = e.kbx * (e['heavyBody'] ? 0.45 : 1);
  e.vy = fly ? e.kby : Math.min(e.vy + P.G * dt, P.MAXFALL);
  sc.moveBody(e, dt); return true;
}
const ledgeAhead = (sc: World, e: Enemy): boolean => { const fx = e.face > 0 ? e.x + e.w + 2 : e.x - 2; return !!e.onGround && !sc.groundBelowSolid(fx, e.y + e.h + 4); };

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

// (2) Жук-панцирь: разбег → вращение; бронирован (см. e2Blocked), врезавшись в стену, оглушает себя и трескает броню
function stepShell(sc: World, e: Enemy, dt: number): void {
  e['armorT'] = Math.max(0, (e['armorT'] || 0) - dt);
  e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
  if (e2Knock(sc, e, dt, false)) return;
  e['st'] -= dt;
  const [tp] = sc.nearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
  const dx = tp ? tp.x + 7 - (e.x + e.w / 2) : 0, dy = tp ? tp.y + 26 - (e.y + e.h) : 0, sees = tp && Math.abs(dx) < 300 && Math.abs(dy) < 60;
  switch (e['state']) {
    case 'walk':
      if (ledgeAhead(sc, e) || e.hitL || e.hitR) e.face = -e.face;
      e.vx = e.face * 32;
      if (sees && Math.sign(dx) === e.face) { e['state'] = 'wind'; e['st'] = 0.7; e.vx = 0; sc.sfx('roar'); }
      else if (sees && Math.abs(dx) < 140) e.face = Math.sign(dx) || e.face; // видит за спиной — разворачивается
      break;
    case 'wind': // встаёт на дыбы и скребёт землёй
      e.vx = 0;
      if (e['st'] <= 0) { e['state'] = 'rush'; e['st'] = 1.0; }
      break;
    case 'rush':
      e.vx = e.face * 320;
      if (ledgeAhead(sc, e) || e['st'] <= 0) { e['state'] = 'spin'; e['st'] = 1.5; e.vx = e.face * 250; sc.sfx('slash'); }
      break;
    case 'spin': // свернулся в шар и катается, отскакивая от стен и краёв
      e.vx = e.face * 250;
      if (ledgeAhead(sc, e)) e.face = -e.face;
      if (e['st'] <= 0) { e['state'] = 'tire'; e['st'] = 0.9; e.vx = 0; }
      break;
    case 'tire': e.vx = 0; if (e['st'] <= 0) { e['state'] = 'walk'; e.face = -e.face; } break; // отдышка: броня всё ещё цела
    case 'stun': e.vx = 0; if (e['st'] <= 0) { e['state'] = 'walk'; e.face = -e.face; } break;
  }
  sc.moveBody(e, dt);
  if ((e.hitL || e.hitR) && e['state'] === 'rush') { // врезался в стену: оглушён, броня треснула
    e['state'] = 'stun'; e['st'] = 1.3; e['armorT'] = 1.3; e.vx = 0; sc.shake(120, 0.006); sc.sfx('slam');
    sc.burst(10, e.x + e.w / 2 + e.face * 20, e.y + e.h / 2, 0xffa040);
  } else if ((e.hitL || e.hitR) && e['state'] === 'spin') e.face = -e.face;
}

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
