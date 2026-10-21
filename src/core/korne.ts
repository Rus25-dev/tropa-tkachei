// Босс главы I — Корнематка (legacy/src/game.js: makeBoss, stepBoss, damageBoss, rootLine, killBoss) и общая обвязка смерти боссов.
import { BAL, P, T, clamp } from './balance';
import type { Player } from './types';
import type { World } from './world';
import { bossDeathFx, bossHitSnd, checkPhase, stepBossLayered } from './bosses2';
import { dropBeads } from './combat';
import { gainSilk } from './damage';
import { srOnSplit } from './speedrun';
import { saveProgress } from './campaign';
import { winGame } from './win';

export function makeBoss(sc: World): void {
  if (!sc.L.boss) { sc.boss = { x: -9999, y: -9999, w: 1, h: 1, vx: 0, vy: 0, hp: 1, maxHp: 1, state: 'gone', t: 0, face: 1, flash: 0 }; return; }
  const b = sc.L.boss, hp = BAL.hp.boss[sc.nPlayers === 2 ? 1 : 0]!;
  sc.boss = { x: b.x * T - 36, y: (b.y + 1) * T - 58, w: 72, h: 58, vx: 0, vy: 0, hp, maxHp: hp, phase: 1, state: 'sleep', t: 0, face: -1, jumps: 0, flash: 0, last: '', air: 0 };
  if (sc.bossDead) { sc.boss.state = 'gone'; }
}

export function stepBossKorne(sc: World, dt: number): void { stepBossLayered(sc, 'boss', dt, stepBossBase); }

function stepBossBase(sc: World, dt: number): void {
  const b = sc.boss; if (b.state === 'gone') return;
  b.flash -= dt;
  if (b.state === 'sleep') {
    if (!sc.bossDead && sc.players.some((p) => !p.downed && p.x / T > sc.L.boss!.trigger)) {
      sc.setGate(sc.gates[0]!, true); sc.sfx('gate');
      b.state = 'roar'; b.t = 1.4; sc.sfx('roar'); sc.shake(900, 0.006);
      sc.bossBar(true, 'Корнематка'); sc.toast('');
    }
    b.vy = Math.min(b.vy + P.G * dt, P.MAXFALL); sc.moveBody(b, dt); return;
  }
  if (b.state === 'dead') { b.t -= dt; if (b.t <= 0) { b.state = 'gone'; } return; }
  const phase2 = (b.phase || 1) >= 2, phase3 = (b.phase || 1) >= 3;
  const [tp] = sc.nearestPlayer(b.x + b.w / 2, b.y + b.h / 2);
  const tx = tp ? tp.x + 7 : b.x;
  const faceT = (): void => { b.face = tx > b.x + b.w / 2 ? 1 : -1; };
  b.t -= dt;
  switch (b.state) {
    case 'roar': b.vx = 0; if (b.t <= 0) { b.state = 'idle'; b.t = 1.0; } break;
    case 'rage': b.vx = 0; if (b.t <= 0) { b.state = 'idle'; b.t = 0.3; } break;
    case 'rootWind':
      b.vx = 0; faceT();
      if (b.t <= 0) { rootLine(sc, tx, phase3); b.state = 'recover'; b.t = phase3 ? 0.6 : 0.9; }
      break;
    case 'idle':
      b.vx = 0; faceT(); b.t -= dt * BAL.pace.boss;
      if (b.t <= 0) {
        const pool = ['leap', 'spores', 'charge']; if (phase2) pool.push('roots', 'roots');
        const opts = pool.filter((o) => o !== b.last);
        const pick = opts[Math.floor(sc.rBoss() * opts.length)]!; b.last = pick;
        if (pick === 'leap') { b.state = 'leapWind'; b.t = 0.38; b.jumps = phase3 ? 2 : 1; }
        if (pick === 'roots') { b.state = 'rootWind'; b.t = 0.6; sc.sfx('slam'); sc.shake(500, 0.004); }
        if (pick === 'spores') { b.state = 'sporeWind'; b.t = 0.45; }
        if (pick === 'charge') { b.state = 'chargeWind'; b.t = phase2 ? 0.4 : 0.55; }
      }
      break;
    case 'leapWind':
      b.vx = 0; faceT();
      if (b.t <= 0) { b.state = 'leap'; b.vy = -760; b.vx = clamp((tx - (b.x + b.w / 2)) / 1.0, -400, 400); b.air = 0; sc.sfx('jump'); }
      break;
    case 'leap':
      b.air += dt;
      if (b.onGround && b.air > 0.15) {
        b.vx = 0; sc.shake(220, 0.012); sc.sfx('slam');
        sc.dustAt(14, b.x + b.w / 2, b.y + b.h);
        for (const d of [-1, 1]) sc.projs.push({ kind: 'wave', x: b.x + b.w / 2 - 12 + d * 30, y: b.y + b.h - 18, w: 24, h: 18, vx: d * (phase2 ? 380 : 320), vy: 0, life: 2.4 });
        if (--b.jumps > 0) { b.state = 'leapWind'; b.t = 0.22; } else { b.state = 'recover'; b.t = phase2 ? 0.4 : 0.6; }
      }
      break;
    case 'sporeWind':
      b.vx = 0; faceT();
      if (b.t <= 0) {
        const n = phase3 ? 7 : phase2 ? 5 : 3; sc.sfx('spit');
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2);
          const dist = tx - (b.x + b.w / 2);
          sc.projs.push({ kind: 'spore', x: b.x + b.w / 2 + b.face * 20, y: b.y + 8, w: 12, h: 12, vx: clamp(dist * 0.9, -420, 420) + spread * 70, vy: -420 - Math.abs(spread) * 40, life: 3 });
        }
        b.state = 'recover'; b.t = phase2 ? 0.45 : 0.7;
      }
      break;
    case 'chargeWind':
      b.vx = 0; faceT();
      if (b.t <= 0) { b.state = 'charge'; sc.sfx('roar'); }
      break;
    case 'charge':
      b.vx = b.face * (phase2 ? 460 : 400);
      break;
    case 'stun': b.vx = 0; if (b.t <= 0) { b.state = 'idle'; b.t = phase2 ? 0.35 : 0.6; } break;
    case 'recover': b.vx = 0; b.t -= dt * BAL.pace.boss; if (b.t <= 0) { b.state = 'idle'; b.t = phase3 ? 0.25 : phase2 ? 0.35 : 0.6; } break;
  }
  b.vy = Math.min(b.vy + P.G * dt, P.MAXFALL);
  const was = b.state;
  sc.moveBody(b, dt);
  if (was === 'charge' && (b.hitL || b.hitR)) {
    b.state = 'stun'; b.t = 1.0; sc.shake(260, 0.014); sc.sfx('slam');
    const ax0 = sc.L.boss!.arenaX0, ax1 = sc.L.boss!.arenaX1;
    const n = phase2 ? 5 : 3;
    for (let i = 0; i < n; i++) sc.projs.push({ kind: 'rock', x: (ax0 + 2 + sc.rBoss() * (ax1 - ax0 - 4)) * T, y: 19 * T, w: 16, h: 16, vx: 0, vy: 0, life: 3, delay: i * 0.18 });
  }
}

/** исходная функция урона по Корнематке (RAW) */
export function rawKorne(sc: World, p: Player): void {
  const b = sc.boss;
  if (b.state === 'rage') { sc.snd('clink'); return; }
  b.hp -= 1; b.flash = 0.09; gainSilk(sc, p, true); if (!p.remote) sc.hitstop = 0.04; sc.sfx(bossHitSnd(sc, 'boss', p));
  sc.burst(10, clamp(p.x + 7 + p.face * 30, b.x, b.x + b.w), b.y + b.h / 2, 0xf4f1e6);
  sc.bossBar(true, 'Корнематка', b.hp / b.maxHp);
  if (b.hp <= 0) killBoss(sc); else checkPhase(sc, b, 'Корнематка');
}
// корни из-под земли: цепочка шипов от босса к игроку и шип прямо под ним
function rootLine(sc: World, tx: number, phase3: boolean): void {
  const b = sc.boss, fy = (sc.L.boss!.floorY || Math.floor((b.y + b.h) / T)) * T, ax0 = sc.L.boss!.arenaX0 * T + T, ax1 = sc.L.boss!.arenaX1 * T - T;
  void fy;
  const bx = b.x + b.w / 2, dir = Math.sign(tx - bx) || b.face, xs: [number, number][] = [];
  for (let x = bx + dir * 60, i = 0; dir > 0 ? x < ax1 : x > ax0; x += dir * 52, i++) xs.push([x, 0.5 + i * 0.09]);
  xs.push([tx, 0.75]);
  if (phase3) for (let x = bx - dir * 60, i = 0; dir > 0 ? x > ax0 : x < ax1; x -= dir * 52, i++) xs.push([x, 0.8 + i * 0.09]);
  const groundY = b.y + b.h;
  for (const [x, delay] of xs) sc.projs.push({ kind: 'rootspike', x: clamp(x, ax0, ax1) - 18, y: groundY - 70, w: 36, h: 70, vx: 0, vy: 0, life: 0.55, delay });
}

function killBossBase(sc: World): void {
  const b = sc.boss; b.state = 'dead'; b.t = 1.4; sc.bossDead = true;
  for (const pr of sc.projs) pr.dead = true;
  sc.sfx('roar'); sc.shake(1200, 0.01); sc.hitstop = 0.25; bossDeathFx(sc);
  sc.emit('bossBursts', { x: b.x, y: b.y, w: b.w, h: b.h });
  sc.after(1.3, () => {
    dropBeads(sc, b.x + b.w / 2, b.y + b.h / 2, 30);
    sc.setGate(sc.gates[0]!, false); sc.setGate(sc.gates[1]!, false); sc.sfx('gate');
    sc.bossBar(false); sc.toastAll('Корнематка повержена. Путь на восток открыт');
    for (const p of sc.players) if (p.downed && !p.remote) { p.downed = false; p.hp = 2; p.inv = 1.5; }
  });
}

// ---------- обвязка смерти боссов ----------
// Слои v1.8, снаружи внутрь: спидран (сплит) → движение 2 (парус за Владика) → снаряжение (награда) → рекорды (qol) → исходная функция.
export type BossDeathKind = 'killBoss' | 'mishaDie' | 'vladikDie' | 'timaDie';
const REWARD_ID: Record<BossDeathKind, string> = { killBoss: 'korn', mishaDie: 'misha', vladikDie: 'vladik', timaDie: 'tima' };
export function bossDeath(sc: World, kind: BossDeathKind, base: (sc: World) => void): void {
  const was = sc.boss && sc.boss.state;
  if (kind === 'vladikDie') {
    const first = !sc.abil['glide'] && sc.abil['glide'] !== false;
    if (first) {
      sc.abil['glide'] = true;
      if (!sc.sr && sc.mode !== 'bosstest') saveProgress(sc, { ...(sc.progress || { bench: 0, beads: sc.beads }), abil: sc.abil });
      if (sc.mode !== 'bosstest' || sc.camp) sc.toast('Паутинный парус: держи прыжок в падении — планируй', 5);
    }
  }
  if (!sc.sr) sc.emit('bossReward', { id: REWARD_ID[kind] });
  // qol.js: запись победы в рекорды боссов
  if (sc.fightOn && !sc.fightWon && !sc.train) {
    sc.fightWon = true;
    sc.emit('fightWin', { id: sc.mode === 'bosstest' ? sc.bossKind : 'korn', t: sc.fightT || 0 });
  }
  base(sc);
  if (sc.sr) {
    srOnSplit(sc);
    // в босс-раше у Корнематки нет пути к выходу: переходим к Мише сами, как у остальных боссов
    if (sc.sr.cat === 'boss' && kind === 'killBoss' && was !== 'dead' && !sc.sr.done) sc.after(3.3, () => { if (!sc.won) winGame(sc); });
  }
}
export function killBoss(sc: World): void { bossDeath(sc, 'killBoss', killBossBase); }
