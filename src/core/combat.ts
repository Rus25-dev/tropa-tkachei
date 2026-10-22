// Бой: удары, урон, смерть и возрождение героев, отбив и нитяной всполох (legacy/src/game.js + combat2.js).
// Это «база» без обёрток: слои оружия, оберегов, стойкости и статистики собраны в damage.ts.
import { BAL, P, PARRY2, SPIKE, T, clamp } from './balance';
import { projReg } from './plugin/regs';
import type { Boss, Enemy, HitKind, Player, Rect } from './types';
import type { World } from './world';
import { inset, overlap } from './world';
import { atkBox, wdef, type WeaponDef } from './weapons';
import { damageBoss, damageEnemy, hurtPlayer } from './damage';
import { e2Blocked, enemyHitReact, spawnEnemies, e2Parry } from './enemies';
import { resetFight } from './boss/exec';
import { bossRefs } from './bosses2';
import { campaignSave, campaignSaveName } from './campaign';
import { poiseAdd } from './bosses2';
import { areaOf } from './coop';
import { statParry } from './racestats';
import { srDuelDefeat } from './speedrun';
import { kitClear, kitGhost } from './kit/moves';
import type { HitSource } from './hit';
import { canClearProj } from './proj-kit';
import { cancelPlayerActions, resetPlayerActions } from './player-actions';
import { defenseRules } from './defense';

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
  const box = atkBox(sc, p), local = !p.remote, auth = sc.auth();
  const pogo = (): void => {
    if (!local || p.pogoed) return; p.pogoed = true; p.vy = -P.POGO; p.canDash = true; p.jumpCut = true; p.dashT = 0; sc.snd('pogo');
  };
  for (const e of sc.enemies) {
    if (e.dead || p.atkHits.has(e) || !overlap(box, e)) continue;
    p.atkHits.add(e);
    if (auth) { damageEnemy(sc, e, p); if (p['heavy'] && !e.dead) damageEnemy(sc, e, p); } else if (!e2Blocked(sc, e, p, true)) { e.flash = 0.1; if (!p.remote) { sc.hitstop = 0.045; sc.snd('hit'); } } // удар напарника уже озвучил хост (snd), зависание кадра — только своему
    if (local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 150; }
  }
  for (const [vb, key] of bossRefs(sc)) { // удары игрока по боссам на данных
    if (p.atkHits.has(vb) || ['dead', 'intro'].includes(vb.state) || !overlap(box, vb)) continue;
    p.atkHits.add(vb);
    if (auth) { damageBoss(sc, key, p); if (p['heavy'] && vb.state !== 'dead') damageBoss(sc, key, p); } else { vb.flash = 0.09; if (!p.remote) { sc.hitstop = 0.04; sc.snd('hit'); } }
    if (local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 170; }
  }
  for (const pr of sc.projs) {
    const sl = !pr.dead && projReg.get(pr.kind)?.slash; // срезается ли вид обычным ударом (src/content/projectiles)
    if (!sl || !overlap(box, pr)) continue;
    const so = typeof sl === 'object' ? sl : null;
    if (auth) {
      pr.dead = true;
      if (so?.onCut) so.onCut(sc, pr);
      else { sc.burst(6, pr.x + pr.w / 2, pr.y + pr.h / 2, 0xffd47a); sc.sfx('clink'); }
    } else if (so?.guestCut !== false) { pr.dead = true; if (local) sc.sendEv({ k: 'cut', kind: pr.kind, x: Math.round(pr.x), y: Math.round(pr.y) }); } // чужой взмах срезает хост сам
    if (local && p.atkDir === 'd') pogo();
  }
  if (local && p.atkDir === 'd' && !p.pogoed && sc.rectHitsTile(box, SPIKE, 0.7)) { pogo(); sc.parts(5, box.x + 18, box.y + 30, 0xffffff); }
}

// по боссу нить копится не с каждого удара (BAL.silkEvery): иначе лечения хватало бы на любой бой
export function gainSilkBase(sc: World, p: Player, boss?: boolean): void {
  if (p['noSilkGain']) return;
  if (boss && ((p['bossHits'] = ((p['bossHits'] as number) || 0) + 1) % BAL.silkEvery)) return;
  if (p.remote) sc.sendEv({ k: 'silk', i: p.i }); else p.silk = Math.min(sc.silkMax, p.silk + 1);
}

export function damageEnemyBase(sc: World, e: Enemy, p: Player): void {
  if (e['e2'] && e2Blocked(sc, e, p)) return; // броня панциря, засадник под землёй
  e.hp -= 1 + sc.up.dmg; e.flash = 0.1; gainSilkLayered(sc, p, false); if (!p.remote) sc.hitstop = 0.045; sc.sfx('hit');
  sc.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xf4f1e6);
  const dx = p.atkDir === 'f' ? p.face : Math.sign(e.x + e.w / 2 - (p.x + 7)) || 1;
  e.kbT = 0.14; e.kby = p.atkDir === 'u' ? -220 : p.atkDir === 'd' ? 160 : -60; enemyHitReact(e, dx, false);
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
export function hurtPlayerBase(sc: World, p: Player, dmg: number, srcX: number | null, spike?: boolean, hk?: HitKind, source?: HitSource): void {
  if (p.inv > 0 || p.downed) return;
  if (!spike && kitGhost(p, hk)) return; // теневой рывок, вспышка, кристальный рывок, нырок: неуязвимость к тому, что не 'unblockable' (шипы бьют всегда)
  if (p.parryT > 0 && !spike) {
    if (defenseRules(hk).parry) { parrySuccess(sc, p, srcX, hk, source); return; }
    // «dodge» и «unblockable» отбивом не гасятся: окно сгорает со «звоном», урон проходит
    p.parryT = 0; sc.snd('parryFail'); sc.parts(8, p.x + 7 + p.face * 10, p.y + 13, 0xb0a0a0);
  }
  if (p.dashT > 0 && !spike && defenseRules(hk).dodge) { // идеальный уворот: рывок сквозь удар — без урона, +нить, замедление
    p.inv = 0.35; p['pdodge'] = 0.4; if (!p.remote) { p.silk = Math.min(sc.silkMax, p.silk + 2); sc.hitstop = 0.07; }
    sc.snd('clink'); sc.parts(14, p.x + 7, p.y + 13, p.pal.accent);
    return;
  }
  cancelPlayerActions(sc, p);
  p.hp -= dmg; p.inv = P.INV; if (!p.remote) sc.emit('buzz', { ms: 45, dead: p.hp <= 0 }); p.hurtT = P.HURT; p.dashT = 0; p.sit = false;
  p.vy = spike ? 0 : -320; p.kbx = srcX == null ? 0 : ((p.x + 7 < srcX) ? -1 : 1) * 260;
  sc.hitstop = 0.09; sc.emit('shake', { d: 160, i: 0.008 }); sc.snd('hurt');
  sc.parts(10, p.x + 7, p.y + 13, 0xffffff);
  if (p.hp <= 0) downPlayer(sc, p);
}
export { hurtPlayer };

export function downPlayer(sc: World, p: Player): void {
  p.hp = 0; p.atkT = 0; p.dashT = 0;
  const partner = sc.players.find((q) => q !== p && !q.downed);
  if (partner) { p.downed = true; p.reviveT = 0; p.kbx = 0; sc.toast(`${p.pal.name} в коконе. ${partner.pal.name}: подойди и держи ↑`); }
  else if (!sc.auth()) { p.downed = true; p.reviveT = 0; } // обрыв нити объявит хост
  else teamWipe(sc);
}
export function teamWipe(sc: World): void {
  if (sc.wiping) return;
  sc.wiping = true; sc.deaths++;
  for (const p of sc.players) if (!p.remote) p.downed = true;
  if (sc.sr && !sc.sr.done) sc.sr.deaths++; // speedrun.js: счётчик обрывов
  if (sc.sr?.duel) srDuelDefeat(sc); // дуэль: обрыв нити заканчивает раунд героя
  sc.sendEv({ k: 'wipe' });
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
  if (sc.bosses.some((b) => b.state !== 'dead')) { resetFight(sc); sc.bossBar(false); }
  sc.sendEv({ k: 'respawn', x: sc.respawn.x, y: sc.respawn.y });
  respawnLocal(sc);
}
export function respawnLocal(sc: World): void {
  sc.players.forEach((p) => {
    if (p.remote) return;
    resetPlayerActions(sc, p);
    Object.assign(p, { x: sc.respawn.x - 7 + p.i * 24, y: sc.respawn.y - 26, vx: 0, vy: 0, kbx: 0, hp: p.maxHp, downed: false, inv: 1, hurtT: 0, dashT: 0, atkT: 0, sit: false, reviveT: 0, healCh: 0, healT: 0, bombs: sc.L.crates ? 3 : 0 });
    p.safeX = p.x; p.safeY = p.y; kitClear(p);
  });
  sc.wiping = false; sc.emit('fade', { out: false, ms: 600 });
  sc.emit('camSnap');
}

// скамья: ↑ открывает меню (ingame), «Отдохнуть» — benchRest
export function benchRest(sc: World, p: Player, b: { x: number; y: number }, quiet?: boolean): void {
  p.sit = true; p.x = b.x - 7; p.hp = p.maxHp; sc.respawn = { x: b.x, y: b.y }; sc.snd('bench');
  for (const q of sc.players) if (q.downed && !q.remote) { q.downed = false; q.hp = 2; q.inv = 1.5; q.x = b.x - 7 + 22; q.y = b.y - 26; }
  sc.sendEv({ k: 'bench', x: b.x, y: b.y });
  if (!quiet) sc.toast(sc.camp ? 'Скамья: здесь вы очнётесь. Прогресс сохранён. ↓ — лавка' : 'Скамья: здесь вы очнётесь. Прогресс сохранён');
  if (sc.mode === 'story') {
    const bi = sc.benches.indexOf(b), area = areaOf(sc, b.x / T);
    campaignSave(sc, { bench: bi, name: campaignSaveName(sc, area.name) });
  }
}

// ---------- отбив и нитяной всполох (combat2.js) ----------
// отбив: удар, пришедший в окно отбива, не ранит, даёт нить, сбивает снаряды и стойкость босса
export function parrySuccess(sc: World, p: Player, _srcX: number | null, hk?: HitKind, source?: HitSource): void {
  statParry(sc, p);
  // идеальный отбив: нажатие пришлось на первые PERFECT_F кадров окна (parryF считает player.ts; у выставленного вручную окна его нет — тогда обычный)
  // и только для ударов с явным hk: у снарядов без hk (боссы v2.0, золотые записи) отбив прежний (PERFECT_LEGACY=1 включает идеальный и для них)
  const perfect = (hk !== undefined || PARRY2.PERFECT_LEGACY > 0) && typeof p['parryF'] === 'number' && p['parryF'] < PARRY2.PERFECT_F;
  p.inv = perfect ? Math.max(0.5, PARRY2.COUNTER_T) : 0.5; p.parryT = 0; p.parryCd = 0.15;
  if (!p.remote) sc.emit('buzz', { parry: true });
  if (!p.remote) { p.silk = Math.min(sc.silkMax, p.silk + (perfect ? PARRY2.PERFECT_SILK : 1)); sc.hitstop = perfect ? PARRY2.PERFECT_HITSTOP : 0.1; }
  const cx = p.x + 7, cy = p.y + 13;
  if (perfect) {
    p['counterT'] = PARRY2.COUNTER_T; p['perfFx'] = 0.45;
    sc.snd('parryPerfect'); sc.emit('flash', { ms: 130, r: 255, g: 232, b: 150 }); sc.emit('perfectParry', { x: cx, y: p.y - 8, i: p.i });
    sc.parts(30, cx + p.face * 10, cy, 0xffd96a);
  } else { sc.snd('parry'); sc.emit('flash', { ms: 90, r: 255, g: 255, b: 255 }); }
  sc.parts(18, cx + p.face * 10, cy, 0xffffff);
  for (const pr of sc.projs) if (canClearProj(pr, 'parry') && Math.hypot(pr.x - cx, pr.y - cy) < 110) { pr.dead = true; sc.burst(5, pr.x, pr.y, 0xffffff); }
  for (const e of sc.enemies) if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < 100) { e.kbT = 0.2; e.kbx = Math.sign(e.x - cx) * 300; e.kby = -120; e.flash = 0.1; if (e['state'] === 'charge') { e['state'] = 'stun'; e['st'] = 0.8; } }
  const attacker = source?.boss ?? (source?.projectile?.o !== undefined ? sc.bosses[source.projectile.o] : undefined);
  if (sc.auth()) { if (!source || attacker) parryPoise(sc, cx, cy, perfect, attacker); } else sc.sendEv({ k: 'parrypoise', x: Math.round(cx), y: Math.round(cy), pf: perfect ? 1 : 0 });
  if (sc.auth()) e2Parry(sc, cx, cy); else sc.sendEv({ k: 'e2parry', x: Math.round(cx), y: Math.round(cy) }); // enemies2.js: отбив ломает броню панциря
}
/** стойкость босса за отбив: обычный +3 (как в v2.0; у боссов с posture:true — POSTURE_NORMAL_POISE), идеальный ×PERFECT_POISE_MUL. Шкала та же, что у ударов (poiseAdd) */
export function parryPoise(sc: World, cx: number, cy: number, perfect = false, attacker?: Boss): void {
  for (const b of attacker ? [attacker] : sc.bosses) if (attacker || Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < 190) poiseAdd(sc, b, perfect ? 3 * PARRY2.PERFECT_POISE_MUL : b.posture ? PARRY2.POSTURE_NORMAL_POISE : 3);
}
// нитяной всполох (↑ + кнопка нити): тратит BURST нити, бьёт всё вокруг и сбивает снаряды
export function silkBurst(sc: World, p: Player): void {
  p.silk -= P.BURST; p.inv = Math.max(p.inv, 0.3); p.healT = 0.3;
  const cx = p.x + 7, cy = p.y + 13;
  sc.snd('slam'); sc.shake(180, 0.008); sc.hitstop = 0.06;
  sc.parts(36, cx, cy, p.pal.accent);
  p['burstFx'] = 0.35;
  if (!sc.auth()) { sc.sendEv({ k: 'burstSkill', x: Math.round(cx), y: Math.round(cy) }); return; }
  silkBurstHit(sc, p, cx, cy);
}
export function silkBurstHit(sc: World, p: Player, cx: number, cy: number): void {
  const burst = sc._e2burst, noSilkGain = p['noSilkGain'];
  sc._e2burst = true; // enemies2.js: всполох пробивает броню
  try {
    const R = 120; p['noSilkGain'] = true; // всполох нить не копит: иначе он оплачивал бы сам себя
    for (const pr of sc.projs) if (canClearProj(pr, 'burst') && Math.hypot(pr.x - cx, pr.y - cy) < R) pr.dead = true;
    for (const e of sc.enemies) if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) { damageEnemy(sc, e, p); if (!e.dead) damageEnemy(sc, e, p); }
    for (const [b, key] of bossRefs(sc)) {
      if (!b || ['dead', 'gone', 'sleep', 'intro'].includes(b.state)) continue;
      if (Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < R + b.w / 2) damageBoss(sc, key, p, { amount: 3, source: 'area', weak: 'geometry', shape: { type: 'circle', x: cx, y: cy, radius: R } });
    }
  } finally { sc._e2burst = burst; p['noSilkGain'] = noSilkGain; }
}

export { inset, clamp, wdef };
export type { Boss };
