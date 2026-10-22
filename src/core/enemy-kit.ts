// Набор для описаний врагов (src/content/enemies/<id>.ts): описание вида, общие помощники шага.
// Лист без зависимостей от мира и боя: его можно импортировать из файлов содержимого без циклов модулей.
import { P } from './balance';
import type { Enemy, Player } from './types';
import type { World } from './world';

/** точка врага из уровня (LDtk): тип и клетка */
export interface EnemySpot { type: string; x: number; y: number }
/** общая часть нового врага (до полей вида): t уже взят из потока ГСЧ врагов */
export interface EnemyBase { type: string; vx: number; vy: number; face: number; flash: number; kbT: number; kbx: number; kby: number; dead: boolean; t: number }

export interface EnemyDef {
  /** вид (e.type) */
  id: string;
  /** место в списках; у существующих не менять */
  order?: number;
  /** имя точки в уровне (LDtk), если отличается от вида (стая 'bats' даёт трёх 'bat') */
  levelType?: string;
  /** враг нового образца («враги 2»): блок брони, свой отброс, состояния уходят в снимок индексом */
  e2?: boolean;
  /** состояния по порядку (индекс уходит гостю в снимке) — для e2 */
  states?: string[];
  /** летает: без гравитации при заморозке и отбросе */
  flies?: boolean;
  /** создать врагов из точки уровня; fx — центр клетки по x, fy — пол клетки. Порядок вызовов sc.rEnemy() — часть детерминизма */
  spawn(sc: World, d: EnemySpot, base: EnemyBase, at: { fx: number; fy: number }): Enemy[];
  /** шаг (после общего: вспышка, время, у старых врагов — отброс) */
  step(sc: World, e: Enemy, dt: number): void;
  /** удар не засчитан (броня, под землёй); guest — проверка у гостя без побочных эффектов хоста */
  blocked?(sc: World, e: Enemy, p: Player, guest?: boolean): boolean;
  /** отбив героя рядом (до 110 px) ломает броню */
  parryCrack?(sc: World, e: Enemy): void;
  /** сила отброса от удара оружием и от инструмента (по умолчанию 220 и 280) */
  meleeKb?: number; toolKb?: number;
  /** реакция на попадание (оружие и инструменты): например, разбег прерывается оглушением */
  onHit?(e: Enemy): void;
  /** капкан его не ловит */
  trapImmune?: boolean;
  /** тяжёлый: крюк не подтягивает и не оглушает */
  heavy?: boolean;
  /** яд и огонь сейчас не действуют (под землёй) */
  dotImmune?(e: Enemy): boolean;
}
export function defineEnemy(d: EnemyDef): EnemyDef { return d; }

/** «враг 2»: блок брони, перезарядка (тянет ещё одно число из ГСЧ врагов) */
export function mk2(sc: World, base: EnemyBase, o: Record<string, unknown>): Enemy {
  return ({ ...base, e2: true, st: 0, cd: 0.6 + sc.rEnemy(), ...o }) as unknown as Enemy;
}
/** отброс после удара; fly — летающие без гравитации. true — шаг занят отбросом */
export function e2Knock(sc: World, e: Enemy, dt: number, fly: boolean): boolean {
  if (e.kbT <= 0) return false;
  e.kbT -= dt; e.vx = e.kbx * (e['heavyBody'] ? 0.45 : 1);
  e.vy = fly ? e.kby : Math.min(e.vy + P.G * dt, P.MAXFALL);
  sc.moveBody(e, dt); return true;
}
/** впереди обрыв (враг на земле) */
export function ledgeAhead(sc: World, e: Enemy): boolean { const fx = e.face > 0 ? e.x + e.w + 2 : e.x - 2; return !!e.onGround && !sc.groundBelowSolid(fx, e.y + e.h + 4); }
