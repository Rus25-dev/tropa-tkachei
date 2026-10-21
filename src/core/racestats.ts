// Статистика забега: урон, DPS, точность, отбивы, увороты, казни, комбо, фазы, покупки (legacy/src/race-stats.js).
// Считается из самой симуляции и ничего в игре не меняет, поэтому при воспроизведении журнала получается то же самое.
// Живёт в sr.stats; в гонке уходит организатору в телеметрии и в итоговом результате.
import type { Boss, Enemy, Player } from './types';
import type { World } from './world';

export interface StatsData {
  dmg: number; bossDmg: number; taken: number; heals: number; swings: number; hits: number; parries: number; dodges: number; stuns: number; execs: number;
  combo: number; kills: number; fight: number; ph: Record<string, number>; buys: { id: string; ch: number; igt: number; price: number }[];
  _: { atk?: boolean; hp?: number; st?: boolean };
}
export const freshStats = (): StatsData => ({ dmg: 0, bossDmg: 0, taken: 0, heals: 0, swings: 0, hits: 0, parries: 0, dodges: 0, stuns: 0, execs: 0, combo: 0, kills: 0, fight: 0, ph: {}, buys: [], _: {} });

/** RaceStats.of(gs): статистика текущего забега или null вне забега */
export function statBegin(sc: World): StatsData | null {
  const r = sc.sr; if (!r) return null;
  return r.stats || (r.stats = freshStats());
}
export function statEndEnemy(S: StatsData, e: Enemy, h0: number): void {
  const d = Math.max(0, h0 - e.hp);
  if (d > 0) { S.hits++; S.dmg += d; }
  if (e.dead && h0 > 0) S.kills++;
}
export function statEndBoss(S: StatsData, b: Boss | null, h0: number): void {
  const d = Math.max(0, h0 - (b ? b.hp : 0));
  S.hits++; S.dmg += d; S.bossDmg += d;
}
export function statHurt(S: StatsData, p: Player, h0: number, pd0: number): void {
  if (p.hp < h0) S.taken += h0 - p.hp;
  else if (((p['pdodge'] as number) || 0) >= 0.39 && pd0 < 0.39) S.dodges++; // идеальный уворот: рывок сквозь удар
}
export function statParry(sc: World, p: Player): void { const S = sc.sr && !p.remote ? statBegin(sc) : null; if (S) S.parries++; }
export function statBossHit(sc: World, b: Boss | null, h0: number): void { const S = statBegin(sc); if (S) statEndBoss(S, b, h0); }

/** тик: после основной логики (Speedrun.onTick вызывает RaceStats.tick) */
export function statTick(sc: World): void {
  const S = statBegin(sc); if (!S) return;
  const p = sc.players[0], q = S._; if (!p) return;
  const sw = p.atkT > 0; if (sw && !q.atk) S.swings++; q.atk = sw;
  if (((p['combo'] as number) | 0) > S.combo) S.combo = (p['combo'] as number) | 0;
  if (q.hp != null && p.hp > q.hp && p.healT > 0 && !sc.wiping) S.heals++;
  q.hp = p.hp;
  const b = sc.testBoss() ?? sc.boss;
  if (b && b.state && !sc.bossDead && !['sleep', 'dead', 'gone', 'intro'].includes(b.state) && !(b.hp <= 0)) {
    S.fight++;
    const key = (sc.camp ? sc.camp.ch : 1) + ':' + (b.phase || 1); S.ph[key] = (S.ph[key] | 0) + 1;
    const st = b.stagger > 0; if (st && !q.st) S.stuns++; q.st = st;
  } else q.st = false;
}

/** компактный итог для сети и архива (без служебных полей) */
export function packStats(S: StatsData | null | undefined, igtTicks?: number): Record<string, unknown> | null {
  if (!S) return null;
  const fightSec = S.fight / 60, acc = S.swings ? Math.min(1, S.hits / S.swings) : 0;
  const ph: Record<string, number> = {}; for (const k in S.ph) ph[k] = Math.round(S.ph[k]! / 6) / 10;
  const r1 = (x: number): number => Math.round(x * 10) / 10;
  return { dmg: r1(S.dmg), bossDmg: r1(S.bossDmg), dps: fightSec > 0.5 ? r1(S.bossDmg / fightSec) : 0, taken: S.taken, deaths: undefined, heals: S.heals, swings: S.swings, hits: S.hits, acc: Math.round(acc * 100) / 100,
    parries: S.parries, dodges: S.dodges, stuns: S.stuns, execs: S.execs, combo: S.combo, kills: S.kills, fight: r1(fightSec), ph, buys: S.buys.slice(0, 20), igt: igtTicks != null ? Math.round(igtTicks) : undefined };
}
