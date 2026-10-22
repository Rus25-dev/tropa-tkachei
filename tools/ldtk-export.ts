// Генератор levels/tropa.ldtk из кодовых построителей уровней (оракул tests/oracle/levels-code.ts).
// Запуск:  npx tsx tools/ldtk-export.ts [--out <папка>]   (по умолчанию пишет в levels/)
// После переноса уровней файл правят прямо в LDtk; генератор нужен как защита и «точка отсчёта»: тест tests/unit/levels.test.ts
// проверяет, что перегенерация даёт ТОТ ЖЕ файл, а загрузчик (src/core/ldtk.ts) собирает из него в точности уровни v1.8.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LDTK } from '../src/core/ldtk';
import { enemyReg } from '../src/core/plugin/regs';
import { T } from '../src/core/balance';
import type { Level } from '../src/core/types';
import { ARENAS, buildLevel, buildRoad } from '../tests/oracle/levels-code';

// ---------- детерминированные идентификаторы ----------
function iid(name: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x9747b28c, h3 = 0xdeadbeef, h4 = 0x41c6ce57;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); h3 = Math.imul(h3 ^ c, 2246822507); h4 = Math.imul(h4 ^ c, 3266489909);
  }
  h1 = Math.imul(h1 ^ (h2 >>> 15), 2246822507) ^ Math.imul(h3 ^ (h4 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h2 >>> 15), 2654435761) ^ Math.imul(h1 ^ (h4 >>> 17), 1597334677);
  h4 = Math.imul(h4 ^ (h3 >>> 16), 2654435761) ^ Math.imul(h2 ^ (h1 >>> 13), 1597334677);
  const hex = [h1, h2, h3, h4].map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ---------- определения (defs) ----------
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Kind = 'Int' | 'String' | 'Text' | 'Bool' | 'Enum';

/** виды врагов v1.8 в прежнем порядке (от него зависят uid в файле); новые виды из src/content/enemies дописываются в конец */
const ENEMY_BASE = ['crawler', 'gnat', 'beetle', 'spitter', 'shell', 'lurker', 'bats'];
const ENUMS: Record<'EnemyType' | 'FurnitureKind', readonly string[]> = {
  EnemyType: [...ENEMY_BASE, ...enemyReg.list().map((d) => d.levelType ?? d.id).filter((t) => !ENEMY_BASE.includes(t))],
  FurnitureKind: ['couch', 'shelf', 'crates'],
};
const ENUM_UID: Record<string, number> = { EnemyType: 100, FurnitureKind: 101 };

interface FieldSpec { name: string; kind: Kind; nullable?: boolean; enumName?: keyof typeof ENUMS; doc: string; show?: 'Hidden' | 'ValueOnly' | 'NameAndValue'; def?: boolean }
interface EntSpec { id: string; uid: number; color: string; w?: number; h?: number; resX?: boolean; resY?: boolean; max?: number; doc: string; fields?: FieldSpec[]; showName?: boolean }

const E = LDTK.entity;
const ENTITIES: EntSpec[] = [
  { id: E.spawn, uid: 10, color: '#2fbf71', max: 1, doc: 'Точка появления героев (клетка, где стоят ноги — нижняя клетка героя).' },
  { id: E.exit, uid: 11, color: '#e8c84a', max: 1, doc: 'Выход из уровня. В аренах боссов его нет.' },
  { id: E.bench, uid: 12, color: '#c28a4a', doc: 'Скамья: отдых, лавка, карта.' },
  { id: E.sign, uid: 13, color: '#9fb2c8', doc: 'Табличка с подсказкой.', fields: [
    { name: 'text', kind: 'Text', doc: 'Текст таблички (ПК/геймпад). Перенос строки — Enter.' },
    { name: 'touch', kind: 'Text', nullable: true, doc: 'Текст для сенсорного управления; пусто — показывается обычный.' }] },
  { id: E.enemy, uid: 14, color: '#d9534f', doc: 'Враг; клетка — на какой клетке он стоит.', fields: [
    { name: 'type', kind: 'Enum', enumName: 'EnemyType', doc: 'Вид врага.', show: 'ValueOnly' }] },
  { id: E.item, uid: 15, color: '#8e6bd8', doc: 'Предмет способности.', fields: [
    { name: 'ability', kind: 'String', doc: 'Ключ способности (double — двойной прыжок).', show: 'ValueOnly' },
    { name: 'text', kind: 'Text', doc: 'Что показать при подборе.' }] },
  { id: E.gateIn, uid: 16, color: '#b5651d', w: T, h: T, resY: true, max: 1, doc: 'Ворота входа в арену босса (закрываются в бою). Высота — по числу клеток.' },
  { id: E.gateOut, uid: 17, color: '#7a3f10', w: T, h: T, resY: true, max: 1, doc: 'Ворота выхода (открываются после победы над боссом).' },
  { id: E.bossArena, uid: 18, color: '#ff4081', max: 1, doc: 'Арена босса главы I: клетка — где появится босс.', fields: [
    { name: 'arenaX0', kind: 'Int', doc: 'Левая граница арены (клетка).' },
    { name: 'arenaX1', kind: 'Int', doc: 'Правая граница арены (клетка).' },
    { name: 'trigger', kind: 'Int', doc: 'Клетка X, с которой начинается бой.' },
    { name: 'floorY', kind: 'Int', nullable: true, doc: 'Строка пола арены; пусто — берётся по телу босса.' }] },
  { id: E.area, uid: 19, color: '#4aa3df', doc: 'Начало области: с этой клетки X и правее показывается название.', fields: [
    { name: 'name', kind: 'String', doc: 'Название области.', show: 'ValueOnly' }] },
  { id: E.crate, uid: 20, color: '#8b5a2b', doc: 'Ящик с дымовухами (арена Миши).' },
  { id: E.misha, uid: 21, color: '#ff9800', max: 1, doc: 'Миша Додик: позиция в арене.' },
  { id: E.vladik, uid: 22, color: '#9c27b0', max: 1, doc: 'Владик Скрипка: позиция в арене.' },
  { id: E.tima, uid: 23, color: '#795548', max: 1, doc: 'Тима Пиво: позиция в арене.' },
  { id: E.window, uid: 24, color: '#80deea', resX: true, doc: 'Окно класса: растяните по ширине (клетки X0…X1).' },
  { id: E.curtain, uid: 25, color: '#a5d6a7', resX: true, doc: 'Штора класса: растяните по ширине (клетки X0…X1).' },
  { id: E.furniture, uid: 26, color: '#bcaaa4', resX: true, doc: 'Мебель берлоги (кладётся и в слой Tiles как платформа): ширина — X0…X1, строка — Y.', fields: [
    { name: 'kind', kind: 'Enum', enumName: 'FurnitureKind', doc: 'Вид мебели.', show: 'ValueOnly' }] },
];

const LEVEL_FIELDS: FieldSpec[] = [
  { name: 'region', kind: 'String', nullable: true, doc: 'Название региона на экране (пусто — не задано).' },
  { name: 'theme', kind: 'String', nullable: true, doc: 'Тема оформления: class — класс, den — берлога; пусто — обычная.' },
  { name: 'road', kind: 'Int', nullable: true, doc: 'Номер главы коридора (2–4); пусто — это не коридор.' },
  { name: 'ceilY', kind: 'Int', nullable: true, doc: 'Строка потолка арены Миши.' },
  { name: 'floorY', kind: 'Int', nullable: true, doc: 'Строка пола арены Владика/Тимы.' },
  { name: 'noGates', kind: 'Bool', def: false, doc: 'Арена без ворот: явный пустой список ворот (иначе игра возьмёт GateIn/GateOut).' },
];

let nextUid = 1000;
const fieldUid = new Map<string, number>(); // «Сущность.поле» → uid
const uidOf = (key: string): number => { let u = fieldUid.get(key); if (u === undefined) { u = nextUid++; fieldUid.set(key, u); } return u; };

const jsType = (f: FieldSpec): string => (f.kind === 'Text' ? 'Multilines' : f.kind === 'Enum' ? `LocalEnum.${f.enumName}` : f.kind);
const fType = (f: FieldSpec): string => (f.kind === 'Enum' ? `F_Enum(${ENUM_UID[f.enumName!]})` : `F_${f.kind}`);

function fieldDef(owner: string, f: FieldSpec): Json {
  return {
    identifier: f.name, doc: f.doc, __type: jsType(f), uid: uidOf(`${owner}.${f.name}`), type: fType(f), isArray: false, canBeNull: !!f.nullable,
    arrayMinLength: null, arrayMaxLength: null, editorDisplayMode: f.show ?? 'Hidden', editorDisplayScale: 1, editorDisplayPos: 'Above', editorLinkStyle: 'StraightArrow',
    editorDisplayColor: null, editorAlwaysShow: false, editorShowInWorld: true, editorCutLongValues: true, editorTextSuffix: null, editorTextPrefix: null,
    useForSmartColor: false, exportToToc: false, searchable: false, min: null, max: null, regex: null, acceptFileTypes: null,
    defaultOverride: f.kind === 'Bool' ? { id: 'V_Bool', params: [f.def ?? false] } : null, textLanguageMode: null,
    symmetricalRef: false, autoChainRef: true, allowOutOfLevelRef: true, allowedRefs: 'OnlySame', allowedRefsEntityUid: null, allowedRefTags: [], tilesetUid: null,
  };
}

function entityDef(s: EntSpec): Json {
  return {
    identifier: s.id, uid: s.uid, tags: [], exportToToc: false, allowOutOfBounds: false, doc: s.doc, width: s.w ?? T, height: s.h ?? T,
    resizableX: !!s.resX, resizableY: !!s.resY, minWidth: null, maxWidth: null, minHeight: null, maxHeight: null, keepAspectRatio: false,
    tileOpacity: 1, fillOpacity: 0.35, lineOpacity: 1, hollow: false, color: s.color, renderMode: 'Rectangle', showName: s.showName ?? true,
    tilesetId: null, tileRenderMode: 'FitInside', tileRect: null, uiTileRect: null, nineSliceBorders: [], maxCount: s.max ?? 0, limitScope: 'PerLevel',
    limitBehavior: s.max ? 'DiscardOldOnes' : 'MoveLastOne', pivotX: 0, pivotY: 0, fieldDefs: (s.fields ?? []).map((f) => fieldDef(s.id, f)),
  };
}

const INT_VALUES: { value: number; identifier: string; color: string }[] = [
  { value: 1, identifier: LDTK.intGrid.solid, color: '#8a7a64' },
  { value: 2, identifier: LDTK.intGrid.plat, color: '#4fa3a5' },
  { value: 3, identifier: LDTK.intGrid.spike, color: '#d9534f' },
];

const UID_TILES = 1, UID_ENTITIES = 2;
const layerCommon = {
  gridSize: T, guideGridWid: 0, guideGridHei: 0, displayOpacity: 1, inactiveOpacity: 0.6, hideInList: false, hideFieldsWhenInactive: true,
  canSelectWhenInactive: true, renderInWorldView: true, pxOffsetX: 0, pxOffsetY: 0, parallaxFactorX: 0, parallaxFactorY: 0, parallaxScaling: true,
  requiredTags: [], excludedTags: [], uiFilterTags: [], useAsyncRender: false, doc: null, uiColor: null,
};

const defs = (): Json => ({
  layers: [
    { __type: 'Entities', identifier: LDTK.layerEntities, type: 'Entities', uid: UID_ENTITIES, ...layerCommon, intGridValues: [], intGridValuesGroups: [], autoRuleGroups: [],
      autoSourceLayerDefUid: null, tilesetDefUid: null, tilePivotX: 0, tilePivotY: 0, biomeFieldUid: null },
    { __type: 'IntGrid', identifier: LDTK.layerTiles, type: 'IntGrid', uid: UID_TILES, ...layerCommon,
      intGridValues: INT_VALUES.map((v) => ({ ...v, tile: null, groupUid: 0 })), intGridValuesGroups: [], autoRuleGroups: [],
      autoSourceLayerDefUid: null, tilesetDefUid: null, tilePivotX: 0, tilePivotY: 0, biomeFieldUid: null },
  ],
  entities: ENTITIES.map(entityDef),
  tilesets: [],
  enums: (Object.keys(ENUMS) as (keyof typeof ENUMS)[]).map((n) => ({
    identifier: n, uid: ENUM_UID[n]!, values: ENUMS[n].map((id) => ({ id, tileRect: null, color: 0 })), iconTilesetUid: null, externalRelPath: null, externalFileChecksum: null, tags: [],
  })),
  externalEnums: [],
  levelFields: LEVEL_FIELDS.map((f) => fieldDef('Level', f)),
});

// ---------- уровни ----------
interface Pending { id: string; x: number; y: number; w?: number; h?: number; f?: Record<string, string | number | boolean | null> }

/** Level ядра → список сущностей LDtk. Порядок внутри каждого вида сохраняется (он важен для игры: например, порядок врагов). */
function entitiesOf(L: Level): Pending[] {
  const p: Pending[] = [{ id: E.spawn, x: L.spawn.x, y: L.spawn.y }];
  if (L.exit) p.push({ id: E.exit, x: L.exit.x, y: L.exit.y });
  for (const b of L.benches) p.push({ id: E.bench, x: b.x, y: b.y });
  for (const s of L.signs) p.push({ id: E.sign, x: s.x, y: s.y, f: { text: s.text, touch: s.touch ?? null } });
  for (const e of L.enemies) p.push({ id: E.enemy, x: e.x, y: e.y, f: { type: e.type } });
  for (const i of L.items ?? []) p.push({ id: E.item, x: i.x, y: i.y, f: { ability: i.ability, text: i.text } });
  if (L.gateIn) p.push({ id: E.gateIn, x: L.gateIn.x, y: L.gateIn.y0, h: L.gateIn.y1 - L.gateIn.y0 + 1 });
  if (L.gateOut) p.push({ id: E.gateOut, x: L.gateOut.x, y: L.gateOut.y0, h: L.gateOut.y1 - L.gateOut.y0 + 1 });
  if (L.boss) p.push({ id: E.bossArena, x: L.boss.x, y: L.boss.y, f: { arenaX0: L.boss.arenaX0, arenaX1: L.boss.arenaX1, trigger: L.boss.trigger, floorY: L.boss.floorY ?? null } });
  for (const a of L.areas) p.push({ id: E.area, x: a.x, y: 0, f: { name: a.name } });
  for (const c of L.crates ?? []) p.push({ id: E.crate, x: c.x, y: c.y });
  if (L.misha) p.push({ id: E.misha, x: L.misha.x, y: L.misha.y });
  if (L.vladik) p.push({ id: E.vladik, x: L.vladik.x, y: L.vladik.y });
  if (L.tima) p.push({ id: E.tima, x: L.tima.x, y: L.tima.y });
  for (const [a, b] of L.windows ?? []) p.push({ id: E.window, x: a!, y: 4, w: b! - a! + 1 });
  for (const [a, b] of L.curtains ?? []) p.push({ id: E.curtain, x: a!, y: 4, w: b! - a! + 1 });
  for (const f of L.furniture ?? []) p.push({ id: E.furniture, x: f.x0, y: f.y, w: f.x1 - f.x0 + 1, f: { kind: f.kind } });
  return p;
}

const fieldInst = (owner: string, f: FieldSpec, value: string | number | boolean | null): Json => {
  const isDefault = f.kind === 'Bool' && value === (f.def ?? false);
  const real: Json[] = value === null || isDefault ? [] : [{ id: f.kind === 'Int' ? 'V_Int' : f.kind === 'Bool' ? 'V_Bool' : 'V_String', params: [value] }];
  return { __identifier: f.name, __type: jsType(f), __value: value, __tile: null, defUid: uidOf(`${owner}.${f.name}`), realEditorValues: real };
};

interface Rows { rows: number[][] } // для сериализатора: сетка печатается построчно

function levelJson(id: string, uid: number, worldY: number, L: Level): Json {
  const px = (n: number): number => n * T;
  const ents: Json[] = entitiesOf(L).map((e, i) => {
    const spec = ENTITIES.find((s) => s.id === e.id)!;
    const w = px(e.w ?? 1), h = px(e.h ?? 1), x = px(e.x), y = px(e.y);
    return {
      __identifier: e.id, __grid: [e.x, e.y], __pivot: [0, 0], __tags: [], __tile: null, __smartColor: spec.color, __worldX: x, __worldY: worldY + y,
      iid: iid(`${id}/e/${i}/${e.id}`), width: w, height: h, defUid: spec.uid, px: [x, y],
      fieldInstances: (spec.fields ?? []).map((f) => fieldInst(e.id, f, e.f![f.name] ?? null)),
    };
  });
  const lv: Record<string, string | number | boolean | null> = {
    region: L.region ?? null, theme: L.theme ?? null, road: L.road ?? null, ceilY: L.ceilY ?? null, floorY: L.floorY ?? null, noGates: L.gates !== undefined,
  };
  const lay = (name: string, type: string, defUid: number, extra: Record<string, Json>): Json => ({
    __identifier: name, __type: type, __cWid: L.W, __cHei: L.H, __gridSize: T, __opacity: 1, __pxTotalOffsetX: 0, __pxTotalOffsetY: 0, __tilesetDefUid: null, __tilesetRelPath: null,
    iid: iid(`${id}/layer/${name}`), levelId: uid, layerDefUid: defUid, pxOffsetX: 0, pxOffsetY: 0, visible: true, optionalRules: [], intGridCsv: [], autoLayerTiles: [], seed: 1,
    overrideTilesetUid: null, gridTiles: [], entityInstances: [], ...extra,
  });
  return {
    identifier: id, iid: iid(`${id}/level`), uid, worldX: 0, worldY, worldDepth: 0, pxWid: px(L.W), pxHei: px(L.H),
    __bgColor: '#696A79', bgColor: null, useAutoIdentifier: false, bgRelPath: null, bgPos: null, bgPivotX: 0.5, bgPivotY: 0.5, __smartColor: '#ADADB5', __bgPos: null,
    externalRelPath: null, fieldInstances: LEVEL_FIELDS.map((f) => fieldInst('Level', f, lv[f.name]!)),
    layerInstances: [
      lay(LDTK.layerEntities, 'Entities', UID_ENTITIES, { entityInstances: ents }),
      lay(LDTK.layerTiles, 'IntGrid', UID_TILES, { intGridCsv: { rows: L.grid } as unknown as Json }),
    ],
    __neighbours: [],
  };
}

/** Уровни проекта: идентификатор в LDtk → Level из кодового оракула. Порядок — как в файле. */
export function projectLevels(): [string, Level][] {
  return [
    ['Ch1', buildLevel()], ['Road2', buildRoad(2)], ['Road3', buildRoad(3)], ['Road4', buildRoad(4)],
    ['ArenaMisha', ARENAS['misha']!()], ['ArenaVladik', ARENAS['vladik']!()], ['ArenaTima', ARENAS['tima']!()],
  ];
}

/** Объект проекта LDtk (JSON, формат 1.5.3). */
export function buildProject(): Json {
  nextUid = 1000; fieldUid.clear();
  const defsJson = defs();
  let worldY = 0;
  const levels = projectLevels().map(([id, L], i) => { const lv = levelJson(id, 500 + i, worldY, L); worldY += L.H * T + 256; return lv; });
  return {
    __header__: { fileType: 'LDtk Project JSON', app: 'LDtk', doc: 'https://ldtk.io/json', schema: 'https://ldtk.io/files/JSON_SCHEMA.json', appAuthor: "Sebastien 'deepnight' Benard", appVersion: '1.5.3', url: 'https://ldtk.io' },
    iid: iid('tropa/project'), jsonVersion: '1.5.3', appBuildId: 473703, nextUid: nextUid + 1000, identifierStyle: 'Capitalize', toc: [], worldLayout: 'Free',
    worldGridWidth: 256, worldGridHeight: 256, defaultLevelWidth: 256, defaultLevelHeight: 256, defaultPivotX: 0, defaultPivotY: 0, defaultGridSize: T,
    defaultEntityWidth: T, defaultEntityHeight: T, bgColor: '#40465B', defaultLevelBgColor: '#696A79', minifyJson: false, externalLevels: false, exportTiled: false,
    simplifiedExport: false, imageExportMode: 'None', exportLevelBg: true, pngFilePattern: null, backupOnSave: false, backupLimit: 10, backupRelPath: null,
    levelNamePattern: 'Level_%idx', tutorialDesc: null, customCommands: [], flags: [],
    defs: defsJson, levels, worlds: [], dummyWorldIid: iid('tropa/world'),
  };
}

// ---------- запись: как LDtk (табуляции, короткие массивы в строку), сетка — по строке на ряд ----------
const isRows = (v: unknown): v is Rows => typeof v === 'object' && v !== null && 'rows' in v;
export function serialize(v: Json, ind = ''): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (isRows(v)) {
    const inner = ind + '\t';
    return '[\n' + (v as Rows).rows.map((r) => inner + r.join(',')).join(',\n') + '\n' + ind + ']';
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every((x) => x === null || typeof x !== 'object')) return '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
    const inner = ind + '\t';
    return '[\n' + v.map((x) => inner + serialize(x, inner)).join(',\n') + '\n' + ind + ']';
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  const inner = ind + '\t';
  return '{\n' + keys.map((k) => `${inner}${JSON.stringify(k)}: ${serialize(v[k]!, inner)}`).join(',\n') + '\n' + ind + '}';
}

/** Готовый текст файла levels/tropa.ldtk. */
export function projectText(): string { return serialize(buildProject()) + '\n'; }

/** Имя файла проекта в папке levels/. */
export const PROJECT_FILE = 'tropa.ldtk';

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  const i = process.argv.indexOf('--out');
  const out = resolve(i > 0 ? process.argv[i + 1]! : join(dirname(self), '..', 'levels'));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, PROJECT_FILE), projectText());
  console.log(`Записано: ${join(out, PROJECT_FILE)} (уровней: ${projectLevels().length})`);
}
