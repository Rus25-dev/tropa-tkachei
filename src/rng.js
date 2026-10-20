// Сидируемый ГСЧ (mulberry32): одно зерно + один ввод = один и тот же исход. Нужен для гонок и воспроизводимых тестов.
// В логике (решения боссов и врагов, разброс снарядов, выпадение бусин) вместо Math.random зови this.rBoss() / this.rEnemy() / this.rLoot() / this.rng().
// Частицы, тряска, звук и реплики остаются на Math.random: на исход они не влияют.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Зерно потока: хэш (зерно, имя) — независимые потоки не сдвигают друг друга.
function rngSeedFor(seed, name) {
  let h = (seed >>> 0) ^ 0x9E3779B9;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
function newSeed() { return (Math.random() * 4294967296) >>> 0; }
