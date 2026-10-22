// Жук-панцирь: разбег → вращение; бронирован (пробивают тяжёлый удар, удар вниз, отбив и всполох нити).
import { P } from '../../core/balance';
import { defineEnemy, ledgeAhead, e2Knock, mk2 } from '../../core/enemy-kit';
import type { Enemy, Player } from '../../core/types';
import type { World } from '../../core/world';

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

export default defineEnemy({
  id: 'shell', order: 4, e2: true, states: ['walk', 'wind', 'rush', 'spin', 'tire', 'stun'], heavy: true,
  spawn: (sc, _d, base, { fx, fy }) => [mk2(sc, base, { w: 44, h: 28, x: fx - 22, y: fy - 28, hp: 8, beads: 10, state: 'walk', armorT: 0, heavyBody: true })],
  step: stepShell,
  // панцирь: обычный удар отскакивает; пробивает тяжёлый финишер, удар вниз, отбив (броня трескается на 3 с) и всполох нити
  blocked: (sc: World, e: Enemy, p: Player, guest?: boolean): boolean => {
    if (e['armorT'] > 0 || sc._e2burst || p['heavy'] || p.atkDir === 'd') return false;
    e['blockT'] = 0.15;
    sc.snd('clink');
    const fx = e.x + e.w / 2 + Math.sign(p.x + 7 - (e.x + e.w / 2)) * e.w * 0.4, fy = e.y + e.h * 0.45;
    sc.parts(8, fx, fy, 0xffe3a3);
    if (!guest && !p.remote && sc.online === 'host') { sc.sendEv({ k: 'snd', n: 'clink' }); sc.sendEv({ k: 'burst', n: 8, x: Math.round(fx), y: Math.round(fy), c: 0xffe3a3 }); }
    if (!p.remote) sc.hitstop = 0.03;
    if (!sc._shellHint && !p.remote) { sc._shellHint = true; sc.toast('Панцирь не пробить обычным ударом: нужен тяжёлый (3-й удар), удар вниз или отбив'); }
    return true;
  },
  parryCrack: (sc, e) => {
    e['state'] = 'stun'; e['st'] = 0.8; e['armorT'] = 3; e.vx = 0; e.flash = 0.15;
    sc.burst(14, e.x + e.w / 2, e.y + e.h / 2, 0xffa040); sc.sfx('slam');
    if (!sc._crackHint) { sc._crackHint = true; sc.toastAll('Броня треснула — бей!'); }
  },
});
