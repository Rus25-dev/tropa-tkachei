// Враги: общий шаг и появление. Сами враги — src/content/enemies/<вид>.ts (ползун, комар, жук; «враги 2»: плевальщик, панцирь,
// стая мышей, засадник). Порядок вызовов ГСЧ при появлении (sc.rEnemy) и шаг каждого вида — как в legacy/src/game.js и enemies2.js.
import { P, T } from './balance';
import type { Enemy, Player } from './types';
import type { World } from './world';
import { stepFrozen } from './tools';
import { stepMinion } from './boss/minions';
import { enemyReg } from './plugin/regs';
import type { EnemyDef } from './enemy-kit';
import { slowDt } from './status';

/** описание вида врага (или undefined: существо босса, неизвестный вид) */
export const enemyDef = (e: { type: string }): EnemyDef | undefined => enemyReg.get(e.type);
/** состояния «врага 2» по порядку — по индексу они уходят в снимок гостю */
export const e2States = (type: string): string[] => enemyReg.get(type)?.states ?? [];
/** вид по имени точки уровня (стая 'bats' → 'bat') */
function byLevelType(t: string): EnemyDef | undefined { return enemyReg.list().find((d) => (d.levelType ?? d.id) === t); }

// ----- появление -----
export function spawnEnemies(sc: World): void {
  sc.enemies = sc.L.enemies.flatMap((d): Enemy[] => {
    const base = { type: d.type, vx: 0, vy: 0, face: -1, flash: 0, kbT: 0, kbx: 0, kby: 0, dead: false, t: sc.rEnemy() * 6 };
    const fx = d.x * T + 16, fy = (d.y + 1) * T;
    const def = byLevelType(d.type) ?? enemyReg.get('beetle')!; // неизвестная точка уровня — жук, как в v1.8
    return def.spawn(sc, d, base, { fx, fy });
  });
}

// ----- броня и неуязвимость: true — удар не засчитан -----
export function e2Blocked(sc: World, e: Enemy, p: Player, guest?: boolean): boolean {
  if (!e['e2']) return false;
  return !!enemyDef(e)?.blocked?.(sc, e, p, guest);
}
/** отбив ломает броню рядом стоящим бронированным врагам */
export function e2Parry(sc: World, cx: number, cy: number): void {
  for (const e of sc.enemies) {
    const d = enemyDef(e);
    if (e.dead || !d?.parryCrack || Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) > 110) continue;
    d.parryCrack(sc, e);
  }
}
/** летает ли враг (заморозка и отброс без гравитации) */
export const enemyFlies = (e: Enemy): boolean => !!enemyDef(e)?.flies;
/** попадание оружием или инструментом: отброс по виду и реакция вида */
export function enemyHitReact(e: Enemy, kdir: number, tool: boolean): void {
  const d = enemyDef(e);
  e.kbx = kdir * (tool ? (d?.toolKb ?? 280) : (d?.meleeKb ?? 220));
  d?.onHit?.(e);
}

// ----- шаг: замедление (status.js) → заморозка (tools.js) → база -----
export function stepEnemy(sc: World, e: Enemy, dt0: number): void {
  const dt = slowDt(sc, e as never, dt0, false);
  if (stepFrozen(sc, e, dt)) return;
  if (e['m']) { stepMinion(sc, e, dt); return; } // существо босса на данных (core/boss/minions.ts)
  stepEnemyBase(sc, e, dt);
}
function stepEnemyBase(sc: World, e: Enemy, dt: number): void {
  e.flash -= dt; e.t += dt;
  const d = enemyDef(e);
  if (e['e2']) { if (e['blockT'] > 0) e['blockT'] -= dt; d?.step(sc, e, dt); return; }
  if (e.kbT > 0) {
    e.kbT -= dt; e.vx = e.kbx;
    if (d?.flies) e.vy = e.kby;
    else e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    sc.moveBody(e, dt);
    return;
  }
  d?.step(sc, e, dt);
}
