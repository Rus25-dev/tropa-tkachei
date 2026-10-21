// Загрузчик уровней LDtk → Level ядра. ЧИСТАЯ функция: на входе уже разобранный JSON проекта (его подключает вызывающий через
// `import … with { type: 'json' }`), никаких fs/fetch. Формат проекта (слои, сущности, поля) описан в levels/README.md;
// имена слоёв, сущностей и полей лежат в LDTK ниже — их же использует генератор tools/ldtk-export.ts.
import { T } from './balance';
import type { Gate, Level } from './types';

/** Имена из определений проекта LDtk (defs). Менять только вместе с levels/*.ldtk. */
export const LDTK = {
  layerTiles: 'Tiles', layerEntities: 'Entities',
  /** Значения IntGrid совпадают с константами ядра: 0 — пусто (в LDtk это «нет значения»), 1 — твёрдый, 2 — платформа, 3 — шипы. */
  intGrid: { solid: 'Solid', plat: 'Plat', spike: 'Spike' },
  entity: {
    spawn: 'Spawn', exit: 'Exit', bench: 'Bench', sign: 'Sign', enemy: 'Enemy', item: 'Item', gateIn: 'GateIn', gateOut: 'GateOut',
    bossArena: 'BossArena', area: 'Area', crate: 'Crate', misha: 'Misha', vladik: 'Vladik', tima: 'Tima', window: 'Window', curtain: 'Curtain', furniture: 'Furniture',
  },
  levelFields: ['region', 'theme', 'road', 'ceilY', 'floorY', 'noGates'],
} as const;

type Obj = Record<string, unknown>;

class LdtkError extends Error {
  constructor(msg: string) { super(msg); this.name = 'LdtkError'; }
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const show = (v: unknown): string => { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 57) + '…' : s; };

/** Читатель с контекстом для сообщений об ошибках: «LDtk, уровень «Ch1», сущность Sign (клетка 6, 31): …». */
class Ctx {
  constructor(readonly where: string) {}
  fail(msg: string): never { throw new LdtkError(`LDtk, ${this.where}: ${msg}`); }
  obj(v: unknown, what: string): Obj { return isObj(v) ? v : this.fail(`«${what}» должен быть объектом, а не ${show(v)}`); }
  arr(v: unknown, what: string): unknown[] { return Array.isArray(v) ? v : this.fail(`«${what}» должен быть массивом, а не ${show(v)}`); }
  str(v: unknown, what: string): string { return typeof v === 'string' ? v : this.fail(`«${what}» должно быть строкой, а не ${show(v)}`); }
  int(v: unknown, what: string): number { return typeof v === 'number' && Number.isInteger(v) ? v : this.fail(`«${what}» должно быть целым числом, а не ${show(v)}`); }
  sub(extra: string): Ctx { return new Ctx(`${this.where}, ${extra}`); }
}

/** Идентификаторы уровней проекта в порядке следования. */
export function ldtkLevelIds(project: unknown): string[] {
  const c = new Ctx('проект');
  const root = c.obj(project, 'проект');
  return c.arr(root['levels'], 'levels').map((l, i) => c.str(c.obj(l, `levels[${i}]`)['identifier'], `levels[${i}].identifier`));
}

interface Ent { id: string; x: number; y: number; w: number; h: number; f: Map<string, unknown>; c: Ctx }

/** Собирает Level ядра из уровня `levelId` проекта LDtk. Бросает понятную ошибку на русском, если файл повреждён или не по формату. */
export function levelFromLdtk(project: unknown, levelId: string): Level {
  const pc = new Ctx('проект');
  const root = pc.obj(project, 'проект');
  const levels = pc.arr(root['levels'], 'levels');
  const lv = levels.find((l) => isObj(l) && l['identifier'] === levelId);
  if (!lv) {
    const have = levels.map((l) => (isObj(l) ? String(l['identifier']) : '?')).join(', ');
    return pc.fail(`нет уровня «${levelId}» (есть: ${have || 'ничего'})`);
  }
  const c = new Ctx(`уровень «${levelId}»`);
  const level = c.obj(lv, 'уровень');
  const pxWid = c.int(level['pxWid'], 'pxWid'), pxHei = c.int(level['pxHei'], 'pxHei');
  if (pxWid % T || pxHei % T) c.fail(`размер ${pxWid}×${pxHei} px не кратен клетке ${T} px`);
  const W = pxWid / T, H = pxHei / T;

  // ----- поля уровня -----
  const lf = new Map<string, unknown>();
  for (const [i, raw] of c.arr(level['fieldInstances'], 'fieldInstances').entries()) {
    const fi = c.obj(raw, `fieldInstances[${i}]`), name = c.str(fi['__identifier'], `fieldInstances[${i}].__identifier`);
    if (!(LDTK.levelFields as readonly string[]).includes(name)) c.fail(`неизвестное поле уровня «${name}»`);
    lf.set(name, fi['__value']);
  }
  const optStr = (n: string): string | null => { const v = lf.get(n); return v === null || v === undefined ? null : c.str(v, `поле уровня ${n}`); };
  const optInt = (n: string): number | null => { const v = lf.get(n); return v === null || v === undefined ? null : c.int(v, `поле уровня ${n}`); };

  // ----- слои -----
  const layers = c.arr(level['layerInstances'], 'layerInstances').map((l, i) => c.obj(l, `layerInstances[${i}]`));
  const layer = (name: string, type: string): Obj => {
    const l = layers.find((x) => x['__identifier'] === name);
    if (!l) return c.fail(`нет слоя «${name}»`);
    if (l['__type'] !== type) c.fail(`слой «${name}» должен быть типа ${type}, а не ${show(l['__type'])}`);
    if (l['__gridSize'] !== T) c.fail(`слой «${name}»: размер клетки ${show(l['__gridSize'])}, нужен ${T}`);
    return l;
  };

  // тайлы
  const tl = layer(LDTK.layerTiles, 'IntGrid');
  if (tl['__cWid'] !== W || tl['__cHei'] !== H) c.fail(`слой «${LDTK.layerTiles}» ${show(tl['__cWid'])}×${show(tl['__cHei'])} клеток, а уровень ${W}×${H}`);
  const csv = c.arr(tl['intGridCsv'], 'intGridCsv');
  if (csv.length !== W * H) c.fail(`intGridCsv: ${csv.length} значений, нужно ${W * H} (${W}×${H})`);
  const grid: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = new Array<number>(W);
    for (let x = 0; x < W; x++) {
      const v = csv[y * W + x];
      if (v !== 0 && v !== 1 && v !== 2 && v !== 3) c.fail(`клетка (${x}, ${y}): значение ${show(v)} — допустимы 0 (пусто), 1 (твёрдый), 2 (платформа), 3 (шипы)`);
      row[x] = v as number;
    }
    grid.push(row);
  }

  // сущности
  const el = layer(LDTK.layerEntities, 'Entities');
  const ents: Ent[] = c.arr(el['entityInstances'], 'entityInstances').map((raw, i) => {
    const e = c.obj(raw, `entityInstances[${i}]`), id = c.str(e['__identifier'], `entityInstances[${i}].__identifier`);
    const px = c.arr(e['px'], `${id}.px`);
    const ec = c.sub(`сущность ${id} (№${i + 1})`);
    if (px.length !== 2) ec.fail('px должен быть парой [x, y]');
    const ppx = ec.int(px[0], 'px[0]'), ppy = ec.int(px[1], 'px[1]');
    if (ppx % T || ppy % T) ec.fail(`позиция ${ppx}, ${ppy} px не на сетке ${T} px`);
    const w = ec.int(e['width'], 'width'), h = ec.int(e['height'], 'height');
    if (w % T || h % T || w <= 0 || h <= 0) ec.fail(`размер ${w}×${h} px не кратен клетке ${T} px`);
    const x = ppx / T, y = ppy / T;
    if (x < 0 || y < 0 || x + w / T > W || y + h / T > H) ec.fail(`выходит за уровень (клетка ${x}, ${y}, размер ${w / T}×${h / T}; уровень ${W}×${H})`);
    const f = new Map<string, unknown>();
    for (const [j, rf] of ec.arr(e['fieldInstances'], 'fieldInstances').entries()) {
      const fi = ec.obj(rf, `fieldInstances[${j}]`);
      f.set(ec.str(fi['__identifier'], `fieldInstances[${j}].__identifier`), fi['__value']);
    }
    return { id, x, y, w: w / T, h: h / T, f, c: c.sub(`сущность ${id} (клетка ${x}, ${y})`) };
  });
  const known = new Set<string>(Object.values(LDTK.entity));
  for (const e of ents) if (!known.has(e.id)) e.c.fail(`неизвестный вид сущности «${e.id}»`);
  const all = (id: string): Ent[] => ents.filter((e) => e.id === id);
  const one = (id: string, required: boolean): Ent | null => {
    const a = all(id);
    if (a.length > 1) c.fail(`сущность ${id} должна быть одна, а их ${a.length}`);
    if (!a[0] && required) c.fail(`нет обязательной сущности ${id}`);
    return a[0] ?? null;
  };
  const fstr = (e: Ent, n: string): string => e.c.str(e.f.get(n), `поле ${n}`);
  const fstrOpt = (e: Ent, n: string): string | null => { const v = e.f.get(n); return v === null || v === undefined ? null : e.c.str(v, `поле ${n}`); };
  const fint = (e: Ent, n: string): number => e.c.int(e.f.get(n), `поле ${n}`);
  const fintOpt = (e: Ent, n: string): number | null => { const v = e.f.get(n); return v === null || v === undefined ? null : e.c.int(v, `поле ${n}`); };
  const pt = (e: Ent): { x: number; y: number } => ({ x: e.x, y: e.y });
  const gate = (e: Ent | null): Gate | undefined => (e ? { x: e.x, y0: e.y, y1: e.y + e.h - 1 } : undefined);

  const spawn = one(LDTK.entity.spawn, true)!;
  const exit = one(LDTK.entity.exit, false);
  const out: Level = {
    W, H, grid, spawn: pt(spawn),
    signs: all(LDTK.entity.sign).map((e) => {
      const touch = fstrOpt(e, 'touch');
      return touch === null ? { x: e.x, y: e.y, text: fstr(e, 'text') } : { x: e.x, y: e.y, text: fstr(e, 'text'), touch };
    }),
    benches: all(LDTK.entity.bench).map(pt),
    enemies: all(LDTK.entity.enemy).map((e) => ({ type: fstr(e, 'type'), x: e.x, y: e.y })),
    exit: exit ? pt(exit) : null,
    areas: all(LDTK.entity.area).map((e) => ({ x: e.x, name: fstr(e, 'name') })),
  };

  // необязательные части: ключ появляется, только если в уровне есть соответствующая сущность или поле
  const items = all(LDTK.entity.item);
  if (items.length) out.items = items.map((e) => ({ ability: fstr(e, 'ability'), x: e.x, y: e.y, text: fstr(e, 'text') }));
  const ba = one(LDTK.entity.bossArena, false);
  if (ba) {
    const b: NonNullable<Level['boss']> = { x: ba.x, y: ba.y, arenaX0: fint(ba, 'arenaX0'), arenaX1: fint(ba, 'arenaX1'), trigger: fint(ba, 'trigger') };
    const fy = fintOpt(ba, 'floorY'); if (fy !== null) b.floorY = fy;
    out.boss = b;
  }
  const gi = gate(one(LDTK.entity.gateIn, false)), go = gate(one(LDTK.entity.gateOut, false));
  if (gi) out.gateIn = gi;
  if (go) out.gateOut = go;
  if (lf.get('noGates') === true) out.gates = []; // арены: явно «без ворот» (иначе мир возьмёт gateIn/gateOut)
  const crates = all(LDTK.entity.crate); if (crates.length) out.crates = crates.map(pt);
  const misha = one(LDTK.entity.misha, false); if (misha) out.misha = pt(misha);
  const vladik = one(LDTK.entity.vladik, false); if (vladik) out.vladik = pt(vladik);
  const tima = one(LDTK.entity.tima, false); if (tima) out.tima = pt(tima);
  const wins = all(LDTK.entity.window); if (wins.length) out.windows = wins.map((e) => [e.x, e.x + e.w - 1]);
  const curs = all(LDTK.entity.curtain); if (curs.length) out.curtains = curs.map((e) => [e.x, e.x + e.w - 1]);
  const furn = all(LDTK.entity.furniture); if (furn.length) out.furniture = furn.map((e) => ({ kind: fstr(e, 'kind'), x0: e.x, x1: e.x + e.w - 1, y: e.y }));

  const region = optStr('region'); if (region !== null) out.region = region;
  const theme = optStr('theme'); if (theme !== null) out.theme = theme;
  const road = optInt('road'); if (road !== null) out.road = road;
  const ceilY = optInt('ceilY'); if (ceilY !== null) out.ceilY = ceilY;
  const floorY = optInt('floorY'); if (floorY !== null) out.floorY = floorY;
  return out;
}
