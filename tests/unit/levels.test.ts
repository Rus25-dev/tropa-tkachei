// Уровни LDtk: загрузчик (src/core/ldtk.ts) против (а) кодового оракула и (б) настоящего кода v1.8 из legacy/, плюс защита файла от «ручной» порчи.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import tropa from '../../levels/tropa.ldtk' with { type: 'json' };
import { ldtkLevelIds, levelFromLdtk } from '../../src/core/ldtk';
import '../../src/content';
import { buildArena, buildLevel, buildRoad } from '../../src/core/levels';
import { arenaReg } from '../../src/core/plugin/regs';
import { projectLevels, projectText } from '../../tools/ldtk-export';
import * as oracle from '../oracle/levels-code';

const root = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8').replaceAll('\r\n', '\n');

// ----- эталон v1.8: те же функции из legacy/src, выполненные в vm (как в legacy/tools/lib-bridge.js — без браузера) -----
function legacyBuilders(): Record<string, () => unknown> {
  const ctx = vm.createContext({});
  vm.runInContext(read('legacy/src/level.js'), ctx);
  const camp = read('legacy/src/campaign.js');
  vm.runInContext(camp.slice(0, camp.indexOf('const Campaign')), ctx); // CHAPTERS, ROADS, buildRoad
  for (const [file, fn] of [['misha', 'buildMishaArena'], ['vladik', 'buildVladikArena'], ['tima', 'buildTimaArena']] as const) {
    const src = read(`legacy/src/${file}.js`), m = new RegExp(`function ${fn}\\(\\) \\{[\\s\\S]*?\\n\\}\\n`).exec(src);
    if (!m) throw new Error(`Не нашёл ${fn} в legacy/src/${file}.js`);
    vm.runInContext(m[0], ctx);
  }
  const call = (code: string) => (): unknown => JSON.parse(JSON.stringify(vm.runInContext(code, ctx))); // из чужого realm — в обычные объекты
  return {
    Ch1: call('buildLevel()'), Road2: call('buildRoad(2)'), Road3: call('buildRoad(3)'), Road4: call('buildRoad(4)'),
    ArenaMisha: call('buildMishaArena()'), ArenaVladik: call('buildVladikArena()'), ArenaTima: call('buildTimaArena()'),
  };
}
const legacy = legacyBuilders();
const plain = (x: unknown): unknown => JSON.parse(JSON.stringify(x));

describe('уровни LDtk', () => {
  it('в проекте ровно те уровни, что в генераторе', () => {
    expect(ldtkLevelIds(tropa)).toEqual(projectLevels().map(([id]) => id));
    expect(ldtkLevelIds(tropa)).toHaveLength(7);
  });

  for (const [id, code] of projectLevels()) {
    describe(id, () => {
      const L = levelFromLdtk(tropa, id);
      it('совпадает с кодовым оракулом (строго, все поля)', () => {
        expect(L).toStrictEqual(code);
      });
      it('совпадает с кодом v1.8 из legacy/: сетка тайл в тайл и все сущности', () => {
        const old = legacy[id]!() as { W: number; H: number; grid: number[][] };
        expect(L.W).toBe(old.W);
        expect(L.H).toBe(old.H);
        expect(L.grid).toHaveLength(old.H);
        let cells = 0;
        for (let y = 0; y < old.H; y++) for (let x = 0; x < old.W; x++) { expect(L.grid[y]![x], `тайл (${x}, ${y})`).toBe(old.grid[y]![x]); cells++; }
        expect(cells).toBe(old.W * old.H);
        expect(plain(L)).toEqual(old); // всё остальное: враги, таблички, скамьи, предметы, ворота, области, боссы…
      });
    });
  }

  it('buildLevel/buildRoad/buildArena отдают уровни из LDtk и каждый раз новый объект', () => {
    expect(buildLevel()).toStrictEqual(oracle.buildLevel());
    for (const ch of [2, 3, 4]) expect(buildRoad(ch)).toStrictEqual(oracle.buildRoad(ch));
    for (const k of Object.keys(oracle.ARENAS)) { const L = buildArena(k); expect(L.arena).toBe(k); delete L.arena; expect(L).toStrictEqual(oracle.ARENAS[k]!()); }
    expect(buildLevel()).not.toBe(buildLevel());
    expect(buildLevel().grid).not.toBe(buildLevel().grid);
    expect(arenaReg.ids()).toEqual(['misha', 'vladik', 'tima']);
  });

  it('levels/tropa.ldtk совпадает с перегенерацией генератором (защита от ручной порчи)', () => {
    expect(read('levels/tropa.ldtk').replace(/\r\n/g, '\n')).toBe(projectText());
  });
});

describe('загрузчик LDtk: понятные ошибки', () => {
  const clone = (): ReturnType<typeof structuredClone<typeof tropa>> => structuredClone(tropa);
  type P = { levels: { identifier: string; layerInstances: { __identifier: string; intGridCsv: unknown[]; entityInstances: { __identifier: string; px: number[]; fieldInstances: { __identifier: string; __value: unknown }[] }[] }[] }[] };
  const lay = (p: P, level: string, layer: string): P['levels'][0]['layerInstances'][0] => p.levels.find((l) => l.identifier === level)!.layerInstances.find((l) => l.__identifier === layer)!;

  it('нет такого уровня', () => {
    expect(() => levelFromLdtk(tropa, 'Нет')).toThrow(/нет уровня «Нет» \(есть: Ch1, Road2/);
  });
  it('не объект', () => {
    expect(() => levelFromLdtk(null, 'Ch1')).toThrow(/LDtk, проект: «проект» должен быть объектом/);
    expect(() => levelFromLdtk({}, 'Ch1')).toThrow(/«levels» должен быть массивом/);
  });
  it('неверное значение тайла', () => {
    const p = clone() as unknown as P;
    lay(p, 'Road2', 'Tiles').intGridCsv[5] = 7;
    expect(() => levelFromLdtk(p, 'Road2')).toThrow(/уровень «Road2»: клетка \(5, 0\): значение 7/);
  });
  it('неверный размер сетки', () => {
    const p = clone() as unknown as P;
    lay(p, 'Road2', 'Tiles').intGridCsv.pop();
    expect(() => levelFromLdtk(p, 'Road2')).toThrow(/intGridCsv: 1583 значений, нужно 1584/);
  });
  it('нет слоя', () => {
    const p = clone() as unknown as P;
    p.levels.find((l) => l.identifier === 'Road2')!.layerInstances = [];
    expect(() => levelFromLdtk(p, 'Road2')).toThrow(/нет слоя «Tiles»/);
  });
  it('неизвестная сущность, сущность не на сетке, нет точки появления', () => {
    let p = clone() as unknown as P;
    lay(p, 'Road2', 'Entities').entityInstances[0]!.__identifier = 'Dragon';
    expect(() => levelFromLdtk(p, 'Road2')).toThrow(/неизвестный вид сущности «Dragon»/);
    p = clone() as unknown as P;
    lay(p, 'Road2', 'Entities').entityInstances[0]!.px = [33, 0];
    expect(() => levelFromLdtk(p, 'Road2')).toThrow(/не на сетке 32 px/);
    p = clone() as unknown as P;
    const e = lay(p, 'Road2', 'Entities').entityInstances;
    e.splice(e.findIndex((x) => x.__identifier === 'Spawn'), 1);
    expect(() => levelFromLdtk(p, 'Road2')).toThrow(/нет обязательной сущности Spawn/);
  });
  it('пустое обязательное поле', () => {
    const p = clone() as unknown as P;
    const sign = lay(p, 'Road2', 'Entities').entityInstances.find((x) => x.__identifier === 'Sign')!;
    sign.fieldInstances.find((f) => f.__identifier === 'text')!.__value = null;
    expect(() => levelFromLdtk(p, 'Road2')).toThrow(/сущность Sign \(клетка 4, 17\): «поле text» должно быть строкой/);
  });
});
