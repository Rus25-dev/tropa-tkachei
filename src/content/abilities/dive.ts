// Движение нырка (навык нити «Нырок», src/content/tools/dive.ts): камнем вниз, неуязвимость до приземления, удар оземь.
// Внутренний приём: в снаряжении не виден (listed: false), включается заклинанием.
import { KIT } from '../../core/balance';
import { defineAbility, fr, NOIN, type Inner } from '../../core/ability-kit';
import { diveLand, diveStrike } from '../../core/kit/spells';
import type { Player } from '../../core/types';
import type { World } from '../../core/world';

export interface Dive { f: number; struck: boolean }

/** начало нырка (из заклинания): герой в воздухе камнем идёт вниз и неуязвим до приземления */
export function diveBegin(sc: World, p: Player): void {
  p['dv'] = { f: 0, struck: false } as Dive; p.dashT = 0; p.atkT = 0; p['gliding'] = false; p['glideOff'] = true; p['fl'] = null; p.jumpBuf = 0;
  p.vx = 0; p.vy = KIT.DIVE.SPD * 0.5; p['kgF'] = 2; p.kbx = 0;
  sc.snd('diveGo');
}
function diveStep(sc: World, p: Player, dt: number, inner: Inner): void {
  const dv = p['dv'] as Dive, x0 = p.x, y0 = p.y, sv = p.inp;
  p.inp = NOIN; inner(sc, p, dt); p.inp = sv;
  if (p.downed || p.hurtT > 0) { p['dv'] = null; return; }
  p.x = x0; p.y = y0;
  p.vx = 0; p.vy = KIT.DIVE.SPD; sc.moveBody(p, dt); dv.f++;
  p['kgF'] = 2;
  p.trail.push({ x: p.x + 7, y: p.y + 26, a: 1, f: p.face, s: 4 });
  if (!dv.struck && diveStrike(sc, p)) dv.struck = true;
  if (p.onGround || dv.f >= fr(KIT.DIVE.MAXT)) {
    p['dv'] = null; p['kgF'] = 0; p.vy = 0;
    if (p.onGround) { p.landT = 0.1; diveLand(sc, p); }
  }
}

export default defineAbility({
  id: 'dive', order: 25, listed: false, codes: [6], codePri: 0,
  busy: (p) => !!p['dv'],
  cancel: (_sc, p) => { p['dv'] = null; },
  drive: (sc, p, dt, inner) => { if (!p['dv']) return false; diveStep(sc, p, dt, inner); return true; },
  clear: (p) => { p['dv'] = null; },
  code: (p) => (p['dv'] ? 6 : 0),
  fromNet: (p, ks) => { p['dv'] = ks === 6 ? { f: 1, struck: true } : null; },
  trail: (p, dash) => (!dash && p['dv'] ? 4 : 0),
});
