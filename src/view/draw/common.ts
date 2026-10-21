// Общие помощники отрисовки (legacy/src/game.js drawWeaver, vladik.js drawClef, weapons.js band/edge).
import type Phaser from 'phaser';
import type { Pal } from '../../core/balance';

export type G = Phaser.GameObjects.Graphics;
export const MASK = 0xe8e2cf, INK = 0x10141a;
export const PI = Math.PI;
export interface Pt { x: number; y: number }
/** Graphics.fillPoints ждёт Vector2, но читает только x и y */
export const pts = (a: Pt[]): never => a as never;

/** Поза ткача для drawWeaver */
export interface Pose { bob: number; leg: number; sway: number; lift: number }

/** Общий рисунок ткача (для меню и игры); начало координат — под ногами. */
export function drawWeaver(g: G, x: number, y: number, face: number, pal: Pal, a: Pose, scale: number): void {
  const s = scale || 1, f = face;
  const X = (v: number): number => x + v * s * f, Y = (v: number): number => y + v * s;
  const { bob, leg, sway, lift } = a;
  g.lineStyle(2.4 * s, 0x1a1414, 1);
  g.lineBetween(X(-3), Y(-8), X(-3 + leg), Y(0)); g.lineBetween(X(3), Y(-8), X(3 - leg), Y(0));
  g.fillStyle(pal.dark, 1);
  g.fillPoints(pts([{ x: X(0), y: Y(-22 - bob) }, { x: X(-11 + sway), y: Y(-4 + lift) }, { x: X(-5 + sway), y: Y(-7 + lift) }, { x: X(1 + sway), y: Y(-3 + lift) }, { x: X(9 + sway * 0.5), y: Y(-6 + lift) }]), true);
  g.fillStyle(pal.cloak, 1);
  g.fillPoints(pts([{ x: X(0), y: Y(-23 - bob) }, { x: X(-8 + sway), y: Y(-8 + lift) }, { x: X(7 + sway * 0.5), y: Y(-9 + lift) }]), true);
  const hy = -24 - bob;
  g.lineStyle(1.6 * s, MASK, 1);
  g.lineBetween(X(-2), Y(hy - 5), X(-6), Y(hy - 11)); g.lineBetween(X(-6), Y(hy - 11), X(-11), Y(hy - 12));
  g.lineBetween(X(2), Y(hy - 5), X(3), Y(hy - 12)); g.lineBetween(X(3), Y(hy - 12), X(0), Y(hy - 16));
  g.fillStyle(MASK, 1); g.fillEllipse(X(1), Y(hy), 13 * s, 12 * s);
  g.fillStyle(INK, 1); g.fillEllipse(X(2), Y(hy + 1), 2.6 * s, 5 * s); g.fillEllipse(X(5.5), Y(hy + 1), 2.6 * s, 5 * s);
  g.fillStyle(pal.accent, 1); g.fillRect(Math.min(X(-4), X(4)), Y(hy + 5), 8 * s, 2 * s);
}

// скрипичный ключ: ломаная из точек, поворачиваем вручную
const CLEF_PTS: [number, number][] = (() => {
  const p: [number, number][] = [[-1, 20], [1, -24], [4, -29], [6, -23], [3, -16], [-4, -9], [-8, -1]];
  for (let k = 0; k <= 22; k++) { const a = Math.PI + (k / 22) * Math.PI * 1.75, r = 9 - k * 0.22; p.push([Math.cos(a) * r, 4 - Math.sin(a) * r]); }
  return p;
})();
export function drawClef(g: G, x: number, y: number, s: number, rot: number, col: number): void {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const ps = CLEF_PTS.map(([px, py]) => ({ x: x + (px * cs - py * sn) * s, y: y + (px * sn + py * cs) * s }));
  g.lineStyle(6 * s, 0x1a1410, 1); g.strokePoints(pts(ps), false);
  g.lineStyle(3.2 * s, col, 1); g.strokePoints(pts(ps), false);
  const dx = (-4 * cs - 21 * sn) * s, dy = (-4 * sn + 21 * cs) * s;
  g.fillStyle(0x1a1410, 1); g.fillCircle(x + dx, y + dy, 4.2 * s); g.fillStyle(col, 1); g.fillCircle(x + dx, y + dy, 3 * s);
}

/** полоса дуги: углы r0..r1 отсчитываются от направления удара th (с отражением по лицу f) */
export function band(fx: G, ox: number, oy: number, th: number, f: number, r0: number, r1: number, R: number, w: number, col: number, al: number): void {
  let a0 = th + f * r0, a1 = th + f * r1; if (a0 > a1) { const t = a0; a0 = a1; a1 = t; }
  fx.fillStyle(col, al); fx.beginPath(); fx.arc(ox, oy, R, a0, a1, false); fx.arc(ox, oy, R - w, a1, a0, true); fx.closePath(); fx.fillPath();
}
export function edge(fx: G, ox: number, oy: number, th: number, f: number, r0: number, r1: number, R: number, lw: number, col: number, al: number): void {
  let a0 = th + f * r0, a1 = th + f * r1; if (a0 > a1) { const t = a0; a0 = a1; a1 = t; }
  fx.lineStyle(lw, col, al); fx.beginPath(); fx.arc(ox, oy, R, a0, a1, false); fx.strokePath();
}
export const ease = (x: number): number => 1 - (1 - x) * (1 - x);
