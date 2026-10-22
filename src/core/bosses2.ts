// Боссы 2.0 (legacy/src/bosses2.js): фазы, стойкость и оглушение, казнь, новые снаряды. Общие для всех боссов правила.
import { KITS, P, PHASE_LINES, POISE_MAX, STAGGER_T, EXEC_FRAC, T, clamp, dataIdx, dataKey } from './balance';
import type { BossKey, BossRef } from './balance';
import type { Boss, Player, Proj } from './types';
import type { World } from './world';
import { phaseOf } from './world';
import { hasCharm } from './loadout';
import { poiseMul } from './weapons';
import { rawBossDamage } from './damage';
import { slowDt } from './status';
import { statBegin } from './racestats';
import { dataPoiseMul, dataStaggerBegin, dataStaggerRoom, onStagger } from './boss/exec';

export const bossOf = (sc: World, key: BossRef): Boss | null => (key === 'boss' ? sc.boss : key === 'vladik' || key === 'tima' ? sc[key] : sc.bosses[dataIdx(key)] ?? null);
const NAMES: Record<BossKey, string> = { boss: 'Корнематка', vladik: 'Владик Скрипка', tima: 'Тима Пиво' };
export const nameOf = (key: BossRef, b: Boss): string => NAMES[key as BossKey] ?? (b['name'] as string);
/** все боссы мира с ключами: Корнематка, Владик, Тима и боссы на данных (Миша живёт отдельно) */
export const bossRefs = (sc: World): [Boss, BossRef][] => {
  const out: [Boss, BossRef][] = [[sc.boss, 'boss']];
  if (sc.vladik) out.push([sc.vladik, 'vladik']);
  if (sc.tima) out.push([sc.tima, 'tima']);
  sc.bosses.forEach((b, i) => out.push([b, dataKey(i)]));
  return out;
};

// ----- фазы -----
/** вызывается после урона: если перешли порог — рёв, неуязвимость, отталкивание */
export function checkPhase(sc: World, b: Boss, name: string): boolean {
  const ph = phaseOf(b);
  if (b.hp > 0 && ph > (b.phase || 1)) { b.phase = ph; phaseShift(sc, b, name, ph); return true; }
  return false;
}
function phaseShift(sc: World, b: Boss, name: string, ph: number): void {
  b.state = 'rage'; b.t = 1.3; b.vx = 0;
  sc.sfx('roar'); sc.shake(700, 0.012); sc.emit('flash', { ms: 260, r: 255, g: 240, b: 220 }); if (sc.online === 'host') sc.sendEv({ k: 'flash' });
  const cx = Math.round(b.x + b.w / 2);
  knockFrom(sc, cx); sc.sendEv({ k: 'kb', x: cx });
  for (const pr of sc.projs) if (pr.kind !== 'bomb') pr.dead = true;
  const line = PHASE_LINES[name] && PHASE_LINES[name][ph];
  sc.toastAll(`${name} — фаза ${ph}${line ? ': ' + line : ''}`);
  sc.emit('phaseShift', { name, ph });
}
export function knockFrom(sc: World, cx: number): void {
  for (const p of sc.players) if (!p.remote && !p.downed) { const d = Math.sign(p.x + 7 - cx) || 1; p.kbx = d * 430; p.vy = -380; p.hurtT = 0.22; p.inv = Math.max(p.inv, 0.6); }
}

// ----- стойкость -----
export function poiseAdd(sc: World, b: Boss | null, n0: number): void {
  if (sc.online === 'guest') return; // стойку считает только хост, гость получает её в снимке
  const n = poiseMul(sc, n0);
  if (!b || b['poiseImmune'] > 0 || b.stagger > 0 || ['sleep', 'dead', 'gone', 'intro', 'rage'].includes(b.state)) return;
  b['poise'] = (b['poise'] || 0) + n; b['poiseT'] = 0;
  if (b['poise'] >= POISE_MAX[b.phase || 1]! * dataPoiseMul(b)) {
    b['poise'] = 0; b.stagger = STAGGER_T * dataStaggerBegin(b); b['executed'] = false; b.flash = 0.1;
    sc.sfx('stagger'); sc.shake(200, 0.01); sc.hitstop = 0.1;
    sc.burst(24, b.x + b.w / 2, b.y + 10, 0xffd47a);
    sc.toastAll(sc._execHint ? 'Оглушён! Бей!' : 'Оглушён! Подойди и ударь вверх или вниз — казнь'); sc._execHint = true;
    for (const pr of sc.projs) if (pr.kind === 'spore' || pr.kind === 'letter') pr.dead = true;
    if (b['d']) onStagger(b); // босс на данных: текущая атака обрывается
  }
}

/** обёртка шага босса: замедление (status.js, внешняя) и оглушение/спад стойкости (bosses2.js) */
export function stepBossLayered(sc: World, key: BossRef, dt0: number, base: (sc: World, dt: number) => void): void {
  const b = bossOf(sc, key);
  const dt = slowDt(sc, b, dt0, true);
  if (b && b.stagger > 0) {
    b.stagger -= dt; b.vx = 0; b.flash = Math.floor(b.stagger * 16) % 2 ? 0.05 : 0;
    b.vy = Math.min(b.vy + P.G * dt, P.MAXFALL); sc.moveBody(b, dt);
    if (b.stagger <= 0) { b.state = 'idle'; b.t = 0.45; b['poiseImmune'] = 5; }
    return;
  }
  base(sc, dt);
  if (b) { b['poiseImmune'] = Math.max(0, (b['poiseImmune'] || 0) - dt); b['poiseT'] = (b['poiseT'] || 0) + dt; if (b['poiseT'] > 1.4 && b['poise'] > 0) { b['poise']--; b['poiseT'] = 0; } }
}
/** обёртка урона: двойной по оглушённому и рост стойкости (внутри — исходная функция RAW) */
export function poiseWrapDamage(sc: World, key: BossRef, p: Player): void {
  const b = bossOf(sc, key);
  const live = b && !['sleep', 'dead', 'gone', 'intro', 'rage'].includes(b.state);
  const was = b && b.hp;
  rawBossDamage(sc, key, p);
  if (!live || b!.hp <= 0 || b!.hp === was) return;
  if (b!.stagger > 0) {
    // двойной урон по оглушённому (у боссов на данных — не выше потолка за окно оглушения)
    if (!dataStaggerRoom(b!)) return;
    b!.hp -= 1; sc.bossBar(true, nameOf(key, b!), Math.max(0, b!.hp) / b!.maxHp);
    sc.burst(8, b!.x + b!.w / 2, b!.y + b!.h / 2, 0xffd47a);
    if (b!.hp <= 0) rawBossDamage(sc, key, p);
    return;
  }
  poiseAdd(sc, b, 1);
}

export function bossHitSnd(sc: World, key: BossRef, p: Player | null): string {
  const b = bossOf(sc, key);
  if (b && b.stagger > 0) return 'hitCrit';
  if (p && p['heavy']) return 'hitHeavy';
  return ({ boss: 'hitWood', vladik: 'hitString', tima: 'hitDull' } as Record<string, string>)[key] || 'hit';
}

// ----- казнь -----
type Kit = { key: BossRef; name: string };
function execTarget(sc: World, p: Player): Kit | null {
  const kits: Kit[] = [...KITS, ...sc.bosses.map((b, i) => ({ key: dataKey(i), name: b['name'] as string }))];
  for (const kit of kits) {
    const b = bossOf(sc, kit.key);
    if (!b || !(b.stagger > 0.2) || b['executed'] || ['dead', 'gone', 'sleep', 'intro'].includes(b.state)) continue;
    if (Math.abs(b.x + b.w / 2 - (p.x + 7)) < b.w / 2 + 74 && p.y + 26 > b.y - 24 && p.y < b.y + b.h) return kit;
  }
  return null;
}
/** казнь: удар вверх или вниз рядом с оглушённым боссом (вызывает игрок, который бьёт) */
export function tryExecute(sc: World, p: Player, dir: string): boolean {
  const kit = execTarget(sc, p); if (!kit) return false;
  const b = bossOf(sc, kit.key)!;
  p.face = Math.sign(b.x + b.w / 2 - (p.x + 7)) || p.face;
  p['execT'] = 0.42; p['execDir'] = dir; p.atkCd = 0.6; p.atkT = 0; p.dashT = 0; p['comboT'] = 0; p.inv = Math.max(p.inv, 0.55); p.kbx = 0;
  p.vx = 0; p.vy = dir === 'u' ? -320 : -140; p.canDash = true;
  if (sc.auth()) execBoss(sc, p, kit, dir); else sc.sendEv({ k: 'exec', i: p.i, key: kit.key, d: dir });
  return true;
}
/** execBoss: статистика (внешний слой) → оберег «Охотник» → база */
export function execBoss(sc: World, p: Player, kit: { key: BossRef }, dir: string): void {
  const S = statBegin(sc);
  const cur0 = sc.testBoss() ?? sc.boss;
  const wasS = S && cur0 ? !!cur0['executed'] : false;
  const b = bossOf(sc, kit.key), was = b && b['executed'];
  execBossBase(sc, p, kit, dir);
  if (b && b['executed'] && !was && hasCharm(p, 'hunter')) { if (p.remote) { for (let i = 0; i < 3; i++) sc.sendEv({ k: 'silk', i: p.i }); } else p.silk = Math.min(sc.silkMax, p.silk + 3); }
  if (S && !wasS) { const b2 = sc.testBoss() ?? sc.boss; if (b2 && b2['executed']) S.execs++; }
}
function execBossBase(sc: World, p: Player, kit: { key: BossRef }, dir: string): void {
  const b = bossOf(sc, kit.key);
  if (!b || !(b.stagger > 0.15) || b['executed'] || ['dead', 'gone'].includes(b.state)) return;
  b['executed'] = true;
  const n = Math.max(4, Math.round(b.maxHp * EXEC_FRAC)), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (p.remote) { p['execT'] = 0.42; p['execDir'] = dir; }
  sc.sendEv({ k: 'execfx', i: p.i, d: dir, x: Math.round(cx), y: Math.round(cy) });
  sc.emit('execFx', { x: cx, y: cy, dir });
  sc.sfx('exec'); sc.shake(420, 0.018); sc.hitstop = 0.22;
  // урон без шума: n ударов исходной функцией, нить за них не копится — вместо этого фиксированный бонус
  sc.quiet = true; p['noSilkGain'] = true;
  for (let i = 0; i < n && b.hp > 0 && !['dead', 'gone', 'rage'].includes(b.state); i++) rawBossDamage(sc, kit.key, p);
  sc.quiet = false; p['noSilkGain'] = false;
  if (p.remote) { for (let i = 0; i < 3; i++) sc.sendEv({ k: 'silk', i: p.i }); } else p.silk = Math.min(sc.silkMax, p.silk + 3);
  if (b.hp > 0) { b.stagger = Math.min(b.stagger, 0.4); b['poise'] = 0; b['poiseImmune'] = 6; }
}

/** смерть босса: замедление времени и белая вспышка */
export function bossDeathFx(sc: World): void { sc.sendEv({ k: 'deathfx' }); deathFxLocal(sc); }
export function deathFxLocal(sc: World): void {
  sc.slowDur = 1.7; sc.slowT = 1.7;
  sc.emit('flash', { ms: 700, r: 255, g: 250, b: 235 });
  sc.snd('bossdie');
}

// ----- новые снаряды -----
export function stepExtraProj(sc: World, pr: Proj, dt: number): boolean {
  switch (pr.kind) {
    case 'glob': // плевок (enemies2.js): дуга под гравитацией
      pr.vy += 700 * dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (sc.isSolid(Math.floor((pr.x + 6) / T), Math.floor((pr.y + 6) / T))) { pr.dead = true; sc.burst(7, pr.x + 6, pr.y + 6, 0xc7f08a); }
      return true;
    case 'rain':
      pr.y += pr.vy * dt;
      if (sc.isSolid(Math.floor((pr.x + 11) / T), Math.floor((pr.y + 26) / T))) { pr.dead = true; sc.paperAt(5, pr.x + 11, pr.y + 20); }
      return true;
    case 'collector': {
      pr['hitCd'] = (pr['hitCd'] || 0) - dt; if (pr['flash'] > 0) pr['flash'] -= dt; // вспышка — только для отрисовки
      const [tp] = sc.nearestPlayer(pr.x + 11, pr.y + 11);
      if (pr['kbT'] > 0) pr['kbT'] -= dt;
      else if (tp) { const d = Math.sign(tp.x + 7 - (pr.x + 11)) || 1; pr['face'] = d; pr.vx += (d * pr['spd'] - pr.vx) * Math.min(1, dt * 6); }
      pr.vy = Math.min(pr.vy + P.G * dt, P.MAXFALL);
      sc.moveBody(pr as never, dt);
      if ((pr['hitL'] || pr['hitR']) && pr['onGround']) pr.vy = -420;
      return true;
    }
    case 'trophy':
      pr.vy = Math.min(pr.vy + 1100 * dt, 820); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (sc.isSolid(Math.floor((pr.x + 15) / T), Math.floor((pr.y + 30) / T)) && pr.vy > 0) {
        pr.y = Math.floor((pr.y + 30) / T) * T - 30; sc.dustAt(8, pr.x + 15, pr.y + 30); sc.sfx('glass');
        if (pr['bounces']-- > 0) { pr.vy = -320; pr.vx = (sc.rBoss() - 0.5) * 300; } else pr.dead = true;
      }
      return true;
    case 'echo': // призрак Владика: бежит вдоль пола и исчезает за дальней стеной
      pr.x += pr.vx * dt;
      if ((pr.vx < 0 && pr.x < T - 60) || (pr.vx > 0 && pr.x + pr.w > (sc.L.W - 1) * T + 60)) pr.dead = true;
      return true;
    case 'roller': // печатный валик Миши: до дальней стены и обратно, потом гаснет
      pr.x += pr.vx * dt;
      if ((pr.x < T && pr.vx < 0) || (pr.x + pr.w > (sc.L.W - 1) * T && pr.vx > 0)) {
        pr.vx = -pr.vx; pr.x = clamp(pr.x, T, (sc.L.W - 1) * T - pr.w); pr['rev'] = (pr['rev'] || 0) + 1; sc.shake(160, 0.006); sc.sfx('slam');
        if (pr['rev'] >= 2) pr.dead = true;
      }
      return true;
    case 'rootspike': case 'staff': case 'staffghost': case 'mark': return true; // неподвижны: живут свой срок после предупреждения
  }
  return false;
}
export function hitCollector(sc: World, pr: Proj, dir: number): void {
  if ((pr['hitCd'] || 0) > 0) return;
  pr['hitCd'] = 0.22; pr['hp']--; pr['flash'] = 0.1; pr['kbT'] = 0.18; pr.vx = dir * 300; pr.vy = -240; sc.sfx('hit');
  if (pr['hp'] <= 0) { pr.dead = true; sc.sfx('coin'); sc.burst(12, pr.x + 11, pr.y + 11, 0xffd47a); }
}
