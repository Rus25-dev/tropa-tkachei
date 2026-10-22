// Воздушная вспышка: в воздухе рывок со стрелкой — короткий рывок в одну из 8 сторон, миг неуязвимости; раз до приземления.
import { KIT } from '../../core/balance';
import { defineAbility, NOIN, type Inner } from '../../core/ability-kit';
import { kitHas } from '../../core/kit/abilities';
import type { Player } from '../../core/types';
import type { World } from '../../core/world';

interface Flash { f: number; dx: number; dy: number }

function startFlash(sc: World, p: Player): void {
  const inp = p.inp, dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  const fx = dx === 0 && dy === 0 ? (p.face || 1) : dx, n = fx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
  p['fl'] = { f: KIT.FLASH.FRAMES, dx: fx * n, dy: dy * n } as Flash; p['flUsed'] = true;
  if (fx) p.face = fx > 0 ? 1 : -1;
  p['dashBuf'] = 0; p['kgF'] = KIT.FLASH.GHOST_F; p['glideOff'] = true; p['gliding'] = false; p.jumpBuf = 0; p.vx = p.vy = 0; p.kbx = 0;
  sc.snd('flash'); sc.parts(10, p.x + 7, p.y + 13, 0x7fd8ff);
}
function flashStep(sc: World, p: Player, dt: number, inner: Inner): void {
  const fl = p['fl'] as Flash, x0 = p.x, y0 = p.y, sv = p.inp;
  p.inp = NOIN; inner(sc, p, dt); p.inp = sv;
  if (p.downed || p.hurtT > 0) { p['fl'] = null; return; }
  p.x = x0; p.y = y0;
  const v = KIT.FLASH.DIST / (KIT.FLASH.FRAMES / 60);
  p.vx = fl.dx * v; p.vy = fl.dy * v;
  sc.moveBody(p, dt); fl.f--;
  p.trail.push({ x: p.x + 7, y: p.y + 26, a: 1, f: p.face, s: 2 });
  const blocked = (fl.dx > 0 && !!p.hitR) || (fl.dx < 0 && !!p.hitL) || (fl.dy < 0 && !!p.hitU) || (fl.dy > 0 && p.onGround);
  if (fl.f <= 0 || blocked) {
    p['fl'] = null; p.vx = 0; p.vy = fl.dy < 0 ? -140 : fl.dy > 0 ? 140 : 0;
    if (p.onGround && fl.dy > 0) { sc.dustAt(4, p.x + 7, p.y + 26); sc.snd('land'); }
  }
}

export default defineAbility({
  id: 'flash', order: 20, name: 'Воздушная вспышка', col: 0x7fd8ff, unlock: 'boss:raven', onDash: true, codes: [2], codePri: 2,
  desc: 'В воздухе нажмите рывок со стрелкой (в том числе вверх или вниз): короткий рывок на 100 px в одну из 8 сторон, в начале миг неуязвимости. Один раз до приземления, хвата за уступ или стены. Если воздушный рывок уже потрачен, вспышка срабатывает и без стрелок.',
  tick: (_sc, p) => { if (p.onGround || p.wallDir !== 0 || p['ledge']) p['flUsed'] = false; },
  armed: (sc, p) => kitHas(sc, p, 'flash'),
  busy: (p) => !!p['fl'],
  cancel: (_sc, p) => { p['fl'] = null; },
  drive: (sc, p, dt, inner, { inp }) => {
    if (kitHas(sc, p, 'flash') && !p['fl'] && !p['cr'] && !p['dv'] && !p.onGround && !p['flUsed'] && p.dashT <= 0 && !p['ledge'] && (inp.dashP || (p['dashBuf'] as number) > 0) && (inp.up || inp.down || !p.canDash)) startFlash(sc, p);
    if (!p['fl']) return false;
    flashStep(sc, p, dt, inner); return true;
  },
  clear: (p) => { p['fl'] = null; p['flUsed'] = false; },
  code: (p) => (p['fl'] ? 2 : 0),
  fromNet: (p, ks) => { p['fl'] = ks === 2 ? { f: 1, dx: Math.sign(p.vx), dy: Math.sign(p.vy) } : null; },
  trail: (p, dash) => (!dash && p['fl'] ? 2 : 0),
  hud: (sc, p) => (kitHas(sc, p, 'flash') ? { frac: p['flUsed'] ? 1 : 0, ready: !p['flUsed'], active: !!p['fl'] } : null),
});
