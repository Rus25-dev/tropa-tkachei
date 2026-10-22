// Приёмы движения (v2.5, набор игрока): теневой рывок, воздушная вспышка, кристальный рывок и нырок-заклинание.
// Всё считается в кадрах (целые счётчики): без Date.now, Math.random и таймеров. Числа лежат в data/balance.json, раздел KIT.
// Встраивание в шаг героя: kitStep оборачивает базу (player.ts: charmsStep → hookStep → kitStep → weaponsStep → base), kitDashStart вызывается
// при старте рывка, kitGhost — из hurtPlayerBase. Состояние лежит в мешке полей героя: kgF (кадры неуязвимости), fl, cr, dv, kcF, shade, flUsed.
import { KIT, P } from '../balance';
import type { HitKind, Inp, Player } from '../types';
import type { World } from '../world';
import { kitHas } from './abilities';
import { COUNTER, counterStep } from './counter';
import { diveLand, diveStrike } from './spells';

/** секунды → кадры (шаг мира 1/60) */
export const fr = (s: number): number => Math.round(s * 60);
const NOIN: Inp = { up: false, down: false, left: false, right: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false, jumpP: false, atkP: false, dashP: false, healP: false, upP: false, bombP: false, toolP: false };
type Inner = (sc: World, p: Player, dt: number) => void;
interface Flash { f: number; dx: number; dy: number }
interface Run { f: number }
export interface Dive { f: number; struck: boolean }

/** неуязвим ли герой к такому удару: окно кадров kgF пропускает всё, кроме 'unblockable' (шипы проверяет вызывающий) */
export const kitGhost = (p: Player, hk?: HitKind): boolean => (p['kgF'] as number) > 0 && hk !== 'unblockable';
/** скорость рывка: теневой быстрее обычного */
export const dashSpeed = (p: Player): number => (p['shade'] ? KIT.SHADOW.SPD : P.DASH);
/** занят ли герой приёмом, который сам ведёт движение (хват за уступ и планер в это время отключены) */
export const kitBusy = (p: Player): boolean => !!(p['fl'] || p['cr'] || p['dv']);
/** множитель скорости бега при заряде кристального рывка */
export const kitSlow = (p: Player): number => ((p['kcF'] as number) > 0 ? KIT.CRYSTAL.SLOW : 1);

/** старт рывка (из базы, сразу после обычной установки dashT/dashCd): если открыт теневой рывок, он заменяет обычный */
export function kitDashStart(sc: World, p: Player): void {
  p['shade'] = false;
  if (!kitHas(sc, p, 'shadow')) return;
  p.dashT = KIT.SHADOW.T; p.dashCd = KIT.SHADOW.CD; p['kgF'] = KIT.SHADOW.GHOST_F; p['shade'] = true;
  sc.snd('shadow'); sc.parts(8, p.x + 7, p.y + 14, 0x8a7ad8);
}

/** сбросить все приёмы (возрождение, телепорт) */
export function kitClear(p: Player): void {
  p['fl'] = null; p['cr'] = null; p['dv'] = null; p['kcF'] = 0; p['kgF'] = 0; p['shade'] = false; p['kcLock'] = false; p['dhold'] = 0; p['flUsed'] = false;
  p['cxCd'] = 0; p['cxFx'] = 0;
}

// ----- шаг -----
/** обёртка шага героя. inner — следующий слой (оружие → база). Для героя без открытых приёмов и без активных состояний это один вызов inner. */
export function kitStep(sc: World, p: Player, dt: number, inner: Inner): void {
  if (p.remote) return inner(sc, p, dt);
  counterStep(sc, p, dt); // Контрудар (counter.ts): проверка нажатия удара в окне замаха босса; сам удар делает нижний слой
  const kgF = (p['kgF'] as number) | 0;
  if (kgF > 0) p['kgF'] = kgF - 1;
  if ((p['kcCd'] as number) > 0) p['kcCd']--;
  if (p.dashT <= 0) p['shade'] = false;
  const inp = p.inp || {};
  const holding = !!inp.dash;
  p['dhold'] = holding ? ((p['dhold'] as number) | 0) + 1 : 0;
  if (!holding) p['kcLock'] = false;
  if (p.onGround || p.wallDir !== 0 || p['ledge']) p['flUsed'] = false;
  const idle = !p['fl'] && !p['cr'] && !p['dv'] && !((p['kcF'] as number) > 0);
  const flash = kitHas(sc, p, 'flash'), crystal = kitHas(sc, p, 'crystal');
  if (idle && !flash && !crystal) return inner(sc, p, dt);
  // урон, лечение, кокон, скамья: все состояния сорваны
  if (p.hurtT > 0 || p.downed || (p['healCh'] as number) > 0 || p.sit) {
    if (!idle) { if ((p['kcF'] as number) > CH_SHOW_F()) sc.snd('clink'); p['fl'] = null; p['cr'] = null; p['dv'] = null; p['kcF'] = 0; p['kgF'] = 0; p['kcLock'] = holding; }
    return inner(sc, p, dt);
  }
  // ----- воздушная вспышка: старт -----
  if (flash && !p['fl'] && !p['cr'] && !p['dv'] && !p.onGround && !p['flUsed'] && p.dashT <= 0 && !p['ledge'] && (inp.dashP || (p['dashBuf'] as number) > 0) && (inp.up || inp.down || !p.canDash)) {
    startFlash(sc, p);
  }
  if (p['fl']) return flashStep(sc, p, dt, inner);
  // ----- нырок -----
  if (p['dv']) return diveStep(sc, p, dt, inner);
  // ----- кристальный рывок -----
  if (p['cr']) return runStep(sc, p, dt, inner);
  if (crystal) {
    const kc = (p['kcF'] as number) | 0, need = fr(KIT.CRYSTAL.CHARGE_T);
    if (kc > 0) {
      if (!p.onGround || inp.jumpP || inp.atkP || p.dashT > 0) { // отмена: прыжок, удар, срыв с земли
        if (kc > CH_SHOW_F()) sc.snd('clink');
        p['kcF'] = 0; p['kcLock'] = holding;
      } else if (holding) {
        p['kcF'] = kc + 1;
        if (kc + 1 === need) { sc.snd('crystalReady'); sc.parts(14, p.x + 7, p.y + 14, 0xff8ae0); sc.emit('crystalReady', { i: p.i }); }
        else if ((kc + 1) % 4 === 0) sc.parts(2, p.x + 7, p.y + 22, kc + 1 >= need ? 0xffffff : 0xff8ae0);
      } else if (kc >= need) {
        startRun(sc, p, ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) || p.face);
        return runStep(sc, p, dt, inner);
      } else p['kcF'] = 0; // отпустили рано: заряд сгорел
    } else if (holding && !p['kcLock'] && (p['dhold'] as number) >= fr(KIT.CRYSTAL.MIN_HOLD) && p.onGround && p.dashT <= 0 && !((p['kcCd'] as number) > 0) && p.atkT <= 0 && !inp.jumpP && !inp.atkP) {
      p['kcF'] = 1; sc.snd('crystalCharge');
    }
  }
  inner(sc, p, dt);
}
const CH_SHOW_F = (): number => 8; // меньше этого — заряд не успел «зазвучать», срыв тихий

// ----- вспышка -----
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

// ----- кристальный рывок -----
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

// ----- нырок -----
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

// ----- состояние для HUD и сети -----
export interface KitIcon { id: 'shadow' | 'flash' | 'crystal' | 'counter'; /** 0..1: доля перезарядки или заряда */ frac: number; ready: boolean; active: boolean }
export function kitHud(sc: World, p: Player): KitIcon[] {
  const out: KitIcon[] = [];
  if (kitHas(sc, p, 'shadow')) out.push({ id: 'shadow', frac: Math.min(1, Math.max(0, p.dashCd) / KIT.SHADOW.CD), ready: p.dashCd <= 0, active: !!p['shade'] });
  if (kitHas(sc, p, 'flash')) out.push({ id: 'flash', frac: p['flUsed'] ? 1 : 0, ready: !p['flUsed'], active: !!p['fl'] });
  if (kitHas(sc, p, 'crystal')) {
    const kc = (p['kcF'] as number) | 0, need = fr(KIT.CRYSTAL.CHARGE_T), cd = (p['kcCd'] as number) | 0;
    out.push({ id: 'crystal', frac: kc > 0 ? Math.min(1, kc / need) : cd > 0 ? cd / fr(KIT.CRYSTAL.CD) : 0, ready: cd <= 0 && !p['cr'], active: kc > 0 || !!p['cr'] });
  }
  if (kitHas(sc, p, 'counter')) { const cd = (p['cxCd'] as number) | 0; out.push({ id: 'counter', frac: Math.min(1, cd / COUNTER.CD_F), ready: cd <= 0, active: (p['cxFx'] as number) > 0 }); }
  return out;
}
/** код состояния для сети и отрисовки: 0 нет, 1 теневой рывок, 2 вспышка, 3 заряд, 4 заряд готов, 5 суперрывок, 6 нырок */
export function kitCode(p: Player): number {
  if (p['dv']) return 6;
  if (p['cr']) return 5;
  if (p['fl']) return 2;
  const kc = (p['kcF'] as number) | 0;
  if (kc > 0) return kc >= fr(KIT.CRYSTAL.CHARGE_T) ? 4 : 3;
  return p['shade'] ? 1 : 0;
}
/** принять состояние напарника (только для отрисовки и неуязвимости) */
export function kitFromNet(p: Player, ks: number, kc: number, kg: number): void {
  p['kgF'] = kg | 0; p['shade'] = ks === 1; p['kcF'] = ks === 3 || ks === 4 ? Math.max(1, Math.round(kc * fr(KIT.CRYSTAL.CHARGE_T))) : 0;
  p['fl'] = ks === 2 ? { f: 1, dx: Math.sign(p.vx), dy: Math.sign(p.vy) } : null; p['cr'] = ks === 5 ? { f: 1 } : null; p['dv'] = ks === 6 ? { f: 1, struck: true } : null;
}
export const kitChargeFrac = (p: Player): number => Math.min(1, ((p['kcF'] as number) | 0) / fr(KIT.CRYSTAL.CHARGE_T));
