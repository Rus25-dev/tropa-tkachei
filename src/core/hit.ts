// Контракт попадания для подключаемого содержимого. Геометрия не зависит от мира или вида.
import type { Boss, Rect } from './types';

export type HitShape = { type: 'rect'; rect: Rect } | { type: 'circle'; x: number; y: number; radius: number };
export interface BossHit {
  amount?: number;
  shape?: HitShape;
  /** geometry — нужна форма попадания; open — уже наложенный эффект; bypass — казнь. */
  weak?: 'geometry' | 'open' | 'bypass';
  source?: 'melee' | 'projectile' | 'area' | 'dot' | 'execute' | 'counter';
}
export interface HitResult { outcome: 'immune' | 'armor' | 'damage'; damage: number }
export interface HitSource { boss?: Boss; projectile?: { o?: number }; }

export function shapeHits(shape: HitShape, r: Rect): boolean {
  if (shape.type === 'rect') {
    const a = shape.rect;
    return a.x < r.x + r.w && a.x + a.w > r.x && a.y < r.y + r.h && a.y + a.h > r.y;
  }
  const x = Math.max(r.x, Math.min(r.x + r.w, shape.x)), y = Math.max(r.y, Math.min(r.y + r.h, shape.y));
  return (shape.x - x) ** 2 + (shape.y - y) ** 2 < shape.radius ** 2;
}

/** Время первого пересечения движущегося прямоугольника с неподвижным (0…1). */
export function sweepTime(from: Rect, to: Rect, target: Rect): number | null {
  if (shapeHits({ type: 'rect', rect: from }, target)) return 0;
  const dx = to.x - from.x, dy = to.y - from.y;
  let enter = -Infinity, leave = Infinity;
  for (const [a, size, lo, extent, delta] of [[from.x, from.w, target.x, target.w, dx], [from.y, from.h, target.y, target.h, dy]]) {
    if (delta === 0) { if (a! + size! <= lo! || a! >= lo! + extent!) return null; continue; }
    const t0 = (lo! - a! - size!) / delta!, t1 = (lo! + extent! - a!) / delta!;
    enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
  }
  return enter <= leave && leave >= 0 && enter <= 1 ? Math.max(0, enter) : null;
}
