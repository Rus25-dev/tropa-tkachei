// Статистика таблицы бота: доверительные интервалы. Доли — по Уилсону, времена — нормальное приближение и бутстрэп (с зерном: числа воспроизводимы).
import { mulberry32 } from '../../src/core/rng';

/** Критическое значение для 95 % */
export const Z95 = 1.959964;

/** Доверительный интервал Уилсона для доли k из n */
export function wilson(k: number, n: number, z = Z95): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n, z2 = z * z, den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den, h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export const mean = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export function stdev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
export function quantile(a: number[], q: number): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}
export const median = (a: number[]): number => quantile(a, 0.5);

/** Нормальный интервал для среднего */
export function meanCI(a: number[], z = Z95): [number, number] {
  if (!a.length) return [NaN, NaN];
  const m = mean(a), h = a.length > 1 ? (z * stdev(a)) / Math.sqrt(a.length) : 0;
  return [m - h, m + h];
}

/** Бутстрэп-интервал (процентили) для среднего; зерно фиксировано, повтор даёт то же число */
export function bootstrapCI(a: number[], opt: { B?: number; seed?: number; level?: number } = {}): [number, number] {
  if (!a.length) return [NaN, NaN];
  const B = opt.B ?? 1000, level = opt.level ?? 0.95, R = mulberry32((opt.seed ?? 12345) >>> 0), n = a.length, means: number[] = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += a[Math.floor(R() * n)]!; means.push(s / n); }
  return [quantile(means, (1 - level) / 2), quantile(means, 1 - (1 - level) / 2)];
}

export const pct = (x: number): string => (Number.isFinite(x) ? (x * 100).toFixed(0) + '%' : '-');
export const num = (x: number, d = 0): string => (Number.isFinite(x) ? x.toFixed(d) : '-');
