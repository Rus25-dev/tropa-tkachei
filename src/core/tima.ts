// Босс «Тима Пиво»: берлога, пиво, банкротство, волшебная пыль и приставка (legacy/src/tima.js).
import { BAL, EMPTY, P, PLAT, T, TIMA_SAY_HIT, clamp } from './balance';
import type { Boss, Player, Proj } from './types';
import type { World } from './world';
import { bossDeathFx, bossHitSnd, checkPhase, stepBossLayered } from './bosses2';
import { gainSilk } from './damage';
import { bossDeath } from './korne';
import { winGame } from './win';

const vr = (sc: World): number => sc.rngFor('visual')(); // только для реплик

export function setupTimaArena(sc: World): void {
  sc.repo = false;
  sc.puddles = [];
  sc.timaHits = 0;
  makeTima(sc);
}
export function setRepo(sc: World, on: boolean): void {
  if (sc.repo === on) return;
  sc.repo = on;
  for (const f of sc.L.furniture!) for (let x = f.x0; x <= f.x1; x++) sc.grid[f.y]![x] = on ? EMPTY : PLAT;
  sc.emit('repo', { on });
}
export function makeTima(sc: World): void {
  const d = sc.L.tima!, hp = BAL.hp.tima[sc.nPlayers === 2 ? 1 : 0]!;
  sc.tima = { x: d.x * T - 30, y: (d.y + 1) * T - 80, w: 60, h: 80, vx: 0, vy: 0, face: -1, hp, maxHp: hp, phase: 1, state: 'intro', t: 3.2,
    flash: 0, last: '', say: 'ПИВКА ДЛЯ РЫВКА!', sayT: 2.2, sayCd: 0, barShown: false, air: 0, hyper: 0, dustCd: 6, dustHits: 0, drinkCd: 8 };
  if (sc.puddles) sc.puddles = [];
  setRepo(sc, false);
}
function timaSpeak(v: Boss, text: string, dur?: number): void { v['say'] = text; v['sayT'] = Math.max(dur || 1.6, 1.4 + text.length * 0.07); }

export function stepTima(sc: World, dt: number): void { stepBossLayered(sc, 'tima', dt, stepTimaBase); }

function stepTimaBase(sc: World, dt: number): void {
  const v = sc.tima; if (!v) return;
  v.flash -= dt; v['sayT'] -= dt; v['sayCd'] -= dt; v['dustCd'] -= dt; v['drinkCd'] -= dt;
  if (!v['barShown']) { v['barShown'] = true; sc.bossBar(true, 'Тима Пиво', v.hp / v.maxHp); }
  for (const q of sc.puddles!) q.t -= dt;
  sc.puddles = sc.puddles!.filter((q) => q.t > 0);
  if (sc.repoT > 0) { sc.repoT -= dt; if (sc.repoT <= 0) { setRepo(sc, false); } }
  if (v.state === 'dead') { v.t -= dt; v.vy = Math.min(v.vy + P.G * dt, P.MAXFALL); sc.moveBody(v, dt); return; }
  if (v['hyper'] > 0) { v['hyper'] -= dt; }
  const sp = v['hyper'] > 0 ? 1.55 : 1, phase2 = (v.phase || 1) >= 2, phase3 = (v.phase || 1) >= 3;
  const [tp] = sc.nearestPlayer(v.x + v.w / 2, v.y + v.h / 2);
  const tx = tp ? tp.x + 7 : v.x + v.w / 2, vcx = v.x + v.w / 2;
  v.t -= dt * sp;
  switch (v.state) {
    case 'intro': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.8; } break;
    case 'rage': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.3; } break;
    case 'collWind':
      v.vx = 0;
      if (v.t <= 0) {
        const n = phase3 ? 3 : 2, fl = sc.L.floorY! * T;
        for (let i = 0; i < n; i++) { const left = i % 2 === 0; sc.projs.push({ kind: 'collector', x: (left ? 2 + i : sc.L.W - 3 - i) * T, y: fl - 22, w: 22, h: 22, vx: 0, vy: 0, life: 11, hp: 2, spd: phase3 ? 165 : 130, face: left ? 1 : -1 }); }
        sc.sfx('coin'); v.state = 'recover'; v.t = 0.8;
      }
      break;
    // «лаги» (третья фаза): Тима пропадает, на полу вспыхивает метка, и он падает с потолка ровно на неё
    case 'lagWind':
      v.vx = 0;
      if (v.t <= 0) {
        const targets = sc.alivePlayers().length ? sc.alivePlayers() : sc.players, p = targets[Math.floor(sc.rBoss() * targets.length)]!;
        v['lagX'] = clamp(p.x + 7, 2 * T + 30, (sc.L.W - 2) * T - 30);
        sc.projs.push({ kind: 'mark', x: v['lagX'], y: sc.L.floorY! * T, w: 0, h: 0, vx: 0, vy: 0, life: 1.3 });
        sc.sfx('sparkle'); v.state = 'lagGone'; v.t = 1.1; v.y = -500; v.vy = 0;
      }
      break;
    case 'lagGone':
      v.vx = 0; v.vy = 0;
      if (v.t <= 0) { v.x = v['lagX'] - v.w / 2; v.y = 4 * T + 6; v.vy = 260; v.state = 'lagFall'; sc.sfx('throw'); }
      break;
    case 'lagFall': v.vx = 0; break;
    case 'achWind':
      v.vx = 0;
      if (v.t <= 0) {
        const targets = sc.alivePlayers().length ? sc.alivePlayers() : sc.players;
        for (let i = 0; i < 4; i++) { const p = targets[i % targets.length]!; sc.projs.push({ kind: 'trophy', x: clamp(p.x + 7 + (i - 1.5) * 90, 2 * T, (sc.L.W - 3) * T) - 15, y: 4 * T + 8, w: 30, h: 30, vx: 0, vy: 0, life: 5, bounces: 1, delay: 0.7 + i * 0.25 }); }
        sc.sfx('sparkle'); v.state = 'recover'; v.t = 1.0;
      }
      break;
    case 'idle':
      v.t -= dt * sp * BAL.pace.tima;
      v.face = tx > vcx ? 1 : -1;
      v.vx = Math.abs(tx - vcx) > 180 ? v.face * 80 * sp : 0;
      if (v.t <= 0) {
        v.vx = 0;
        if (v['dustCd'] <= 0 && v.hp < v.maxHp * 0.75 && v['hyper'] <= 0) { v.state = 'dustDraw'; v.t = 2.2; v['dustHits'] = 0; timaSpeak(v, 'ЩАС-ЩАС, НАЧЕРЧУ…', 1.6); sc.toastAll('Тима чертит круг для пыли — беги к нему и бей!'); break; }
        if (v['drinkCd'] <= 0 && v.hp < v.maxHp * 0.85 && sc.rBoss() < 0.5) { v.state = 'drink'; v.t = 1.2; v['drinkCd'] = 14; timaSpeak(v, 'БУЛЬ-БУЛЬ…', 1.2); sc.sfx('glug'); break; }
        const pool = ['beer', 'pad', 'ring', 'ring', 'box', 'bankrupt'];
        if (phase2 && !sc.projs.some((q) => q.kind === 'collector')) pool.push('coll');
        if (phase3) pool.push('ach', 'ach', 'lag', 'lag');
        const opts = pool.filter((o) => o !== v.last && !(o === 'bankrupt' && (sc.repoT > 0 || !phase2 && sc.rBoss() < 0.5)));
        const pick = opts[Math.floor(sc.rBoss() * opts.length)]!; v.last = pick;
        if (pick === 'beer') { v.state = 'beerWind'; v.t = 0.5; timaSpeak(v, 'ЛОВИ ПИВКО!', 1.0); }
        if (pick === 'pad') { v.state = 'pad'; v.t = 2.0; timaSpeak(v, 'ИКС-БОКС!', 1.2); sc.projs.push({ kind: 'pad', x: vcx, y: v.y + 30, w: 26, h: 18, vx: 0, vy: 0, life: 2.2, ang: v.face > 0 ? 0 : Math.PI, rad: 20, spin: v.face }); sc.sfx('buzz'); }
        if (pick === 'ring') { v.state = 'ringWind'; v.t = 0.9; timaSpeak(v, 'КРАСНОЕ КОЛЬЦО!', 1.3); sc.sfx('buzz'); }
        if (pick === 'box') { v.state = 'boxWind'; v.t = 0.5; timaSpeak(v, 'ДЕРЖИ ПРИСТАВКУ!', 1.1); }
        if (pick === 'bankrupt') { v.state = 'bankWind'; v.t = 0.8; timaSpeak(v, 'БАНКРОТСТВО!', 1.6); sc.sfx('roar'); }
        if (pick === 'coll') { v.state = 'collWind'; v.t = 0.8; timaSpeak(v, 'КОЛЛЕКТОРЫ, ФАС!', 1.5); }
        if (pick === 'lag') { v.state = 'lagWind'; v.t = 0.6; timaSpeak(v, 'ЛАГАЕТ!!', 1.3); sc.sfx('buzz'); }
        if (pick === 'ach') { v.state = 'achWind'; v.t = 0.7; timaSpeak(v, 'АЧИВКА РАЗБЛОКИРОВАНА!', 1.6); }
      }
      break;
    case 'beerWind':
      v.vx = 0; v.face = tx > vcx ? 1 : -1;
      if (v.t <= 0) {
        const n = phase2 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const dist = tx - vcx + (i - (n - 1) / 2) * 70;
          sc.projs.push({ kind: 'bottle', x: vcx - 5, y: v.y + 6, w: 10, h: 22, vx: clamp(dist / 0.95, -520, 520), vy: -520 - i * 20, life: 3, rot: 0 });
        }
        sc.sfx('throw'); v.state = 'recover'; v.t = 0.6;
      }
      break;
    case 'pad': v.vx = 0; if (v.t <= 0) { if (phase3 && v.last !== 'ringCombo') { v.last = 'ringCombo'; v.state = 'ringWind'; v.t = 0.55; timaSpeak(v, 'КОМБО! КОЛЬЦО!', 1.0); sc.sfx('buzz'); } else { v.state = 'recover'; v.t = 0.4; } } break;
    case 'ringWind':
      v.vx = 0;
      if (v.t <= 0) {
        const cy = v.y + v.h - 18;
        sc.projs.push({ kind: 'ringfx', x: vcx, y: v.y + 24, w: 0, h: 0, vx: 0, vy: 0, life: 0.9, r: 10 });
        for (const d of [-1, 1]) sc.projs.push({ kind: 'rwave', x: vcx - 12 + d * 26, y: cy, w: 24, h: 18, vx: d * (phase2 ? 520 : 450) * Math.min(sp, 1.25), vy: 0, life: 2.6 });
        sc.shake(260, 0.012); sc.sfx('slam');
        if (phase2 && !v['ring2']) { v['ring2'] = true; v.state = 'ringWind'; v.t = 0.5; } else { v['ring2'] = false; v.state = 'recover'; v.t = 0.7; } // во второй фазе кольцо бьёт дважды подряд
      }
      break;
    case 'boxWind':
      v.vx = 0; v.face = tx > vcx ? 1 : -1;
      if (v.t <= 0) {
        sc.projs.push({ kind: 'box', x: vcx - 18, y: v.y + 4, w: 36, h: 22, vx: clamp((tx - vcx) / 1.1, -460, 460), vy: -600, life: 4, bounces: 2 });
        sc.sfx('throw'); v.state = 'recover'; v.t = 0.6;
      }
      break;
    case 'bankWind':
      v.vx = 0;
      if (v.t <= 0) {
        const targets = sc.alivePlayers().length ? sc.alivePlayers() : sc.players;
        targets.forEach((p, i) => sc.projs.push({ kind: 'stamp', x: clamp(p.x + 7, 2 * T, (sc.L.W - 2) * T) - 40, y: 7 * T, w: 80, h: 44, vx: 0, vy: 0, life: 3, delay: 0.7 + i * 0.2 }));
        sc.repoT = 6; setRepo(sc, true);
        for (const p of sc.players) if (!p.remote) p.silk = Math.floor(p.silk / 2); // bankruptSilk
        sc.toastAll('Банкротство! Мебель изъята, нить ушла кредиторам');
        sc.sfx('coin'); v.state = 'recover'; v.t = 0.9;
      }
      break;
    case 'drink':
      v.vx = 0;
      if (v.t <= 0) { v.hp = Math.min(v.maxHp, v.hp + 2); sc.bossBar(true, 'Тима Пиво', v.hp / v.maxHp); timaSpeak(v, 'БУЭЭЭ!', 1.0); sc.sfx('burp'); v.state = 'recover'; v.t = 0.5; }
      break;
    case 'dustDraw':
      v.vx = 0;
      if (v.t <= 0) { v.state = 'dust'; v.t = 1.3; timaSpeak(v, 'ВОЛШЕБНАЯ ПЫЛЬ!', 1.3); sc.sfx('sparkle'); }
      break;
    case 'dust':
      v.vx = 0;
      if (v.t <= 0) { v['hyper'] = phase3 ? 9 : 8; v['dustCd'] = phase3 ? 13 : 20; timaSpeak(v, 'Я БЫСТРЫЙ!', 1.2); sc.sfx('sparkle'); sc.toastAll('Тима разогнался: бегай от него 8 секунд'); v.state = 'idle'; v.t = 0.3; }
      break;
    case 'sneeze': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.5; } break;
    case 'recover': v.vx = 0; v.t -= dt * sp * BAL.pace.tima; if (v.t <= 0) { v.state = 'idle'; v.t = (phase2 ? 0.45 : 0.7); } break;
  }
  if (v.state !== 'lagGone') {
    v.vy = Math.min(v.vy + P.G * dt, P.MAXFALL);
    sc.moveBody(v, dt);
  }
  if (v.state === 'lagFall' && v.onGround) {
    const vcx2 = v.x + v.w / 2, cy = v.y + v.h - 18;
    sc.shake(340, 0.016); sc.sfx('slam'); sc.dustAt(18, vcx2, v.y + v.h);
    sc.projs.push({ kind: 'ringfx', x: vcx2, y: v.y + 24, w: 0, h: 0, vx: 0, vy: 0, life: 0.9, r: 10 });
    for (const d of [-1, 1]) sc.projs.push({ kind: 'rwave', x: vcx2 - 12 + d * 34, y: cy, w: 24, h: 18, vx: d * 400, vy: 0, life: 2.6 });
    v.state = 'recover'; v.t = 1.2; timaSpeak(v, 'ЛАГ… ПРОШЁЛ', 1.1);
  }
}

/** исходная функция урона по Приме (RAW) */
export function rawTima(sc: World, p: Player): void {
  const v = sc.tima!;
  if (v.state === 'rage') { sc.snd('clink'); return; }
  v.hp -= 1; v.flash = 0.09; gainSilk(sc, p, true); if (!p.remote) sc.hitstop = 0.04; sc.sfx(bossHitSnd(sc, 'tima', p)); sc.timaHits++;
  sc.burst(9, clamp(p.x + 7 + p.face * 28, v.x, v.x + v.w), v.y + v.h / 2, 0xf4f1e6);
  if (v.state === 'drink') { v.state = 'recover'; v.t = 0.4; timaSpeak(v, 'ЭЙ, РАЗЛИЛ!', 1.0); sc.emit('foam', { n: 12, x: v.x + v.w / 2, y: v.y + 30 }); }
  if (v.state === 'dust' || v.state === 'dustDraw') {
    v['dustHits']++;
    if (v['dustHits'] >= 3) { v.state = 'sneeze'; v.t = 1.6; v['dustCd'] = 14; timaSpeak(v, 'АПЧХИ!', 1.2); sc.sfx('cough'); sc.emit('dustFx', { n: 30, x: v.x + v.w / 2 + v.face * 30, y: v.y + 20 }); }
  }
  sc.bossBar(true, 'Тима Пиво', Math.max(0, v.hp) / v.maxHp);
  if (checkPhase(sc, v, 'Тима Пиво')) { timaSpeak(v, v.phase === 3 ? 'ВСЁ, Я ЗЛОЙ! ДОНАТ НА ВСЁ!' : 'ТЫ ЧЁ, РЕАЛЬНО?!', 2); v['hyper'] = 0; }
  if (v['sayCd'] <= 0 && vr(sc) < 0.3 && v.state !== 'sneeze') { timaSpeak(v, TIMA_SAY_HIT[Math.floor(vr(sc) * TIMA_SAY_HIT.length)]!, 1.0); v['sayCd'] = 2.5; }
  if (v.hp <= 0) timaDie(sc);
}
function timaDieBase(sc: World): void {
  const v = sc.tima!; v.state = 'dead'; v.t = 2.6; v.vx = 0; v['hyper'] = 0; sc.bossDead = true; bossDeathFx(sc);
  for (const pr of sc.projs) pr.dead = true;
  setRepo(sc, false); sc.repoT = 0;
  timaSpeak(v, 'ВСЁ… Я СПАТЬ…', 2.4); sc.sfx('burp'); sc.shake(600, 0.008);
  sc.emit('bossBursts', { x: v.x, y: v.y, w: v.w, h: v.h, foam: true });
  sc.after(3.3, () => { sc.bossBar(false); winGame(sc); });
}
export function timaDie(sc: World): void { bossDeath(sc, 'timaDie', timaDieBase); }

// ----- снаряды Тимы -----
export function stepTimaProj(sc: World, pr: Proj, dt: number): void {
  const v = sc.tima!;
  if (pr.kind === 'bottle') {
    pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr['rot'] += dt * 12;
    const t = sc.tileAt(Math.floor((pr.x + 5) / T), Math.floor((pr.y + 20) / T));
    if (t === 1 || (t === PLAT && pr.vy > 0)) {
      pr.dead = true; sc.emit('foam', { n: 10, x: pr.x + 5, y: pr.y + 16 }); sc.sfx('glass');
      const gy = Math.floor((pr.y + 20) / T) * T;
      sc.puddles!.push({ x: pr.x + 5 - 40, w: 80, y: gy, t: 5 });
    }
  } else if (pr.kind === 'pad') {
    const vcx = v.x + v.w / 2, vcy = v.y + 34;
    const k = 1 - pr.life / 2.2;
    pr['rad'] = 20 + Math.min(1, k * 2.2) * 125 * (k > 0.8 ? (1 - k) * 5 : 1);
    pr['ang'] += pr['spin'] * dt * (v['hyper'] > 0 ? 7.5 : 5.5);
    pr.x = vcx + Math.cos(pr['ang']) * pr['rad'] - 13; pr.y = vcy + Math.sin(pr['ang']) * pr['rad'] * 0.75 - 9;
    pr['cx'] = vcx; pr['cy'] = vcy;
  } else if (pr.kind === 'rwave') {
    pr.x += pr.vx * dt;
    const fx = pr.vx > 0 ? pr.x + pr.w : pr.x;
    if (sc.isSolid(Math.floor(fx / T), Math.floor((pr.y + 9) / T))) pr.dead = true;
  } else if (pr.kind === 'ringfx') {
    pr['r'] += 900 * dt;
  } else if (pr.kind === 'box') {
    pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (sc.isSolid(Math.floor((pr.x + 18) / T), Math.floor((pr.y + 22) / T)) && pr.vy > 0) {
      pr.y = Math.floor((pr.y + 22) / T) * T - 22; sc.dustAt(8, pr.x + 18, pr.y + 22); sc.sfx('slam');
      if (pr['bounces']-- > 0) { pr.vy = -380; pr.vx *= 0.8; } else pr.dead = true;
    }
    if (sc.isSolid(Math.floor((pr.x + (pr.vx > 0 ? 36 : 0)) / T), Math.floor((pr.y + 10) / T))) pr.vx = -pr.vx;
  } else if (pr.kind === 'stamp') {
    pr.vy = Math.min(pr.vy + 1300 * dt, 900); pr.y += pr.vy * dt;
    if (sc.isSolid(Math.floor((pr.x + 40) / T), Math.floor((pr.y + 44) / T))) { pr.dead = true; sc.dustAt(16, pr.x + 40, pr.y + 44); sc.shake(180, 0.01); sc.sfx('slam'); }
  }
}
