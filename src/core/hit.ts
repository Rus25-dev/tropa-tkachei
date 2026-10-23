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

/** Пересечение простого многоугольника и прямоугольника, включая вогнутые контуры. */
export function polygonHitsRect(points: readonly { x: number; y: number }[], r: Rect): boolean {
  if (points.length < 3) return false;
  const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  if (points.some((p) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h)) return true;
  for (const c of corners) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!, b = points[j]!;
      if ((a.y > c.y) !== (b.y > c.y) && c.x < (b.x - a.x) * (c.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside) return true;
  }
  const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < points.length; i++) for (let j = 0; j < 4; j++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!, c = corners[j]!, d = corners[(j + 1) % 4]!;
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
  }
  return false;
}
