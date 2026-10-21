// Слои урона. В v1.8 функции урона обёрнуты друг в друга по порядку загрузки модулей (база → оружие → оберегов → статистика);
// здесь порядок вызовов записан явно. Внешний слой — статистика забега, внутренний — исходная функция (RAW).
import { BAL } from './balance';
import type { BossKey } from './balance';
import type { Boss, Enemy, Player } from './types';
import type { World } from './world';
import { damageBossWeapons, damageEnemyWeapons, gainSilkWeapons } from './weapons';
import { gainSilkBase, hurtPlayerBase } from './combat';
import { hasCharm } from './loadout';
import { applyStatus, bossDamage, bossKey, bossLive } from './status';
import { killEnemy } from './combat';
import { rawKorne } from './korne';
import { rawVladik } from './vladik';
import { rawTima } from './tima';
import { poiseWrapDamage } from './bosses2';
import { statBegin, statEndBoss, statEndEnemy, statHurt } from './racestats';

// ---------- исходные функции урона по боссам (RAW) ----------
export function rawBossDamage(sc: World, key: BossKey, p: Player): void {
  if (key === 'boss') rawKorne(sc, p); else if (key === 'vladik') rawVladik(sc, p); else rawTima(sc, p);
}
const bossOf = (sc: World, key: BossKey): Boss | null => (key === 'boss' ? sc.boss : sc[key]);

// ---------- нить ----------
/** gainSilk: оберег «Быстрая нить» (внешний) → оружие (по урону) → база */
export function gainSilk(sc: World, p: Player, boss?: boolean): void {
  gainSilkWeapons(sc, p, boss);
  if (p['noSilkGain'] || !hasCharm(p, 'swift')) return;
  const gained = !boss || ((p['bossHits'] as number) | 0) % BAL.silkEvery === 0;
  if (!gained) return;
  p['_sf'] = ((p['_sf'] as number) || 0) + 0.5;
  if ((p['_sf'] as number) >= 1) { (p['_sf'] as number) -= 1; p.silk = Math.min(sc.silkMax, p.silk + 1); }
}
export { gainSilkBase };

// ---------- обычные враги: статистика → обереги → оружие → база ----------
export function damageEnemy(sc: World, e: Enemy, p: Player): void {
  const S = statBegin(sc);
  const h0 = e.hp;
  damageEnemyCharms(sc, e, p);
  if (S) statEndEnemy(S, e, h0);
}
function damageEnemyCharms(sc: World, e: Enemy, p: Player): void {
  const hp0 = e.hp, stunned = e['state'] === 'stun';
  damageEnemyWeapons(sc, e, p);
  if (e.hp < hp0 && !e.dead) {
    if (!p['noSilkGain'] && p.atkT > 0 && !!p.atkHits) {
      if (hasCharm(p, 'sting')) applyStatus(sc, e, 'poison', null, p);
      if (hasCharm(p, 'ember') && p['heavy'] && p.atkDir === 'f') applyStatus(sc, e, 'burn', null, p);
    }
    if (stunned && hasCharm(p, 'hunter')) {
      p['_hf'] = ((p['_hf'] as number) || 0) + 0.15;
      if ((p['_hf'] as number) >= 1) { (p['_hf'] as number) -= 1; e.hp -= 1; if (e.hp <= 0) killEnemy(sc, e); }
    }
  }
}

// ---------- боссы: статистика → обереги → оружие → стойкость → RAW ----------
export function damageBoss(sc: World, key: BossKey, p: Player): void {
  const S = statBegin(sc);
  const cur = sc.testBoss() ?? sc.boss, h0 = cur ? cur.hp : 0;
  damageBossCharms(sc, key, p);
  if (S) statEndBoss(S, cur, h0);
}
function damageBossCharms(sc: World, key: BossKey, p: Player): void {
  const b = bossOf(sc, key), hp0 = b && b.hp, stag = !!b && b.stagger > 0;
  damageBossWeapons(sc, b, p, () => poiseWrapDamage(sc, key, p));
  if (b && b.hp < hp0! && b.hp > 0) {
    if (!p['noSilkGain'] && p.atkT > 0 && !!p.atkHits) {
      if (hasCharm(p, 'sting')) applyStatus(sc, b, 'poison', null, p);
      if (hasCharm(p, 'ember') && p['heavy'] && p.atkDir === 'f') applyStatus(sc, b, 'burn', null, p);
    }
    if (stag && hasCharm(p, 'hunter') && !p['noSilkGain']) {
      p['_hf'] = ((p['_hf'] as number) || 0) + 0.15;
      if ((p['_hf'] as number) >= 1) { (p['_hf'] as number) -= 1; bossDamage(sc, key, p, 1); }
    }
  }
}

// ---------- урон героям: статистика → обереги (колючий плащ) → тренировка → база ----------
export function hurtPlayer(sc: World, p: Player, dmg: number, srcX: number | null, spike?: boolean): void {
  const S = !p.remote ? statBegin(sc) : null;
  const h0 = p.hp, pd0 = (p['pdodge'] as number) || 0;
  hurtPlayerCharms(sc, p, dmg, srcX, spike);
  if (S) statHurt(S, p, h0, pd0);
}
function hurtPlayerCharms(sc: World, p: Player, dmg: number, srcX: number | null, spike?: boolean): void {
  const hp0 = p.hp;
  hurtPlayerTraining(sc, p, dmg, srcX, spike);
  if (!spike && srcX != null && p.hp < hp0 && hasCharm(p, 'thorns')) {
    const px = p.x + 7, py = p.y + 13, near = (o: { x: number; y: number; w: number; h: number }): boolean => Math.abs(o.x + o.w / 2 - srcX) < 1.5 && Math.abs(o.y + o.h / 2 - py) < 60 + o.h / 2 && Math.abs(o.x + o.w / 2 - px) < 60 + o.w / 2;
    const e = sc.enemies.find((o) => !o.dead && near(o));
    if (e) {
      e.hp -= 1; e.flash = 0.1; sc.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xd9a35a); sc.sfx('clink');
      e.kbT = 0.14; e.kbx = Math.sign(e.x + e.w / 2 - px) * 200; e.kby = -80;
      if (e.hp <= 0) killEnemy(sc, e);
    } else {
      const key = (['boss', 'vladik', 'tima'] as BossKey[]).find((k) => { const b = bossOf(sc, k); return b && bossLive(b) && near(b); });
      if (key) { bossDamage(sc, key, p, 1); sc.burst(8, srcX, py, 0xd9a35a); }
    }
  }
}
function hurtPlayerTraining(sc: World, p: Player, dmg: number, srcX: number | null, spike?: boolean): void {
  if (!sc.train) return hurtPlayerBase(sc, p, dmg, srcX, spike);
  const before = p.hp; p.hp = before + 99;
  hurtPlayerBase(sc, p, dmg, srcX, spike);
  const taken = before + 99 - p.hp; p.hp = before;
  if (taken > 0) { sc.train.hits++; sc.emit('trainHit', { x: p.x + 7, y: p.y - 6, n: taken }); }
}
export { bossKey };
