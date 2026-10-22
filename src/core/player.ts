// Шаг героя. В v1.8 stepPlayer обёрнут по порядку загрузки модулей: движение 2 → обереги → крюк → оружие (заряд) → перезарядка инструмента → база.
// Здесь та же вложенность записана вызовами: stepPlayer → mv2 → charms → hook → kit (приёмы набора игрока, v2.5) → weapons → loadout → base.
import { MV2, P, SPIKE, EMPTY, PLAT, SOLID, T } from './balance';
import type { Player } from './types';
import type { World } from './world';
import { inset, overlap } from './world';
import { charmsOn, useTool } from './loadout';
import { beginSwing, speedMul, weaponsPre, wdef } from './weapons';
import { openShop } from './campaign';
import { tryExecute } from './bosses2';
import { silkBurst } from './combat';
import { hurtPlayer } from './damage';
import { throwBomb, refillBombs } from './bombs';
import { hookStep } from './tools';
import { duelNoHeal } from './duelmods';
import { dashSpeed, kitBusy, kitDashStart, kitStep } from './kit/moves';

const NOIN = { up: false, down: false, left: false, right: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false, jumpP: false, atkP: false, dashP: false, healP: false, upP: false, bombP: false, toolP: false };

// ---------- движение 2: хват за уступ, планер, стенное скольжение ----------
interface Ledge { side: number; tx: number; ty: number; top: number; hx: number; hy: number; sx: number; sy: number; climb: number; away: number }
const hasLedge = (sc: World): boolean => !!sc.abil && sc.abil['ledge'] !== false;
const hasGlide = (sc: World): boolean => {
  const a = sc.abil || {}; if (a['glide'] === false) return false;
  return !!a['glide'] || sc.mode === 'bosstest' || !!(sc.sr && sc.sr.cat === 'boss');
};
const tileFree = (sc: World, tx: number, ty: number): boolean => sc.tileAt(tx, ty) === EMPTY;
// уступ сбоку (side = ±1): верхняя кромка тайла между головой и грудью героя, над ней свободно
function findLedge(sc: World, p: Player, side: number): Ledge | null {
  const edge = side > 0 ? p.x + p.w : p.x;
  const tx = side > 0 ? Math.floor((edge + 3) / T) : Math.floor((edge - 3) / T);
  const dist = side > 0 ? tx * T - edge : edge - (tx + 1) * T; // зазор до тайла
  if (dist > 3 || dist < -6) return null;
  const ty = Math.ceil((p.y - 4) / T), top = ty * T;
  if (top > p.y + 14) return null;
  const t = sc.tileAt(tx, ty);
  if (t !== SOLID && t !== PLAT) return null;
  if (!tileFree(sc, tx, ty - 1)) return null; // над кромкой шип, камень или платформа
  if (side > 0 ? sc.tileAt(tx - 1, ty) === SOLID : sc.tileAt(tx + 1, ty) === SOLID) return null; // кромка внутри массива — не уступ
  const hx = side > 0 ? tx * T - p.w : (tx + 1) * T, hy = top + 6;
  const r = { x: hx, y: hy, w: p.w, h: p.h };
  if (sc.solidRect(r) || sc.rectHitsTile(r, SPIKE, 1)) return null;
  const sx = side > 0 ? tx * T + 2 : (tx + 1) * T - p.w - 2, sy = top - p.h;
  if (sc.solidRect({ x: sx, y: sy, w: p.w, h: p.h })) return null; // наверху нет места
  return { side, tx, ty, top, hx, hy, sx, sy, climb: 0, away: 0 };
}
function grab(sc: World, p: Player, L: Ledge): void {
  p['ledge'] = L; p['ledgeDir'] = L.side; p.x = L.hx; p.y = L.hy; p.vx = p.vy = 0; p.kbx = 0; p.face = L.side;
  p.dashT = 0; p.canDash = true; p['usedDouble'] = false; p['gliding'] = false; p.jumpBuf = 0; p.onGround = false;
  p['ledgeUp'] = !!(p.inp && p.inp.up);
  sc.snd('ledge'); sc.dustAt(3, L.side > 0 ? L.tx * T : (L.tx + 1) * T, L.top);
}
const releaseLedge = (p: Player, cd?: number): void => { p['ledge'] = null; p['ledgeDir'] = 0; p['ledgeCd'] = cd == null ? 0.25 : cd; };

function mv2Step(sc: World, p: Player, dt: number): void {
  if (p.remote) return charmsStep(sc, p, dt);
  const inp = p.inp || {}, dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  p['ledgeCd'] = ((p['ledgeCd'] as number) || 0) - dt; p['wgr'] = ((p['wgr'] as number) || 0) - dt; p['wsT'] = ((p['wsT'] as number) || 0) - dt; p['wsSnd'] = ((p['wsSnd'] as number) || 0) - dt; p['glT'] = ((p['glT'] as number) || 0) - dt;
  let L = p['ledge'] as Ledge | null;
  // сбросить хват, если герой ранен, упал, лечится или его унесло (возрождение, телепорт)
  if (L && (p.downed || p.hurtT > 0 || (p['healCh'] as number) > 0 || p.sit || (!L.climb && (Math.abs(p.x - L.hx) > 3 || Math.abs(p.y - L.hy) > 3)))) { releaseLedge(p, 0.2); L = null; }
  if (L) {
    let leave = false;
    if (L.climb > 0) {
      // подтягивание: сначала вверх, потом на кромку
      L.climb += dt;
      const k = Math.min(1, L.climb / MV2.CLIMB_T), ky = 1 - (1 - Math.min(1, k / 0.65)) ** 2, kx = Math.max(0, Math.min(1, (k - 0.45) / 0.55));
      p.inv = Math.max(p.inv, 0.25);
      const sv = p.inp; p.inp = NOIN; charmsStep(sc, p, dt); p.inp = sv;
      p.x = L.hx + (L.sx - L.hx) * kx; p.y = L.hy + (L.sy - L.hy) * ky; p.vx = p.vy = 0; p.onGround = false;
      if (k >= 1) { p.x = L.sx; p.y = L.sy; p.coyote = P.COYOTE; releaseLedge(p, 0.2); p.landT = 0.05; sc.dustAt(4, p.x + 7, p.y + 26); sc.snd('land'); }
      p['ledgeUp'] = !!inp.up; return;
    }
    const upEdge = inp.up && !p['ledgeUp']; p['ledgeUp'] = !!inp.up;
    if (inp.jumpP && dir === -L.side) { // спрыгнуть от стены
      releaseLedge(p, 0.3); p.vy = -P.WJY * 0.95; p.vx = -L.side * P.WJX; p.face = -L.side; p.wjLock = P.WJLOCK; p.jumpCut = false; p.jumpBuf = 0;
      sc.snd('jump'); leave = true;
    } else if (inp.jumpP || upEdge) {
      L.climb = 0.0001; sc.snd('jump'); sc.parts(5, p.x + 7, p.y + 4, p.pal.accent);
    } else if (inp.down) { releaseLedge(p, 0.3); p.vy = 40; leave = true; }
    else if (inp.dashP || (p['dashBuf'] as number) > 0) { releaseLedge(p, 0.3); p.face = -L.side; if (inp.dashP) p['dashBuf'] = P.DASHBUF; leave = true; }
    else {
      L.away = dir === -L.side ? L.away + dt : 0;
      if (L.away > 0.3) { releaseLedge(p, 0.3); p.vy = 40; leave = true; }
    }
    if (!leave) {
      // висим: ввод заморожен (кроме удара вперёд), позиция фиксирована
      const sv = p.inp; p.inp = { ...NOIN, atk: !!inp.atk, atkP: !!inp.atkP };
      charmsStep(sc, p, dt); p.inp = sv;
      p.x = L.hx; p.y = L.hy; p.vx = p.vy = 0; p.onGround = false; p.face = L.side;
      return;
    }
    p['ledge'] = null;
  }
  // ----- до основного шага -----
  // рывок от стены, если стик не нажат
  if (!p.onGround && !dir && p.dashCd <= 0 && p.canDash && (inp.dashP || (p['dashBuf'] as number) > 0)) {
    const sd = sc.touchWall(p, 1) ? 1 : sc.touchWall(p, -1) ? -1 : 0;
    if (sd) p.face = -sd;
  }
  // планер: гасим разгон падения
  const glideOn = !!p['gliding'];
  if (glideOn && p.vy > MV2.GLIDE_V) p.vy = Math.max(MV2.GLIDE_V, p.vy - MV2.GLIDE_DEC * dt);
  charmsStep(sc, p, dt);
  // ----- после -----
  const hasG = hasGlide(sc), air = !p.onGround;
  // стенное скольжение: задержка после отпускания стика, дрейф от стены
  if (p.wallDir !== 0 && air) { p['wgr'] = 0.14; p['wgSide'] = p.wallDir; }
  let sliding = p.wallDir !== 0 && air && p.vy > 30;
  if (!sliding && (p['wgr'] as number) > 0 && air && p.vy > P.WSLIDE && p.hurtT <= 0 && p.dashT <= 0 && p.wjLock <= 0 && p.vy > 0 &&
    (dir === -(p['wgSide'] as number) || (!dir && sc.touchWall(p, p['wgSide'] as number)))) { p.vy = P.WSLIDE; sliding = !dir; }
  if (sliding) {
    if ((p['wsSnd'] as number) <= 0) { p['wsSnd'] = 0.2; sc.emit('slide', { i: p.i }); }
  }
  // хват за уступ
  if (!p['ledge'] && hasLedge(sc) && air && p.vy > 0 && (p['ledgeCd'] as number) <= 0 && (dir === 1 || dir === -1) &&
    p.hurtT <= 0 && p.dashT <= 0 && p.atkT <= 0 && !((p['healCh'] as number) > 0) && !p.sit && !p.downed && p.wjLock <= 0 && !((p['execT'] as number) > 0) && !kitBusy(p)) {
    const L2 = findLedge(sc, p, dir);
    if (L2) { grab(sc, p, L2); p['gliding'] = false; return; }
  }
  // планер
  if (!hasG || p.onGround || !inp.jump) { p['glideOff'] = false; p['glideHold'] = 0; p['gliding'] = false; }
  else {
    const ok = p.vy >= 0 && !p['glideOff'] && !kitBusy(p) && p.hurtT <= 0 && p.dashT <= 0 && !p.wallDir && !((p['healCh'] as number) > 0) && !p.downed &&
      (p['usedDouble'] || !sc.abil['double']);
    if (p.atkT > 0 || p.hurtT > 0 || p.dashT > 0) p['glideOff'] = true; // удар, урон, рывок обрывают планирование до следующего нажатия
    if (!ok || p['glideOff']) { p['gliding'] = false; p['glideHold'] = 0; }
    else if (p['gliding']) { if (p.vy > MV2.GLIDE_V) p.vy = MV2.GLIDE_V; }
    else {
      p['glideHold'] = ((p['glideHold'] as number) || 0) + dt;
      if ((p['glideHold'] as number) >= MV2.GLIDE_HOLD && p.vy >= 20) {
        p['gliding'] = true; p['glT'] = 0; sc.snd('glide');
        sc.parts(8, p.x + 7, p.y - 6, p.pal.accent);
      }
    }
  }
  if (p['gliding'] && (p['glT'] as number) <= 0) p['glT'] = 0.12;
  if (p.hurtT > 0 || p.downed) p['gliding'] = false;
}

// ---------- обереги: «Тихий шаг» и «Широкое окно» ----------
function charmsStep(sc: World, p: Player, dt: number): void {
  const cs = charmsOn(p);
  for (const c of cs) c.stepPre?.(sc, p, dt);
  const before = (p['parryT'] as number) || 0;
  hookStep(sc, p, dt, kitInner);
  for (const c of cs) c.stepPost?.(sc, p, dt, { parryBefore: before });
}

const kitInner = (sc: World, p: Player, dt: number): void => kitStep(sc, p, dt, weaponsStep);

// ---------- оружие (заряд) → перезарядка инструмента → база ----------
function weaponsStep(sc: World, p: Player, dt: number): void {
  weaponsPre(sc, p, dt);
  p['toolCd'] = ((p['toolCd'] as number) || 0) - dt;
  baseStepPlayer(sc, p, dt);
}

export function stepPlayer(sc: World, p: Player, dt: number): void { mv2Step(sc, p, dt); }

// ---------- база (game.js GameScene.stepPlayer) ----------
function baseStepPlayer(sc: World, p: Player, dt: number): void {
  const inp = p.inp;
  p.inv -= dt; p.hurtT -= dt; p.dashCd -= dt; p.bombCd -= dt; p.atkCd -= dt; p.atkT -= dt; p.wjLock -= dt; p.healT -= dt; p.coyote -= dt; p.jumpBuf -= dt; p.landT -= dt;
  p['atkBuf'] = ((p['atkBuf'] as number) || 0) - dt; p['comboT'] = ((p['comboT'] as number) || 0) - dt; p['parryT'] = ((p['parryT'] as number) || 0) - dt; p['parryCd'] = ((p['parryCd'] as number) || 0) - dt;
  if (typeof p['parryF'] === 'number') p['parryF']++; // кадры окна отбива (идеальный отбив — первые PARRY2.PERFECT_F)
  p['counterT'] = ((p['counterT'] as number) || 0) - dt; if ((p['perfFx'] as number) > 0) p['perfFx'] -= dt;
  p['dashBuf'] = ((p['dashBuf'] as number) || 0) - dt; p['execT'] = ((p['execT'] as number) || 0) - dt;
  if ((p['counterFx'] as number) > 0) p['counterFx'] -= dt;
  if ((p['burstFx'] as number) > 0) p['burstFx'] -= dt; // только для отрисовки: кольцо всполоха
  if (p.downed) { p.vx *= 0.9; p.vy = Math.min(p.vy + P.G * dt, P.MAXFALL); sc.moveBody(p, dt); return; }
  if (inp.jumpP) p.jumpBuf = P.BUF;
  if (inp.atkP) p['atkBuf'] = P.ATKBUF;
  if (inp.dashP) p['dashBuf'] = P.DASHBUF;
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  // лечение занимает время: герой стоит на месте, любой урон прерывает его (нить потеряна)
  if ((p['healCh'] as number) > 0) {
    (p['healCh'] as number) -= dt; p.healT = p['healCh'] as number; p.vx = 0; p.vy = Math.min(p.vy + P.G * dt, P.MAXFALL); sc.moveBody(p, dt);
    if ((p['healCh'] as number) <= 0) {
      p.hp = Math.min(p.maxHp, p.hp + P.HEAL); p['healCh'] = 0; p.healT = 0.3; sc.snd('heal');
      sc.parts(18, p.x + 7, p.y + 12, p.pal.accent);
    }
    return;
  }
  if (p.sit) {
    const dn = !!inp.down, dnP = dn && !p['dnPrev']; p['dnPrev'] = dn;
    if (dir || inp.jumpP || inp.atkP || inp.dashP) p.sit = false;
    else {
      if (dnP) openShop(sc, p);
      p.vx = 0; p.vy = Math.min(p.vy + P.G * dt, P.MAXFALL); sc.moveBody(p, dt); return;
    }
  }
  const wasGround = p.onGround;
  if (p.hurtT > 0) {
    p.vx = p.kbx; p.kbx *= 0.9; p.vy = Math.min(p.vy + P.G * dt, P.MAXFALL);
  } else if (p.dashT > 0) {
    p.dashT -= dt; p.vx = p.face * dashSpeed(p); p.vy = 0;
    p.trail.push({ x: p.x + 7, y: p.y + 26, a: 1, f: p.face, s: p['shade'] ? 1 : 0 });
    if (p.dashT <= 0) p.vx = dir * P.RUN;
  } else {
    if (p.wjLock <= 0) { p.vx = dir * P.RUN * speedMul(sc, p) + p.kbx; if (dir) p.face = dir; }
    p.kbx *= 0.8; if (Math.abs(p.kbx) < 5) p.kbx = 0;
    p.wallDir = 0;
    if (!p.onGround && p.vy > 0) { if (dir === 1 && sc.touchWall(p, 1)) p.wallDir = 1; else if (dir === -1 && sc.touchWall(p, -1)) p.wallDir = -1; }
    if (p.jumpBuf > 0) {
      if (inp.down && p.onGround && sc.onPlatform(p)) {
        // ↓ + прыжок на платформе — спрыгнуть вниз сквозь неё
        p['dropT'] = 0.22; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.vy = 60; p.y += 2;
      } else if (p.onGround || p.coyote > 0) {
        p.vy = -P.JUMP; p.jumpBuf = 0; p.coyote = 0; p.jumpCut = false; sc.snd('jump');
        sc.dustAt(5, p.x + 7, p.y + 26);
      } else if (sc.touchWall(p, 1) || sc.touchWall(p, -1)) {
        const wd = sc.touchWall(p, 1) ? 1 : -1;
        p['usedDouble'] = false;
        p.vy = -P.WJY; p.vx = -wd * P.WJX; p.face = -wd; p.wjLock = P.WJLOCK; p.jumpBuf = 0; p.jumpCut = false; p.canDash = true;
        sc.snd('jump'); sc.dustAt(4, p.x + (wd > 0 ? 14 : 0), p.y + 14);
      } else if (sc.abil['double'] && !p['usedDouble']) {
        p['usedDouble'] = true; p.vy = -P.JUMP * 0.9; p.jumpBuf = 0; p.jumpCut = false; sc.snd('jump');
        sc.parts(10, p.x + 7, p.y + 26, p.pal.accent);
      }
    }
    if (!inp.jump && p.vy < 0 && !p.jumpCut) { p.vy *= P.CUT; p.jumpCut = true; }
    p.vy += P.G * dt * (inp.jump && Math.abs(p.vy) < P.APEX_VY && !p.onGround ? P.APEX_G : 1);
    if (p.wallDir !== 0 && p.vy > P.WSLIDE) p.vy = P.WSLIDE;
    if (p.vy > P.MAXFALL) p.vy = P.MAXFALL;
    if ((p['dashBuf'] as number) > 0 && p.dashCd <= 0 && (p.onGround || p.canDash)) {
      p['dashBuf'] = 0;
      if (p.wallDir) p.face = -p.wallDir;
      else if (dir) p.face = dir;
      p.dashT = P.DASHT; p.dashCd = P.DASHCD; if (!p.onGround) p.canDash = false; p.vy = 0; p.atkT = 0;
      sc.snd('dash'); kitDashStart(sc, p);
    }
    if ((p['atkBuf'] as number) > 0 && p.atkCd <= 0 && (inp.up || inp.down) && tryExecute(sc, p, inp.up ? 'u' : 'd')) {
      p['atkBuf'] = 0; // казнь оглушённого босса: удар вверх/вниз рядом с ним
    } else if ((p['atkBuf'] as number) > 0 && p.atkCd <= 0) {
      p['atkBuf'] = 0;
      p.atkDir = inp.up ? 'u' : (inp.down && !p.onGround ? 'd' : 'f');
      // комбо: третий удар подряд (в пределах 0.6 с) — тяжёлый финишер: шире, бьёт дважды, но дольше восстанавливается
      const W = wdef(p);
      p['combo'] = (p['comboT'] as number) > 0 ? (p['combo'] as number) + 1 : 1; if ((p['combo'] as number) > W.combo) p['combo'] = 1;
      p['heavy'] = !!W.finisher && p['combo'] === W.combo && p.atkDir === 'f'; p['comboT'] = W.comboWin;
      p.atkT = p['heavy'] ? W.finT : W.atkT; p.atkCd = (p['heavy'] ? W.finCd : W.cd); p.atkHits = new Set(); p.pogoed = false; p['seq'] = ((p['seq'] as number) || 0) + 1;
      // контратака: первый удар вперёд в окне после идеального отбива — сильнее (урон и стойкость, см. damage.ts), один раз
      p['counterHit'] = false; p['counterSeen'] = null;
      if ((p['counterT'] as number) > 0 && p.atkDir === 'f') { p['counterHit'] = true; p['counterT'] = 0; p['counterFx'] = 0.3; sc.snd('counter'); sc.parts(14, p.x + 7 + p.face * 22, p.y + 13, 0xffd96a); }
      sc.snd(p['heavy'] ? 'slam' : 'slash');
      if (W.onSwing) W.onSwing(sc, p); else beginSwing(sc, p, W);
    }
    if (inp.bombP) throwBomb(sc, p);
    if (inp.toolP) useTool(sc, p);
    if (inp.healP) {
      if (inp.up && p.silk >= P.BURST) silkBurst(sc, p);
      else if (p.silk >= sc.silkMax && p.hp < p.maxHp && !duelNoHeal(sc)) {
        p.silk = 0; p['healCh'] = P.HEAL_T; p.healT = P.HEAL_T; p.atkT = 0; sc.snd('bench');
        sc.parts(10, p.x + 7, p.y + 12, p.pal.accent);
      } else if ((p['parryCd'] as number) <= 0) { p['parryT'] = P.PARRY_T; p['parryCd'] = P.PARRY_CD; p['parryF'] = 0; sc.snd('slash'); }
    }
  }
  p['dropT'] = ((p['dropT'] as number) || 0) - dt; p.noPlat = (p['dropT'] as number) > 0;
  const py0 = p.y, vy0 = p.vy;
  sc.moveBody(p, dt);
  if (p.hitU && vy0 < 0 && p.hurtT <= 0) sc.cornerNudge(p, py0 + vy0 * dt, vy0);
  if (sc.crates) refillBombs(sc, p);
  if (p.onGround) {
    p.coyote = P.COYOTE; p.canDash = true; p['usedDouble'] = false;
    if (!wasGround) { p.landT = 0.1; sc.dustAt(4, p.x + 7, p.y + 26); sc.snd('land'); }
  }
  // колючки
  if (sc.rectHitsTile(inset(p, 3), SPIKE, 0.55)) {
    hurtPlayer(sc, p, 1, null, true);
    if (!p.downed && p.hp > 0) { p.x = p.safeX; p.y = p.safeY; p.vx = p.vy = 0; p.kbx = 0; p.hurtT = 0.35; p.dashT = 0; }
  }
  if (p.onGround && !sc.rectHitsTile({ x: p.x - 20, y: p.y, w: p.w + 40, h: p.h + 8 }, SPIKE, 1)) {
    p.groundT += dt; if (p.groundT > 0.12) { p.safeX = p.x; p.safeY = p.y; }
  } else p.groundT = 0;
  // хвост рывка
  for (const tr of p.trail as { a: number }[]) tr.a -= dt * 5;
  p.trail = (p.trail as { a: number }[]).filter((tr) => tr.a > 0);
}

export { overlap };
