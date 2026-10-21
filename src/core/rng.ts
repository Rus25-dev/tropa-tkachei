// Сидируемый ГСЧ (mulberry32): одно зерно + один ввод = один и тот же исход. Побитово совпадает с legacy/src/rng.js.
// В логике (решения боссов и врагов, разброс снарядов, выпадение бусин) — только потоки отсюда; Math.random в ядре запрещён (eslint).
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Зерно именованного потока: хэш (зерно, имя) — независимые потоки не сдвигают друг друга. */
export function rngSeedFor(seed: number, name: string): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
