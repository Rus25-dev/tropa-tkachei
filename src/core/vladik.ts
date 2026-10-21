// Босс «Владик Скрипка»: школьный класс, скрипичные ключи, слизь на шторах (legacy/src/vladik.js).
import { BAL, P, VLADIK_SAY_HIT, SOLID, PLAT, T, clamp } from './balance';
import type { Boss, Player } from './types';
import type { World } from './world';
import { bossDeathFx, bossHitSnd, checkPhase, stepBossLayered } from './bosses2';
import { gainSilk } from './damage';
import { bossDeath } from './korne';
import { winGame } from './win';

type Curtain = NonNullable<World['curtains']>[number] & { slime: number; wet: number; drip: number };
const vr = (sc: World): number => sc.rngFor('visual')(); // только для реплик

export function setupVladikArena(sc: World): void {
  const L = sc.L;
  sc.curtains = L.curtains!.map(([a, b]) => ({ x: a! * T, w: (b! - a! + 1) * T, y: 4 * T + 8, h: L.floorY! * T - 44 - (4 * T + 8), slime: 0, wet: 0, drip: 0 }));
  sc.needleHits = 0;
  makeVladik(sc);
}
export function makeVladik(sc: World): void {
  const d = sc.L.vladik!, hp = BAL.hp.vladik[sc.nPlayers === 2 ? 1 : 0]!;
  sc.vladik = { x: d.x * T - 22, y: (d.y + 1) * T - 84, w: 44, h: 84, vx: 0, vy: 0, face: -1, hp, maxHp: hp, phase: 1, state: 'intro', t: 3.2,
    flash: 0, last: '', say: 'Я НЕ СКРИПКА!', sayT: 2.2, sayCd: 0, barShown: false, air: 0, target: null };
  if (sc.curtains) for (const c of sc.curtains) { c.slime = 0; c.wet = 0; }
}
function vladikSpeak(v: Boss, text: string, dur?: number): void { v['say'] = text; v['sayT'] = Math.max(dur || 1.6, 1.4 + text.length * 0.07); }

export function stepVladik(sc: World, dt: number): void { stepBossLayered(sc, 'vladik', dt, stepVladikBase); }

function stepVladikBase(sc: World, dt: number): void {
  const v = sc.vladik; if (!v) return;
  v.flash -= dt; v['sayT'] -= dt; v['sayCd'] -= dt;
  if (!v['barShown']) { v['barShown'] = true; sc.bossBar(true, 'Владик Скрипка', v.hp / v.maxHp); }
  // шторы: высыхание и капли
  for (const c of sc.curtains!) {
    if (c.slime > 0) {
      c.slime -= dt; c.drip -= dt;
      if (c.drip <= 0) { c.drip = 0.8 + sc.rBoss() * 0.6; sc.projs.push({ kind: 'drip', x: c.x + 8 + sc.rBoss() * (c.w - 22), y: c.y + c.h - 8, w: 8, h: 10, vx: 0, vy: 40, life: 2 }); }
    }
  }
  if (v.state === 'dead') { v.t -= dt; v.vy = Math.min(v.vy + P.G * dt, P.MAXFALL); sc.moveBody(v, dt); return; }
  const phase2 = (v.phase || 1) >= 2, phase3 = (v.phase || 1) >= 3;
  const [tp] = sc.nearestPlayer(v.x + v.w / 2, v.y + v.h / 2);
  const tx = tp ? tp.x + 7 : v.x + v.w / 2, vcx = v.x + v.w / 2;
  v.t -= dt;
  switch (v.state) {
    case 'intro': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.7; } break;
    case 'rage': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.3; } break;
    // эхо (третья фаза): призрак Владика мчится от стены за спиной героя, а сам Владик делает выпад
    case 'echoWind':
      v.vx = 0; v.face = tx > vcx ? 1 : -1;
      if (v.t <= 0) {
        const side = tx > vcx ? 1 : -1, wallX = side > 0 ? (sc.L.W - 1) * T - 40 : T;
        sc.projs.push({ kind: 'echo', x: wallX, y: sc.L.floorY! * T - 84, w: 40, h: 84, vx: -side * 600, vy: 0, life: 4, delay: 0.6 });
        sc.sfx('violin'); v.state = 'lungeWind'; v.t = 0.4; v.face = side;
      }
      break;
    case 'staffWind':
      v.vx = 0;
      if (v.t <= 0) { vladikStaff(sc, phase3); v.state = 'recover'; v.t = 1.5; }
      break;
    case 'lungeWind': v.vx = 0; v.face = tx > vcx ? 1 : -1; if (v.t <= 0) { v.state = 'lunge'; v.t = 0.34; sc.sfx('dash'); } break;
    case 'lunge':
      v.vx = v.face * 760;
      if (v.t <= 0 || v.hitL || v.hitR) { v.state = 'recover'; v.t = 0.75; v.vx = 0; }
      break;
    case 'idle':
      v.t -= dt * BAL.pace.vladik;
      v.face = tx > vcx ? 1 : -1;
      v.vx = Math.abs(tx - vcx) > 160 ? v.face * 90 : 0;
      // крещендо: в третьей фазе ноты падают с потолка
      if (phase3 && sc.rBoss() < dt * 1.4) sc.projs.push({ kind: 'note', x: (2 + sc.rBoss() * (sc.L.W - 4)) * T, y: 4 * T + 10, w: 14, h: 18, vx: 0, vy: 60, life: 3 });
      if (v.t <= 0) {
        const slimed = sc.curtains!.filter((c) => c.slime > 0).length;
        let opts = ['clef', 'leap', 'smear', 'lunge'];
        if (phase2) opts.push('staff', 'staff');
        if (phase3) opts.push('echo', 'echo');
        opts = opts.filter((o) => o !== v.last);
        if (slimed >= 3) opts = opts.filter((o) => o !== 'smear');
        const pick = opts[Math.floor(sc.rBoss() * opts.length)]!; v.last = pick; v.vx = 0;
        if (pick === 'clef') { v.state = 'clefWind'; v.t = phase2 ? 0.35 : 0.5; }
        if (pick === 'leap') { v.state = 'leapWind'; v.t = 0.4; }
        if (pick === 'smear') vladikPickCurtain(sc, phase2);
        if (pick === 'staff') { v.state = 'staffWind'; v.t = 0.55; vladikSpeak(v, 'НОТНЫЙ СТАН! ПО ЛИНЕЕЧКАМ!', 1.6); sc.sfx('violin'); }
        if (pick === 'echo') { v.state = 'echoWind'; v.t = 0.7; vladikSpeak(v, 'ЭХО! ДУЭТОМ!', 1.5); sc.sfx('violin'); }
        if (pick === 'lunge') { v.state = 'lungeWind'; v.t = phase3 ? 0.38 : 0.5; vladikSpeak(v, 'ВЫПАД!', 1.0); }
      }
      break;
    case 'clefWind':
      v.vx = 0; v.face = tx > vcx ? 1 : -1;
      if (v.t <= 0) {
        const n = phase3 ? 4 : phase2 ? 3 : 1; sc.sfx('violin');
        for (let i = 0; i < n; i++) {
          const hy = v.y + 20 + i * 26 - (n > 1 ? 10 : 0);
          sc.projs.push({ kind: 'clef', x: vcx + v.face * 24 - 14, y: hy, w: 28, h: 40, vx: v.face * (500 + i * 40), ax: -v.face * (680 + i * 40), vy: 0, life: 3.2, t0: i * 0.12, home: vcx, rot: 0 });
        }
        if (v['sayCd'] <= 0 && vr(sc) < 0.5) { vladikSpeak(v, 'Я НЕ СКРИПКА!', 1.2); v['sayCd'] = 2.5; }
        v.state = 'recover'; v.t = phase2 ? 0.7 : 1.0;
      }
      break;
    case 'leapWind':
      v.vx = 0; v.face = tx > vcx ? 1 : -1;
      if (v.t <= 0) { v.state = 'leap'; v.vy = -720; v.vx = clamp((tx - vcx) / 1.0, -380, 380); v['air'] = 0; sc.sfx('jump'); }
      break;
    case 'leap':
      v['air'] += dt;
      if (v.onGround && v['air'] > 0.15) {
        v.vx = 0; sc.shake(200, 0.01); sc.sfx('slam'); sc.dustAt(12, vcx, v.y + v.h);
        const n = phase2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32;
          sc.projs.push({ kind: 'note', x: vcx - 7, y: v.y + 10, w: 14, h: 18, vx: Math.cos(a) * 330, vy: Math.sin(a) * 520, life: 3 });
        }
        sc.sfx('violin');
        v.state = 'recover'; v.t = phase2 ? 0.5 : 0.75;
      }
      break;
    case 'smearGo': {
      const c = v['target'] as Curtain, cx = c.x + c.w / 2;
      v.face = cx > vcx ? 1 : -1; v.vx = v.face * 300;
      if (Math.abs(cx - vcx) < 26 || v.t <= 0) { v.vx = 0; v.state = 'smear'; v.t = 0.7; sc.sfx('squish'); }
      break;
    }
    case 'smear': {
      v.vx = 0; const c = v['target'] as Curtain; c.wet = 1 - v.t / 0.7;
      if (v.t <= 0) {
        c.slime = phase2 ? 10 : 8; c.wet = 0; c.drip = 0.4;
        const t2 = v['target2'] as Curtain | null;
        if (t2) { t2.slime = c.slime; t2.drip = 0.6; sc.burst(10, t2.x + t2.w / 2, t2.y + t2.h * 0.6, 0x8fdc3a); }
        sc.burst(10, c.x + c.w / 2, c.y + c.h * 0.6, 0x8fdc3a);
        if (v['sayCd'] <= 0) { vladikSpeak(v, 'ХЕ-ХЕ, ЛИПКО!', 1.2); v['sayCd'] = 2.5; }
        v.state = 'recover'; v.t = 0.5;
      }
      break;
    }
    case 'recover': v.vx = 0; v.t -= dt * BAL.pace.vladik; if (v.t <= 0) { v.state = 'idle'; v.t = phase3 ? 0.25 : phase2 ? 0.35 : 0.6; } break;
  }
  v.vy = Math.min(v.vy + P.G * dt, P.MAXFALL);
  sc.moveBody(v, dt);
}
// нотный стан: пять линий во всю ширину, часть загорается — стой на безопасной
function vladikStaff(sc: World, phase3: boolean): void {
  const fl = sc.L.floorY! * T, ys = [fl - 16, fl - 104, fl - 168, fl - 236, fl - 300];
  const patterns = phase3 ? [[0, 2, 4], [1, 3], [0, 3, 4], [1, 2, 4]] : [[0, 2], [1, 3], [0, 4], [1, 4]];
  const act = patterns[Math.floor(sc.rBoss() * patterns.length)]!;
  act.forEach((i) => sc.projs.push({ kind: 'staff', x: T, y: ys[i]! - 5, w: (sc.L.W - 2) * T, h: 10, vx: 0, vy: 0, life: 0.55, delay: 1.0 }));
  // бледные линии-подсказки на безопасных местах тоже рисуем — чтобы было видно весь стан
  ys.forEach((y, i) => { if (!act.includes(i)) sc.projs.push({ kind: 'staffghost', x: T, y: y - 5, w: (sc.L.W - 2) * T, h: 0, vx: 0, vy: 0, life: 1.4 }); });
}
function vladikPickCurtain(sc: World, phase2: boolean): void {
  const v = sc.vladik!, free = sc.curtains!.filter((c) => c.slime <= 0);
  if (!free.length) { v.state = 'idle'; v.t = 0.3; return; }
  const [tp] = sc.nearestPlayer(v.x, v.y); const px = tp ? tp.x : v.x;
  free.sort((a, b) => Math.abs(a.x + a.w / 2 - px) - Math.abs(b.x + b.w / 2 - px));
  v['target'] = free[0]; v['target2'] = phase2 && free[1] ? free[1] : null;
  v.state = 'smearGo'; v.t = 1.8;
  if (v['sayCd'] <= 0) { vladikSpeak(v, 'А ВОТ ТАК!', 1.0); v['sayCd'] = 2; }
}

/** исходная функция урона по Владику (RAW) */
export function rawVladik(sc: World, p: Player): void {
  const v = sc.vladik!;
  if (v.state === 'rage') { sc.snd('clink'); return; }
  v.hp -= 1; v.flash = 0.09; gainSilk(sc, p, true); if (!p.remote) sc.hitstop = 0.04; sc.sfx(bossHitSnd(sc, 'vladik', p)); sc.needleHits++;
  sc.burst(9, clamp(p.x + 7 + p.face * 26, v.x, v.x + v.w), v.y + v.h / 2, 0xf4f1e6);
  sc.bossBar(true, 'Владик Скрипка', Math.max(0, v.hp) / v.maxHp);
  if (v['sayCd'] <= 0 && vr(sc) < 0.35) { vladikSpeak(v, VLADIK_SAY_HIT[Math.floor(vr(sc) * VLADIK_SAY_HIT.length)]!, 1.2); v['sayCd'] = 2.5; }
  if (checkPhase(sc, v, 'Владик Скрипка')) { vladikSpeak(v, v.phase === 3 ? 'КРЕЩЕНДО!!! Я НЕ СКРИПКА!' : 'Я! НЕ! СКРИПКА!!!', 2); v['sayCd'] = 3; sc.sfx('violin'); }
  if (v.hp <= 0) vladikDie(sc);
}
function vladikDieBase(sc: World): void {
  const v = sc.vladik!; v.state = 'dead'; v.t = 2.6; v.vx = 0; sc.bossDead = true; bossDeathFx(sc);
  for (const pr of sc.projs) pr.dead = true;
  for (const c of sc.curtains!) c.slime = Math.min(c.slime, 1);
  vladikSpeak(v, 'ЛАДНО… Я СКРИПКА…', 2.4); sc.sfx('violin'); sc.shake(700, 0.008);
  sc.emit('bossBursts', { x: v.x, y: v.y, w: v.w, h: v.h });
  sc.after(3.3, () => { sc.bossBar(false); winGame(sc); });
}
export function vladikDie(sc: World): void { bossDeath(sc, 'vladikDie', vladikDieBase); }

// ----- снаряды Владика -----
export function stepClef(sc: World, pr: Record<string, number> & { x: number; w: number; vx: number; dead?: boolean }, dt: number): void {
  if (pr['t0']! > 0) { pr['t0']! -= dt; return; }
  pr.vx += pr['ax']! * dt; pr.x += pr.vx * dt; pr['rot']! += dt * 10;
  pr['y']! += Math.sin(pr['life']! * 6) * 30 * dt;
  // вернулся к Владику — исчез
  if (Math.sign(pr.vx) === Math.sign(pr['ax']!) && Math.abs(pr.x + 14 - pr['home']!) < 30) pr.dead = true;
  if (pr.x < T || pr.x + pr.w > (sc.L.W - 1) * T) { pr.vx = -pr.vx * 0.6; pr.x = clamp(pr.x, T, (sc.L.W - 1) * T - pr.w); }
}
export function stepNote(sc: World, pr: { x: number; y: number; vx: number; vy: number; dead?: boolean }, dt: number): void {
  pr.vy = Math.min(pr.vy + 900 * dt, 700); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
  if (sc.isSolid(Math.floor((pr.x + 7) / T), Math.floor((pr.y + 16) / T))) { pr.dead = true; sc.burst(5, pr.x + 7, pr.y + 14, 0xffd47a); }
}
export function stepDrip(sc: World, pr: { x: number; y: number; vy: number; dead?: boolean }, dt: number): void {
  pr.vy = Math.min(pr.vy + 900 * dt, 600); pr.y += pr.vy * dt;
  const t = sc.tileAt(Math.floor((pr.x + 4) / T), Math.floor((pr.y + 10) / T));
  if (t === SOLID || t === PLAT) { pr.dead = true; sc.burst(4, pr.x + 4, pr.y + 8, 0x8fdc3a); }
}
