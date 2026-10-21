// ОРАКУЛ уровней: прежние кодовые построители v1.8 (legacy/src/level.js, campaign.js, misha.js, vladik.js, tima.js), перенесённые на этапе 6.
// В игру не входят (бандл их не импортирует): с ними сравнивается загрузчик LDtk (tests/unit/levels.test.ts), а из них же
// генератор tools/ldtk-export.ts строит levels/tropa.ldtk.
import { CHAPTERS, EMPTY, PLAT, SOLID, SPIKE } from '../../src/core/balance';
import type { Level } from '../../src/core/types';

const newGrid = (W: number, H: number): number[][] => {
  const g: number[][] = [];
  for (let y = 0; y < H; y++) g.push(new Array<number>(W).fill(SOLID));
  return g;
};

/** Глава I — «Мшистая Глубь». */
export function buildLevel(): Level {
  const W = 240, H = 40;
  const g = newGrid(W, H);
  const set = (x0: number, y0: number, x1: number, y1: number, v: number): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (y >= 0 && y < H && x >= 0 && x < W) g[y]![x] = v;
  };
  const carve = (x0: number, y0: number, x1: number, y1: number): void => set(x0, y0, x1, y1, EMPTY);
  const fill = (x0: number, y0: number, x1: number, y1: number): void => set(x0, y0, x1, y1, SOLID);
  const plat = (x0: number, x1: number, y: number): void => set(x0, y, x1, y, PLAT);
  const spikes = (x0: number, x1: number, y: number): void => set(x0, y, x1, y, SPIKE);

  // A. Пещера пробуждения: пол на y=34
  carve(1, 22, 44, 33);
  fill(14, 32, 18, 33); // ступенька — учимся прыгать
  fill(31, 31, 35, 33); // уступ повыше
  carve(36, 26, 44, 33);
  // яма с колючками — первая опасность
  carve(22, 34, 25, 35); spikes(22, 25, 35);

  // B. Шахта корней: лазание по стенам
  carve(45, 6, 52, 33);
  plat(46, 48, 30); plat(49, 51, 26); plat(46, 48, 22); plat(49, 51, 18); plat(46, 48, 14); plat(49, 51, 10);

  // C. Верхний ход: пол на y=13
  carve(53, 4, 99, 12);
  carve(70, 13, 76, 14); spikes(70, 76, 14); // пропасть — прыжок + рывок
  fill(84, 10, 86, 12); // низкий валун
  // D. Большой зал: спуск с обрыва, пол y=34
  carve(96, 8, 150, 33);
  plat(112, 118, 28); plat(124, 130, 24); plat(136, 142, 28);

  // E. Поле колючек: прыжки и отскок ударом вниз
  carve(151, 24, 185, 33);
  carve(160, 34, 170, 34); spikes(160, 163, 34); spikes(167, 170, 34);
  plat(164, 166, 30);

  // F. Арена Корнематки
  carve(186, 18, 225, 33);
  plat(192, 196, 28); plat(215, 219, 28);
  // G. Выход
  carve(226, 30, 238, 33);

  const signs = [
    { x: 6, y: 31, text: 'A / D — идти\nПробел — прыжок (держи — выше)', touch: 'Стик слева — идти\nПрыжок (держи — выше)' },
    { x: 19, y: 31, text: 'Колючки ранят.\nУпал — вернёшься на край' },
    { x: 27, y: 31, text: 'F — удар иглой\nКаждый удар копит нить', touch: 'Кнопка «Удар» — игла\nКаждый удар копит нить' },
    { x: 40, y: 31, text: 'Q — связать рану\n(полная катушка нити → +3)', touch: '«Лечить» — связать рану\n(полная катушка нити → +3)' },
    { x: 47, y: 31, text: 'Прыгай от стен,\nчтобы подняться' },
    { x: 64, y: 10, text: 'G — рывок, даже в воздухе', touch: '«Рывок» — даже в воздухе' },
    { x: 101, y: 31, text: 'Скамья: ↑ — меню: отдых (здесь ты очнёшься), лавка, карта.\nНа скамье ↓ — сразу лавка (бусины → улучшения)\nУступ: падая у края, жми к нему, ↑ — подтянуться.\nПарус (за Владика): держи прыжок в падении', touch: 'Скамья: стик вверх — меню: отдых, лавка, карта.\nНа скамье стик вниз — лавка улучшений\nУступ: падая у края, жми к нему, вверх — подтянуться.\nПарус (за Владика): держи прыжок в падении' },
    { x: 109, y: 31, text: 'Q без полной нити — отбив:\nокно 0.2 с, сбивает снаряды, копит нить', touch: '«Нить» без полной катушки — отбив:\nокно 0.2 с, сбивает снаряды' },
    { x: 113, y: 31, text: 'Стик/↑ + Q (от 4 нити) — всполох:\nбьёт всех вокруг. Рывок сквозь удар — уворот', touch: 'Стик вверх + «Нить» (от 4 нити) — всполох.\nРывок сквозь удар — идеальный уворот' },
    { x: 155, y: 31, text: 'В прыжке S + F — удар вниз:\nотскок от колючек и врагов', touch: 'В прыжке стик вниз + удар:\nотскок от колючек и врагов' },
  ];
  const benches = [{ x: 104, y: 33 }];
  const enemies = [
    { type: 'crawler', x: 29, y: 33 },
    { type: 'crawler', x: 41, y: 33 },
    { type: 'gnat', x: 62, y: 8 },
    { type: 'gnat', x: 90, y: 7 },
    { type: 'crawler', x: 80, y: 12 },
    { type: 'crawler', x: 120, y: 33 },
    { type: 'beetle', x: 128, y: 33 },
    { type: 'crawler', x: 140, y: 33 },
    { type: 'gnat', x: 127, y: 18 },
    { type: 'gnat', x: 146, y: 14 },
    { type: 'gnat', x: 176, y: 28 },
    // враги 2 (enemies2.js): растут по сложности к Корнематке
    { type: 'lurker', x: 57, y: 12 }, // верхний ход: засадник у выхода из шахты
    { type: 'bats', x: 67, y: 4 }, // верхний ход: стая под потолком перед пропастью
    { type: 'spitter', x: 92, y: 12 }, // верхний ход: плевальщик за валуном
    { type: 'spitter', x: 115, y: 27 }, // зал: плевальщик на платформе
    { type: 'shell', x: 134, y: 33 }, // зал: первый панцирь (учим тяжёлый удар)
    { type: 'bats', x: 125, y: 8 }, // зал: стая под потолком
    { type: 'lurker', x: 146, y: 33 }, // зал: засадник у выхода
    { type: 'lurker', x: 153, y: 33 },
    { type: 'bats', x: 158, y: 24 }, // поле колючек: стая под потолком
    { type: 'shell', x: 175, y: 33 }, // поле колючек: панцирь перед ареной
    { type: 'spitter', x: 183, y: 33 },
  ];
  return {
    items: [{ ability: 'double', x: 60, y: 12, text: 'Плащ-парус: прыжок в воздухе — ещё один прыжок' }],
    W, H, grid: g, spawn: { x: 4, y: 33 }, signs, benches, enemies,
    boss: { x: 214, y: 33, arenaX0: 187, arenaX1: 225, trigger: 190 },
    gateIn: { x: 186, y0: 24, y1: 33 }, gateOut: { x: 226, y0: 30, y1: 33 },
    exit: { x: 235, y: 33 },
    areas: [
      { x: 0, name: 'Пещера пробуждения' }, { x: 45, name: 'Шахта корней' },
      { x: 53, name: 'Верхний ход' }, { x: 96, name: 'Зал светляков' },
      { x: 151, name: 'Поле колючек' }, { x: 186, name: 'Логово Корнематки' },
    ],
  };
}

// ----- коридоры перед аренами глав II–IV -----
interface RoadCfg { pits: number[][]; blocks: number[][]; plats: number[][]; enemies: [string, number, number][] }
export const ROADS: Record<number, RoadCfg> = {
  2: { pits: [[24, 26], [40, 43]], blocks: [[31, 33, 16], [52, 54, 15]], plats: [[23, 27, 14], [39, 44, 13], [58, 61, 13]],
    enemies: [['crawler', 16, 17], ['crawler', 34, 17], ['crawler', 48, 17], ['crawler', 62, 17], ['gnat', 28, 12], ['gnat', 56, 10]] },
  3: { pits: [[20, 23], [36, 39], [50, 53]], blocks: [[28, 30, 16], [60, 62, 15]], plats: [[19, 24, 13], [35, 40, 13], [49, 54, 13]],
    enemies: [['crawler', 15, 17], ['crawler', 26, 17], ['crawler', 45, 17], ['beetle', 33, 17], ['crawler', 57, 17], ['beetle', 65, 17], ['gnat', 40, 11], ['gnat', 56, 10]] },
  4: { pits: [[31, 34], [46, 49], [56, 58]], blocks: [[20, 22, 17], [23, 25, 16], [26, 28, 15], [40, 42, 16]], plats: [[45, 50, 13], [55, 59, 13]],
    enemies: [['crawler', 14, 17], ['beetle', 37, 17], ['crawler', 44, 17], ['beetle', 52, 17], ['crawler', 62, 17], ['gnat', 38, 11], ['gnat', 54, 10], ['gnat', 63, 12]] },
};

export function buildRoad(ch: number): Level {
  const W = 72, H = 22, cfg = ROADS[ch]!, c = CHAPTERS[ch]!;
  const g = newGrid(W, H);
  const set = (x0: number, y0: number, x1: number, y1: number, v: number): void => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y]![x] = v; };
  set(1, 4, 70, 17, EMPTY);
  for (const [a, b] of cfg.pits) { set(a!, 18, b!, 19, EMPTY); set(a!, 19, b!, 19, SPIKE); }
  for (const [a, b, top] of cfg.blocks) set(a!, top!, b!, 17, SOLID);
  for (const [a, b, y] of cfg.plats) set(a!, y!, b!, y!, PLAT);
  const signs = [
    { x: 4, y: 17, text: 'Скамья: ↑ — меню: отдых, лавка, карта.\nНа скамье ↓ — сразу лавка: маски, игла, катушка', touch: 'Скамья: стик вверх — меню: отдых, лавка, карта.\nНа скамье стик вниз — лавка улучшений' },
    { x: 12, y: 17, text: 'Враги дают бусины.\nБусины тратятся в лавке на скамье' },
    { x: 62, y: 17, text: 'Дальше — арена.\nЗагляни в лавку перед боем' },
  ];
  return {
    W, H, grid: g, spawn: { x: 3, y: 17 }, signs, benches: [{ x: 7, y: 17 }, { x: 65, y: 17 }],
    enemies: cfg.enemies.map(([type, x, y]) => ({ type, x, y })), exit: { x: 69, y: 17 },
    areas: [{ x: 0, name: c.road! }, { x: 36, name: c.road2! }], region: `Глава ${c.roman} · ${c.name}`, road: ch,
  };
}

// ----- арены боссов -----
const arenaGrid = (): number[][] => {
  const g = newGrid(44, 22);
  for (let y = 4; y <= 17; y++) for (let x = 1; x <= 42; x++) g[y]![x] = EMPTY;
  return g;
};

export function buildMishaArena(): Level {
  const g = arenaGrid();
  const plat = (x0: number, x1: number, y: number): void => { for (let x = x0; x <= x1; x++) g[y]![x] = PLAT; };
  plat(6, 11, 13); plat(32, 37, 13); plat(19, 24, 9);
  return {
    W: 44, H: 22, grid: g, spawn: { x: 6, y: 17 }, benches: [], enemies: [], gates: [], exit: null,
    signs: [
      { x: 9, y: 17, text: 'R — дымовая бомба (геймпад LB)\n↑ + R — навесом, ↓ + R — под ноги', touch: 'Кнопка «Бомба» — дымовуха\nстик вверх — навесом, вниз — под ноги' },
      { x: 14, y: 17, text: 'Бей Мишу иглой!\nДымовуха в рюкзак бьёт сильнее,\nа в конце боя нужны только дымовухи' },
    ],
    crates: [{ x: 3, y: 17 }, { x: 40, y: 17 }],
    misha: { x: 28, y: 17 }, ceilY: 4,
    areas: [{ x: 0, name: 'Старая типография' }], region: 'Босс-тест',
  };
}

export function buildVladikArena(): Level {
  const g = arenaGrid();
  const plat = (x0: number, x1: number, y: number): void => { for (let x = x0; x <= x1; x++) g[y]![x] = PLAT; };
  plat(12, 15, 15); plat(28, 31, 15); // парты
  return {
    W: 44, H: 22, grid: g, theme: 'class', spawn: { x: 6, y: 17 }, benches: [], enemies: [], gates: [], exit: null,
    signs: [{ x: 13, y: 17, text: 'Шторы в слизи жгутся — не прыгай в них.\nПод шторой можно пройти низом' },
      { x: 29, y: 17, text: '↓ + прыжок — спрыгнуть с парты', touch: 'Стик вниз + «Прыжок» — спрыгнуть с парты' }],
    windows: [[4, 8], [19, 24], [35, 39]],
    curtains: [[2, 3], [9, 10], [17, 18], [25, 26], [33, 34], [40, 41]],
    vladik: { x: 30, y: 17 }, floorY: 18,
    areas: [{ x: 0, name: 'Кабинет музыки' }], region: 'Босс-тест',
  };
}

export function buildTimaArena(): Level {
  const g = arenaGrid();
  const furniture = [
    { kind: 'couch', x0: 7, x1: 13, y: 15 },
    { kind: 'shelf', x0: 19, x1: 24, y: 10 },
    { kind: 'crates', x0: 31, x1: 34, y: 14 },
  ];
  for (const f of furniture) for (let x = f.x0; x <= f.x1; x++) g[f.y]![x] = PLAT;
  return {
    W: 44, H: 22, grid: g, theme: 'den', spawn: { x: 4, y: 17 }, benches: [], enemies: [], gates: [], exit: null,
    signs: [{ x: 5, y: 17, text: 'Тима бьётся обычной иглой.\nКогда он чертит круг для пыли — беги и бей:\nтри удара, и он чихнёт' }],
    furniture, tima: { x: 30, y: 17 }, floorY: 18,
    areas: [{ x: 0, name: 'Берлога Тимы' }], region: 'Босс-тест',
  };
}

export const ARENAS: Record<string, () => Level> = { misha: buildMishaArena, vladik: buildVladikArena, tima: buildTimaArena };
