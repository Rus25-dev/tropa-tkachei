// Приёмы героя (набор игрока): общий шаг. Сами приёмы — src/content/abilities/<id>.ts (теневой рывок, вспышка, кристальный рывок,
// контрудар, движение нырка); здесь — порядок их вызова и общие для всех вещи: окно неуязвимости kgF, удержание рывка dhold.
// Встраивание в шаг героя: kitStep оборачивает базу (player.ts: charmsStep → hookStep → kitStep → weaponsStep → base), kitDashStart вызывается
// при старте рывка, kitGhost — из hurtPlayerBase. Всё считается в кадрах: без Date.now, Math.random и таймеров.
import { P } from '../balance';
import type { HitKind, Player } from '../types';
import type { World } from '../world';
import { abilReg, moveReg } from '../plugin/regs';
import { fr, type Inner, type KitIcon } from '../ability-kit';

export { fr };
export type { KitIcon };

/** неуязвим ли герой к такому удару: окно кадров kgF пропускает всё, кроме 'unblockable' (шипы проверяет вызывающий) */
export const kitGhost = (p: Player, hk?: HitKind): boolean => (p['kgF'] as number) > 0 && hk !== 'unblockable';
/** скорость рывка: приём может заменить обычную (теневой рывок быстрее) */
export function dashSpeed(p: Player): number {
  for (const m of moveReg.list()) { const v = m.dashSpeed?.(p); if (v !== undefined) return v; }
  return P.DASH;
}
/** занят ли герой приёмом, который сам ведёт движение (хват за уступ и планер в это время отключены) */
export const kitBusy = (p: Player): boolean => moveReg.list().some((m) => !!m.busy?.(p));
/** множитель скорости бега (заряд кристального рывка и т. п.) */
export const kitSlow = (p: Player): number => moveReg.list().reduce((k, m) => (m.runMul ? k * m.runMul(p) : k), 1);

/** старт рывка (из базы, сразу после обычной установки dashT/dashCd): приём может заменить обычный рывок */
export function kitDashStart(sc: World, p: Player): void { for (const m of moveReg.list()) m.dashStart?.(sc, p); }

/** сбросить все приёмы (возрождение, телепорт) */
export function kitClear(p: Player): void {
  p['kgF'] = 0; p['dhold'] = 0;
  for (const m of moveReg.list()) m.clear?.(p);
}

// ----- шаг -----
/** обёртка шага героя. inner — следующий слой (оружие → база). Для героя без открытых приёмов и без активных состояний это один вызов inner. */
export function kitStep(sc: World, p: Player, dt: number, inner: Inner): void {
  if (p.remote) return inner(sc, p, dt);
  const ms = moveReg.list();
  for (const m of ms) m.pre?.(sc, p, dt);
  const kgF = (p['kgF'] as number) | 0;
  if (kgF > 0) p['kgF'] = kgF - 1;
  const inp = p.inp || {};
  const holding = !!inp.dash;
  p['dhold'] = holding ? ((p['dhold'] as number) | 0) + 1 : 0;
  for (const m of ms) m.tick?.(sc, p, dt, { holding });
  const idle = !ms.some((m) => !!(m.busy?.(p) || m.active?.(p)));
  if (idle && !ms.some((m) => !!m.armed?.(sc, p))) return inner(sc, p, dt);
  // урон, лечение, кокон, скамья: все состояния сорваны
  if (p.hurtT > 0 || p.downed || (p['healCh'] as number) > 0 || p.sit) {
    if (!idle) { for (const m of ms) m.cancel?.(sc, p, { holding }); p['kgF'] = 0; }
    return inner(sc, p, dt);
  }
  for (const m of ms) if (m.drive?.(sc, p, dt, inner, { holding, inp })) return;
  inner(sc, p, dt);
}

// ----- состояние для HUD и сети -----
export function kitHud(sc: World, p: Player): KitIcon[] {
  const out: KitIcon[] = [];
  for (const a of abilReg.list()) { const h = a.hud?.(sc, p); if (h) out.push({ id: a.id, ...h }); }
  return out;
}
/** код состояния для сети и отрисовки (коды задают приёмы): 1 теневой рывок, 2 вспышка, 3 заряд, 4 заряд готов, 5 суперрывок, 6 нырок; 0 — нет */
export function kitCode(p: Player): number {
  for (const m of [...moveReg.list()].sort((a, b) => (a.codePri ?? 99) - (b.codePri ?? 99))) { const c = m.code?.(p) ?? 0; if (c) return c; }
  return 0;
}
/** принять состояние напарника (только для отрисовки и неуязвимости) */
export function kitFromNet(p: Player, ks: number, kc: number, kg: number): void {
  p['kgF'] = kg | 0;
  for (const m of moveReg.list()) m.fromNet?.(p, ks, kc);
}
/** доля заряда для отрисовки (0, если ничего не заряжается) */
export const kitChargeFrac = (p: Player): number => moveReg.list().reduce((k, m) => Math.max(k, m.chargeFrac?.(p) ?? 0), 0);
/** вид следа напарника: во время обычного рывка (dash) или приёма; 0 — плащ */
export function kitTrail(p: Player, dash: boolean): number {
  for (const m of moveReg.list()) { const s = m.trail?.(p, dash) ?? 0; if (s) return s; }
  return 0;
}
