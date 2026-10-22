// Кристальный рывок: на земле удерживать рывок — заряд (герой замедлен), отпустить — суперрывок до стены или края.
import { KIT } from '../../core/balance';
import { defineAbility, fr, NOIN, type Inner } from '../../core/ability-kit';
import { kitHas } from '../../core/kit/abilities';
import type { Player } from '../../core/types';
import type { World } from '../../core/world';

interface Run { f: number }
const CH_SHOW_F = 8; // меньше этого — заряд не успел «зазвучать», срыв тихий
const need = (): number => fr(KIT.CRYSTAL.CHARGE_T);

function startRun(sc: World, p: Player, dir: number): void {
  p.face = dir > 0 ? 1 : -1; p['cr'] = { f: 0 } as Run; p['kcF'] = 0; p['kcLock'] = true;
  p['kgF'] = KIT.CRYSTAL.GHOST_F; p['dashBuf'] = 0; p.atkT = 0; p.kbx = 0;
  sc.snd('crystalGo'); sc.parts(16, p.x + 7, p.y + 22, 0xff8ae0); sc.shake(120, 0.004);
}
function endRun(sc: World, p: Player): void {
  p['cr'] = null; p['kcCd'] = fr(KIT.CRYSTAL.CD); p.vx = 0; p.vy = 0; p['kgF'] = 0;
  sc.dustAt(5, p.x + 7, p.y + 26);
}
function runStep(sc: World, p: Player, dt: number, inner: Inner): void {
  const run = p['cr'] as Run, inp = p.inp;
  if (inp.jumpP || inp.atkP) { // отмена прыжком или ударом: инерция остаётся
    const f = p.face; endRun(sc, p); p.kbx = f * KIT.CRYSTAL.CARRY; p['kcLock'] = !!inp.dash; return inner(sc, p, dt);
  }
  const x0 = p.x, y0 = p.y, sv = p.inp;
  p.inp = NOIN; inner(sc, p, dt); p.inp = sv;
  if (p.downed || p.hurtT > 0) { p['cr'] = null; return; }
  p.x = x0; p.y = y0;
  // шаги по 4 px: на краю герой останавливается, а не слетает; стена тоже останавливает
  const total = KIT.CRYSTAL.SPD * dt, n = Math.max(1, Math.ceil(total / 4)), step = total / n;
  let stop = false;
  for (let i = 0; i < n && !stop; i++) {
    const px = p.x, py = p.y;
    p.vx = p.face * step / dt; p.vy = 60;
    sc.moveBody(p, dt);
    if (p.hitL || p.hitR) { stop = true; sc.shake(160, 0.006); sc.snd('slam'); sc.parts(14, p.x + (p.face > 0 ? 14 : 0), p.y + 13, 0xffffff); }
    else if (!p.onGround) { p.x = px; p.y = py; stop = true; }
  }
  run.f++;
  p.trail.push({ x: p.x + 7, y: p.y + 26, a: 1, f: p.face, s: 3 });
  if (run.f % 3 === 0) sc.parts(2, p.x + 7 - p.face * 8, p.y + 24, 0xff8ae0);
  if (stop || run.f >= fr(KIT.CRYSTAL.MAXT)) { p.onGround = true; endRun(sc, p); }
}

export default defineAbility({
  id: 'crystal', order: 30, name: 'Кристальный рывок', col: 0xff8ae0, unlock: 'boss:radiant', onDash: true, holdDash: true, codes: [3, 4, 5], codePri: 1,
  desc: 'На земле удерживайте рывок около полсекунды: герой замедляется, вокруг искры. Отпустите: суперрывок вперёд до стены или края (около 1100 px/с), в начале неуязвимость. Прыжок, удар или урон отменяют заряд.',
  tick: (_sc, p, _dt, { holding }) => { if ((p['kcCd'] as number) > 0) p['kcCd']--; if (!holding) p['kcLock'] = false; },
  armed: (sc, p) => kitHas(sc, p, 'crystal'),
  busy: (p) => !!p['cr'],
  active: (p) => (p['kcF'] as number) > 0,
  cancel: (sc, p, { holding }) => { if ((p['kcF'] as number) > CH_SHOW_F) sc.snd('clink'); p['cr'] = null; p['kcF'] = 0; p['kcLock'] = holding; },
  drive: (sc, p, dt, inner, { holding, inp }) => {
    if (p['cr']) { runStep(sc, p, dt, inner); return true; }
    if (!kitHas(sc, p, 'crystal')) return false;
    const kc = (p['kcF'] as number) | 0, n = need();
    if (kc > 0) {
      if (!p.onGround || inp.jumpP || inp.atkP || p.dashT > 0) { // отмена: прыжок, удар, срыв с земли
        if (kc > CH_SHOW_F) sc.snd('clink');
        p['kcF'] = 0; p['kcLock'] = holding;
      } else if (holding) {
        p['kcF'] = kc + 1;
        if (kc + 1 === n) { sc.snd('crystalReady'); sc.parts(14, p.x + 7, p.y + 14, 0xff8ae0); sc.emit('crystalReady', { i: p.i }); }
        else if ((kc + 1) % 4 === 0) sc.parts(2, p.x + 7, p.y + 22, kc + 1 >= n ? 0xffffff : 0xff8ae0);
      } else if (kc >= n) {
        startRun(sc, p, ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) || p.face);
        runStep(sc, p, dt, inner); return true;
      } else p['kcF'] = 0; // отпустили рано: заряд сгорел
    } else if (holding && !p['kcLock'] && (p['dhold'] as number) >= fr(KIT.CRYSTAL.MIN_HOLD) && p.onGround && p.dashT <= 0 && !((p['kcCd'] as number) > 0) && p.atkT <= 0 && !inp.jumpP && !inp.atkP) {
      p['kcF'] = 1; sc.snd('crystalCharge');
    }
    return false;
  },
  runMul: (p) => ((p['kcF'] as number) > 0 ? KIT.CRYSTAL.SLOW : 1),
  clear: (p) => { p['cr'] = null; p['kcF'] = 0; p['kcLock'] = false; },
  // суперрывок важнее вспышки, заряд — нет (вспышка может начаться в кадре, когда заряд ещё не сорван)
  code: (p) => { if (p['cr']) return 5; if (p['fl']) return 0; const kc = (p['kcF'] as number) | 0; return kc > 0 ? (kc >= need() ? 4 : 3) : 0; },
  chargeFrac: (p) => Math.min(1, ((p['kcF'] as number) | 0) / need()),
  fromNet: (p, ks, kc) => { p['kcF'] = ks === 3 || ks === 4 ? Math.max(1, Math.round(kc * need())) : 0; p['cr'] = ks === 5 ? { f: 1 } : null; },
  trail: (p, dash) => (!dash && p['cr'] ? 3 : 0),
  hud: (sc, p) => {
    if (!kitHas(sc, p, 'crystal')) return null;
    const kc = (p['kcF'] as number) | 0, n = need(), cd = (p['kcCd'] as number) | 0;
    return { frac: kc > 0 ? Math.min(1, kc / n) : cd > 0 ? cd / fr(KIT.CRYSTAL.CD) : 0, ready: cd <= 0 && !p['cr'], active: kc > 0 || !!p['cr'] };
  },
});
