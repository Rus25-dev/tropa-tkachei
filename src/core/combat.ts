// Бой: удары, урон, смерть и возрождение героев, отбив и нитяной всполох (legacy/src/game.js + combat2.js).
// Это «база» без обёрток: слои оружия, оберегов, стойкости и статистики собраны в damage.ts.
import { BAL, P, SLASH_KINDS, SPIKE, T, clamp } from './balance';
import type { Boss, Enemy, Player, Rect } from './types';
import type { World } from './world';
import { inset, overlap } from './world';
import { atkBox, wdef, type WeaponDef } from './weapons';
import { damageBoss, damageEnemy, hurtPlayer } from './damage';
import { e2Blocked, spawnEnemies, e2Parry } from './enemies';
import { makeBoss } from './korne';
import { makeMisha, mishaNeedle, makeMishaIfAlive } from './misha';
import { makeVladik } from './vladik';
import { makeTima, setRepo } from './tima';
import { hitCollector } from './bosses2';
import { campaignSave, campaignSaveName } from './campaign';
import { poiseAdd } from './bosses2';
import { areaOf } from './coop';
import { statParry } from './racestats';

// ---------- коробка удара (база) ----------
export function atkBoxBase(_sc: World, p: Player, W: WeaponDef): Rect {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const rm = W.reach * 1;
  if (p.atkDir === 'f') { const w = Math.round((p['heavy'] ? 68 : 48) * rm); return { x: p.face > 0 ? cx + 2 : cx - 2 - w, y: cy - 17 * W.thick, w, h: 32 * W.thick }; }
  if (p.atkDir === 'u') return { x: cx - 19, y: p.y - Math.round(40 * rm), w: 38, h: Math.round(46 * rm) };
  return { x: cx - 18, y: p.y + p.h - 8, w: 36, h: Math.round(44 * rm) };
}

// ---------- разрешение удара (база) ----------
export function resolveAttackBase(sc: World, p: Player): void {
  if (p.downed || p.atkT <= 0 || !p.atkHits) return;
  const box = atkBox(sc, p), local = !p.remote;
  const pogo = (): void => {
    if (!local || p.pogoed) return; p.pogoed = true; p.vy = -P.POGO; p.canDash = true; p.jumpCut = true; p.dashT = 0; sc.snd('pogo');
  };
  for (const e of sc.enemies) {
    if (e.dead || p.atkHits.has(e) || !overlap(box, e)) continue;
    p.atkHits.add(e);
    damageEnemy(sc, e, p); if (p['heavy'] && !e.dead) damageEnemy(sc, e, p);
    if (local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 150; }
  }
  const b = sc.boss;
  if (!p.atkHits.has(b) && b.state !== 'sleep' && b.state !== 'dead' && b.state !== 'gone' && overlap(box, b)) {
    p.atkHits.add(b);
    damageBoss(sc, 'boss', p); if (p['heavy'] && b.state !== 'dead' && b.state !== 'gone') damageBoss(sc, 'boss', p);
    if (local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 170; }
  }
  if (sc.misha && mishaNeedle(sc, p, box) && local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 190; }
  for (const [vb, key] of [[sc.vladik, 'vladik'], [sc.tima, 'tima']] as const) {
    if (!vb || p.atkHits.has(vb) || ['dead', 'intro'].includes(vb.state) || !overlap(box, vb)) continue;
    p.atkHits.add(vb);
    damageBoss(sc, key, p); if (p['heavy'] && vb.state !== 'dead') damageBoss(sc, key, p);
    if (local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 170; }
  }
  for (const pr of sc.projs) if (SLASH_KINDS.has(pr.kind) && !pr.dead && overlap(box, pr)) {
    if (pr.kind === 'collector') { hitCollector(sc, pr, p.face); if (local && p.atkDir === 'd') pogo(); continue; }
    pr.dead = true;
    if (pr.kind === 'letter' || pr.kind === 'rain') { sc.emit('paper', { n: 6, x: pr.x + 11, y: pr.y + 13 }); sc.sfx('clink'); }
    else if (pr.kind === 'spore') sc.burst(6, pr.x + 6, pr.y + 6, 0xc7f08a);
    else { sc.burst(6, pr.x + pr.w / 2, pr.y + pr.h / 2, 0xffd47a); sc.sfx('clink'); }
    if (local && p.atkDir === 'd') pogo();
  }
  if (local && p.atkDir === 'd' && !p.pogoed && sc.rectHitsTile(box, SPIKE, 0.7)) { pogo(); sc.parts(5, box.x + 18, box.y + 30, 0xffffff); }
}

// по боссу нить копится не с каждого удара (BAL.silkEvery): иначе лечения хватало бы на любой бой
export function gainSilkBase(sc: World, p: Player, boss?: boolean): void {
  if (p['noSilkGain']) return;
  if (boss && ((p['bossHits'] = ((p['bossHits'] as number) || 0) + 1) % BAL.silkEvery)) return;
  p.silk = Math.min(sc.silkMax, p.silk + 1);
}

export function damageEnemyBase(sc: World, e: Enemy, p: Player): void {
  if (e['e2'] && e2Blocked(sc, e, p)) return; // броня панциря, засадник под землёй
  e.hp -= 1 + sc.up.dmg; e.flash = 0.1; gainSilkLayered(sc, p, false); if (!p.remote) sc.hitstop = 0.045; sc.sfx('hit');
  sc.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xf4f1e6);
  const dx = p.atkDir === 'f' ? p.face : Math.sign(e.x + e.w / 2 - (p.x + 7)) || 1;
  e.kbT = 0.14; e.kbx = dx * (e.type === 'beetle' ? 120 : 220); e.kby = p.atkDir === 'u' ? -220 : p.atkDir === 'd' ? 160 : -60;
  if (e.type === 'beetle' && e['state'] === 'charge') { e['state'] = 'stun'; e['st'] = 0.6; }
  if (e.hp <= 0) killEnemy(sc, e);
}
// (gainSilk вызывается из слоёв: см. damage.ts; здесь — через динамический вход, чтобы не плодить циклы)
import { gainSilk as gainSilkLayered } from './damage';

export function killEnemy(sc: World, e: Enemy): void {
  e.dead = true; sc.emit('enemyKill', { x: e.x, y: e.y, w: e.w, h: e.h }); sc.sfx('kill'); sc.shake(90, 0.004);
  sc.burst(16, e.x + e.w / 2, e.y + e.h / 2, 0x9ff0c8);
  dropBeads(sc, e.x + e.w / 2, e.y + e.h / 2, e.beads);
}
export function dropBeads(sc: World, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) sc.beadsArr.push({ x: x - 4, y: y - 4, w: 8, h: 8, vx: (sc.rLoot() - 0.5) * 260, vy: -200 - sc.rLoot() * 260, t: 0 } as never);
}

// ---------- урон героям ----------
export function hurtPlayerBase(sc: World, p: Player, dmg: number, srcX: number | null, spike?: boolean): void {
  if (p.inv > 0 || p.downed) return;
  if (p.parryT > 0 && !spike) { parrySuccess(sc, p, srcX); return; }
  if (p.dashT > 0 && !spike) { // идеальный уворот: рывок сквозь удар — без урона, +нить, замедление
    p.inv = 0.35; p['pdodge'] = 0.4; if (!p.remote) { p.silk = Math.min(sc.silkMax, p.silk + 2); sc.hitstop = 0.07; }
    sc.snd('clink'); sc.parts(14, p.x + 7, p.y + 13, p.pal.accent);
    return;
  }
  p.hp -= dmg; p.inv = P.INV; if (!p.remote) sc.emit('buzz', { ms: 45 }); p.hurtT = P.HURT; p.dashT = 0; p.sit = false; p.atkT = 0; p['healCh'] = 0; p.healT = 0;
  p.vy = spike ? 0 : -320; p.kbx = srcX == null ? 0 : ((p.x + 7 < srcX) ? -1 : 1) * 260;
  sc.hitstop = 0.09; sc.shake(160, 0.008); sc.snd('hurt');
  sc.parts(10, p.x + 7, p.y + 13, 0xffffff);
  if (p.hp <= 0) downPlayer(sc, p);
}
export { hurtPlayer };

export function downPlayer(sc: World, p: Player): void {
  p.hp = 0; p.atkT = 0; p.dashT = 0;
  const partner = sc.players.find((q) => q !== p && !q.downed);
  if (partner) { p.downed = true; p.reviveT = 0; p.kbx = 0; sc.toast(`${p.pal.name} в коконе. ${partner.pal.name}: подойди и держи ↑`); }
  else teamWipe(sc);
}
export function teamWipe(sc: World): void {
  if (sc.wiping) return;
  sc.wiping = true; sc.deaths++;
  for (const p of sc.players) if (!p.remote) p.downed = true;
  if (sc.sr && !sc.sr.done) sc.sr.deaths++; // speedrun.js: счётчик обрывов
  sc.emit('wipe');
  sc.toast('Нить оборвалась…');
  sc.after(0.7, () => sc.emit('fade', { out: true, ms: 600 }));
  sc.after(1.35, () => respawnAll(sc));
}
export function respawnAll(sc: World): void {
  // tools.js: сброс инструментов и крюка; qol.js: бой заново
  sc.tl = []; for (const p of sc.players) p['hk'] = null;
  sc.fightOn = false;
  spawnEnemies(sc);
  for (const pr of sc.projs) pr.dead = true;
  if (!sc.bossDead) { makeBoss(sc); if (sc.gates[0]) sc.setGate(sc.gates[0], false); sc.bossBar(false); }
  if (sc.td) { sc.td = null; sc.tdFlip = false; sc.emit('td', { on: false }); }
  if (sc.misha && sc.misha.state !== 'dead') { makeMisha(sc); sc.bossBar(false); }
  if (sc.vladik && sc.vladik.state !== 'dead') { makeVladik(sc); sc.bossBar(false); }
  if (sc.tima && sc.tima.state !== 'dead') { sc.repoT = 0; makeTima(sc); sc.bossBar(false); }
  respawnLocal(sc);
}
export function respawnLocal(sc: World): void {
  sc.players.forEach((p) => {
    if (p.remote) return;
    Object.assign(p, { x: sc.respawn.x - 7 + p.i * 24, y: sc.respawn.y - 26, vx: 0, vy: 0, kbx: 0, hp: p.maxHp, downed: false, inv: 1, hurtT: 0, dashT: 0, atkT: 0, sit: false, reviveT: 0, healCh: 0, healT: 0, bombs: sc.L.crates ? 3 : 0 });
    p.safeX = p.x; p.safeY = p.y;
  });
  sc.wiping = false; sc.emit('fade', { out: false, ms: 600 });
  sc.emit('camSnap');
}

// скамья: ↑ открывает меню (ingame), «Отдохнуть» — benchRest
export function benchRest(sc: World, p: Player, b: { x: number; y: number }, quiet?: boolean): void {
  p.sit = true; p.x = b.x - 7; p.hp = p.maxHp; sc.respawn = { x: b.x, y: b.y }; sc.snd('bench');
  for (const q of sc.players) if (q.downed && !q.remote) { q.downed = false; q.hp = 2; q.inv = 1.5; q.x = b.x - 7 + 22; q.y = b.y - 26; }
  if (!quiet) sc.toast(sc.camp ? 'Скамья: здесь вы очнётесь. Прогресс сохранён. ↓ — лавка' : 'Скамья: здесь вы очнётесь. Прогресс сохранён');
  if (sc.mode === 'story') {
    const bi = sc.benches.indexOf(b), area = areaOf(sc, b.x / T);
    campaignSave(sc, { bench: bi, name: campaignSaveName(sc, area.name) });
  }
}

// ---------- отбив и нитяной всполох (combat2.js) ----------
// отбив: удар, пришедший в окно отбива, не ранит, даёт нить, сбивает снаряды и стойкость босса
export function parrySuccess(sc: World, p: Player, _srcX: number | null): void {
  statParry(sc, p);
  p.inv = 0.5; p.parryT = 0; p.parryCd = 0.15;
  if (!p.remote) { p.silk = Math.min(sc.silkMax, p.silk + 1); sc.hitstop = 0.1; }
  const cx = p.x + 7, cy = p.y + 13;
  sc.snd('parry'); sc.emit('flash', { ms: 90, r: 255, g: 255, b: 255 });
  sc.parts(18, cx + p.face * 10, cy, 0xffffff);
  for (const pr of sc.projs) if (!pr.dead && pr.kind !== 'bomb' && Math.hypot(pr.x - cx, pr.y - cy) < 110) { pr.dead = true; sc.burst(5, pr.x, pr.y, 0xffffff); }
  for (const e of sc.enemies) if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < 100) { e.kbT = 0.2; e.kbx = Math.sign(e.x - cx) * 300; e.kby = -120; e.flash = 0.1; if (e['state'] === 'charge') { e['state'] = 'stun'; e['st'] = 0.8; } }
  parryPoise(sc, cx, cy);
  e2Parry(sc, cx, cy); // enemies2.js: отбив ломает броню панциря
}
export function parryPoise(sc: World, cx: number, cy: number): void {
  for (const b of [sc.boss, sc.vladik, sc.tima]) if (b && Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < 190) poiseAdd(sc, b, 3);
}
// нитяной всполох (↑ + кнопка нити): тратит BURST нити, бьёт всё вокруг и сбивает снаряды
export function silkBurst(sc: World, p: Player): void {
  p.silk -= P.BURST; p.inv = Math.max(p.inv, 0.3); p.healT = 0.3;
  const cx = p.x + 7, cy = p.y + 13;
  sc.snd('slam'); sc.shake(180, 0.008); sc.hitstop = 0.06;
  sc.parts(36, cx, cy, p.pal.accent);
  p['burstFx'] = 0.35;
  silkBurstHit(sc, p, cx, cy);
}
export function silkBurstHit(sc: World, p: Player, cx: number, cy: number): void {
  sc._e2burst = true; // enemies2.js: всполох пробивает броню
  try {
    const R = 120; p['noSilkGain'] = true; // всполох нить не копит: иначе он оплачивал бы сам себя
    for (const pr of sc.projs) if (!pr.dead && pr.kind !== 'bomb' && Math.hypot(pr.x - cx, pr.y - cy) < R) pr.dead = true;
    for (const e of sc.enemies) if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) { damageEnemy(sc, e, p); if (!e.dead) damageEnemy(sc, e, p); }
    for (const [b, key] of [[sc.boss, 'boss'], [sc.vladik, 'vladik'], [sc.tima, 'tima']] as const) {
      if (!b || ['dead', 'gone', 'sleep', 'intro'].includes(b.state)) continue;
      if (Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < R + b.w / 2) { for (let i = 0; i < 3 && !['dead', 'gone'].includes(b.state); i++) damageBoss(sc, key, p); }
    }
    p['noSilkGain'] = false;
  } finally { sc._e2burst = false; }
}

export { inset, clamp, setRepo, makeMishaIfAlive, wdef };
export type { Boss };
