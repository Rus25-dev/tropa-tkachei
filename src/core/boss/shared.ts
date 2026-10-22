// Общие кирпичики исполнителя боссов, существ и сущностей арены: коробка удара, веер снарядов, ближайший герой. Чистый TS, без состояния.
import type { Boss, Player, Proj, Rect } from '../types';
import type { World } from '../world';
import type { DState } from './exec';
import type { BoxDef } from './schema';

/** Состояние исполнителя босса на данных лежит в b['d'] */
export const dstate = (b: Boss): DState => b['d'] as DState;

export interface Actor { x: number; y: number; w: number; h: number }
export const centerX = (b: Actor): number => b.x + b.w / 2;

/** Прямоугольник удара в мире. face — куда смотрит тело, lock — точка героя, зафиксированная к концу замаха ('target'). */
export function boxRect(b: Actor, face: number, h: BoxDef, lock: { x: number; y: number }): Rect {
  if (h.at === 'target') return { x: lock.x + h.x, y: lock.y + h.y, w: h.w, h: h.h };
  const cx = centerX(b);
  return { x: face > 0 ? cx + h.x : cx - h.x - h.w, y: b.y + h.y, w: h.w, h: h.h };
}

/** место без тайла-стены: сдвигаем вниз от потолка (снаряд, появившийся в камне, умер бы сразу) */
export function freeSpot(sc: World, r: Rect): Rect {
  const q = { ...r };
  for (let k = 0; k < 24 && sc.solidRect(q); k++) q.y += 16;
  return q;
}

export interface ShotSpec {
  proj: { kind: string; w: number; h: number; life: number };
  kind: 'parry' | 'dodge' | 'unblockable';
  count: number; spread: number; dmg?: number;
}
/** Веер снарядов из точки base со скоростью (vx, vy); owner — индекс босса-хозяина (Proj.o), src 'd' — снаряд босса на данных (рисуется с контуром цвета удара). */
export function fireShots(sc: World, base: { x: number; y: number }, vx: number, vy: number, s: ShotSpec, owner: number, attackId?: number): void {
  const a0 = Math.atan2(vy, vx), sp = Math.hypot(vx, vy);
  for (let k = 0; k < s.count; k++) {
    const ang = a0 + (k - (s.count - 1) / 2) * s.spread * (Math.PI / 180);
    const r = freeSpot(sc, { x: base.x - s.proj.w / 2, y: base.y - s.proj.h / 2, w: s.proj.w, h: s.proj.h });
    const pr: Proj = { kind: s.proj.kind, x: r.x, y: r.y, w: r.w, h: r.h, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: s.proj.life / 60, hk: s.kind, src: 'd', o: owner };
    if (s.dmg !== undefined) pr.dmg = s.dmg;
    if (attackId !== undefined) pr.attackId = attackId;
    sc.projs.push(pr);
  }
}

/** Направление (скорость длины sp) от точки base на героя tp; нет героя — вперёд по fallback */
export function aimAt(base: { x: number; y: number }, tp: Player | null, sp: number, fallbackDir: number): { vx: number; vy: number } {
  if (!tp) return { vx: fallbackDir * sp, vy: 0 };
  const ax = tp.x + 7 - base.x, ay = tp.y + 13 - base.y, l = Math.hypot(ax, ay) || 1;
  return { vx: (ax / l) * sp, vy: (ay / l) * sp };
}
