// Слои урона. В v1.8 функции урона обёрнуты друг в друга по порядку загрузки модулей (база → оружие → оберегов → статистика);
// здесь порядок вызовов записан явно. Внешний слой — статистика забега, внутренний — исходная функция (RAW).
import { PARRY2 } from './balance';
import type { BossRef } from './balance';
import type { Enemy, HitKind, Player } from './types';
import type { World } from './world';
import { damageBossWeapons, damageEnemyWeapons, gainSilkWeapons } from './weapons';
import { gainSilkBase, hurtPlayerBase } from './combat';
import { charmsOn } from './loadout';
import { bossKey } from './status';
import { killEnemy } from './combat';
import { bossOf, poiseWrapDamage } from './bosses2';
import type { BossHit, HitResult, HitSource } from './hit';
import { rawData } from './boss/exec';
import { statBegin, statEndBoss, statEndEnemy, statHurt } from './racestats';

// ---------- исходные функции урона по боссам (RAW) ----------
export function rawBossDamage(sc: World, key: BossRef, p: Player, hit?: BossHit): HitResult { return rawData(sc, key, p, hit); }

// ---------- нить ----------
/** gainSilk: оберег «Быстрая нить» (внешний) → оружие (по урону) → база */
export function gainSilk(sc: World, p: Player, boss?: boolean): void {
  gainSilkWeapons(sc, p, boss);
  if (p['noSilkGain']) return;
  for (const c of charmsOn(p)) c.silkGain?.(sc, p, boss);
}
export { gainSilkBase };

// ---------- контратака (отбив 2.0) ----------
/** Первый удар вперёд после идеального отбива (player.ts ставит counterHit на замахе): по каждой цели бьёт сильнее один раз. Нить-всполох и яд («noSilkGain») контратакой не бывают. */
function counterOn(p: Player, t: object): boolean {
  if (!p['counterHit'] || p['noSilkGain']) return false;
  const seen = (p['counterSeen'] ??= new Set<object>()) as Set<object>;
  if (seen.has(t)) return false;
  seen.add(t); return true;
}

// ---------- обычные враги: статистика → обереги → оружие → база ----------
export function damageEnemy(sc: World, e: Enemy, p: Player): void {
  const S = statBegin(sc);
  const h0 = e.hp;
  damageEnemyCharms(sc, e, p);
  if (S) statEndEnemy(S, e, h0);
}
function damageEnemyCharms(sc: World, e: Enemy, p: Player): void {
  const hp0 = e.hp, stunned = e['state'] === 'stun';
  const ctr = counterOn(p, e);
  damageEnemyWeapons(sc, e, p);
  if (ctr && e.hp < hp0 && !e.dead) {
    e.hp -= (hp0 - e.hp) * (PARRY2.COUNTER_DMG - 1); sc.burst(10, e.x + e.w / 2, e.y + e.h / 2, 0xffd96a);
    if (e.hp <= 0) killEnemy(sc, e);
  }
  if (e.hp < hp0 && !e.dead && sc.auth()) for (const c of charmsOn(p)) c.hitEnemy?.(sc, e, p, { stunned });
}

// ---------- боссы: статистика → обереги → оружие → стойкость → RAW ----------
export function damageBoss(sc: World, key: BossRef, p: Player, hit: BossHit = {}): void {
  const S = statBegin(sc);
  const cur = bossOf(sc, key), h0 = cur ? cur.hp : 0;
  damageBossCharms(sc, key, p, hit);
  if (S) statEndBoss(S, cur, h0);
}
function damageBossCharms(sc: World, key: BossRef, p: Player, hit: BossHit): void {
  const b = bossOf(sc, key), hp0 = b && b.hp, stag = !!b && b.stagger > 0;
  const ctr = !!b && counterOn(p, b);
  if (ctr) sc._cm = PARRY2.COUNTER_POISE_MUL; // контратака: стойкость за удар ×2 (poiseMul)
  try { damageBossWeapons(sc, b, p, (weapon) => poiseWrapDamage(sc, key, p, { ...hit, amount: (hit.amount ?? 1) * (weapon?.amount ?? 1) * (ctr ? PARRY2.COUNTER_DMG : 1) })); } finally { sc._cm = 1; }
  if (ctr && b && b.hp < hp0!) {
    sc.burst(12, b.x + b.w / 2, b.y + b.h / 2, 0xffd96a);
  }
  if (b && b.hp < hp0! && b.hp > 0 && sc.auth()) for (const c of charmsOn(p)) c.hitBoss?.(sc, key, b, p, { stag });
}

// ---------- урон героям: статистика → обереги (колючий плащ) → тренировка → база ----------
/** hk — тип удара (язык атак боссов 2.5): без него 'parry', как раньше */
export function hurtPlayer(sc: World, p: Player, dmg: number, srcX: number | null, spike?: boolean, hk?: HitKind, source?: HitSource): void {
  const S = !p.remote ? statBegin(sc) : null;
  const h0 = p.hp, pd0 = (p['pdodge'] as number) || 0;
  hurtPlayerCharms(sc, p, dmg, srcX, spike, hk, source);
  if (S) statHurt(S, p, h0, pd0);
}
function hurtPlayerCharms(sc: World, p: Player, dmg: number, srcX: number | null, spike?: boolean, hk?: HitKind, source?: HitSource): void {
  const hp0 = p.hp;
  hurtPlayerTraining(sc, p, dmg, srcX, spike, hk, source);
  for (const c of charmsOn(p)) c.hurt?.(sc, p, { srcX, spike, hp0 });
}
function hurtPlayerTraining(sc: World, p: Player, dmg: number, srcX: number | null, spike?: boolean, hk?: HitKind, source?: HitSource): void {
  if (!sc.train) return hurtPlayerBase(sc, p, dmg, srcX, spike, hk, source);
  const before = p.hp; p.hp = before + 99;
  hurtPlayerBase(sc, p, dmg, srcX, spike, hk, source);
  const taken = before + 99 - p.hp; p.hp = before;
  if (taken > 0) { sc.train.hits++; sc.emit('trainHit', { x: p.x + 7, y: p.y - 6, n: taken }); }
}
export { bossKey };
