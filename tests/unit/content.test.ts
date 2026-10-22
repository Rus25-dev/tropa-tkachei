// Подключаемое содержимое (src/content, src/view/content): автообнаружение, порядок и полнота описаний.
import { describe, expect, it } from 'vitest';
import '../../src/content';
import { WEAPONS, weaponReg } from '../../src/core/weapons';
import { Registry } from '../../src/core/plugin/registry';
import type { ProjDef } from '../../src/core/proj-kit';
import '../../src/view/content';
import { weaponViewReg } from '../../src/view/content/regs';

describe('реестр содержимого', () => {
  it('порядок задаёт order, а не имя файла; повтор id и netId — ошибка', () => {
    const r = new Registry<{ id: string; order?: number; netId?: number }>('проба');
    r.define({ id: 'b', order: 0, netId: 1 }); r.define({ id: 'a', order: 1 });
    expect(r.ids()).toEqual(['b', 'a']);
    expect(Object.keys(r.record)).toEqual(['b', 'a']);
    expect(() => r.define({ id: 'a' })).toThrow();
    expect(() => r.define({ id: 'c', netId: 1 })).toThrow();
  });
});

describe('оружие', () => {
  it('найдено само, порядок прежний (от него зависят фаззер и золотые записи)', () => {
    expect(Object.keys(WEAPONS)).toEqual(['needle', 'twin', 'sickle', 'mace', 'lance']);
    expect(weaponReg.get('needle')!.unlock).toBe('start');
  });
  it('у каждого оружия есть отрисовка и высота тона заряда', () => {
    for (const id of weaponReg.ids()) { const v = weaponViewReg.get(id); expect(v, id).toBeTruthy(); expect(v!.chargePitch, id).toBeGreaterThan(0); }
  });
});

describe('инструменты и навыки нити', () => {
  it('найдены сами, порядок прежний; сущности со своими кодами на проводе', async () => {
    const { TOOLS } = await import('../../src/core/tools');
    const { toolEntReg, netKindReg } = await import('../../src/core/plugin/regs');
    await import('../../src/core/netplay');
    expect(Object.keys(TOOLS)).toEqual(['throwneedle', 'trap', 'threadbomb', 'spirit', 'dive', 'wraith', 'hook']);
    expect(toolEntReg.ids().map((k) => netKindReg.get(k)!.netId).sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12]);
    expect(netKindReg.byNetId(3)!.id).toBe('bomb');
  });
  it('у каждого инструмента есть значок, у каждой сущности — отрисовка', async () => {
    const { toolReg, toolEntReg } = await import('../../src/core/plugin/regs');
    const { toolViewReg, toolEntView } = await import('../../src/view/content/regs');
    for (const id of toolReg.ids()) expect(toolViewReg.get(id)?.icon, id).toBeTruthy();
    for (const k of toolEntReg.ids()) expect(toolEntView.get(k), k).toBeTruthy();
  });
});

describe('обереги', () => {
  it('найдены сами, порядок прежний (в нём срабатывают хуки)', async () => {
    const { CHARMS, charmsOn } = await import('../../src/core/loadout');
    expect(Object.keys(CHARMS)).toEqual(['sting', 'ember', 'heart', 'swift', 'stride', 'window', 'thorns', 'call', 'hunter']);
    // порядок срабатывания не зависит от того, в каком порядке надеты
    expect(charmsOn({ charms: ['hunter', 'sting'] } as never).map((c) => c.id)).toEqual(['sting', 'hunter']);
  });
});

describe('приёмы', () => {
  it('открываемые приёмы в прежнем порядке, движение нырка — внутренний приём; коды состояний не пересекаются', async () => {
    const { ABILS, KIT_IDS } = await import('../../src/core/kit/abilities');
    const { moveReg } = await import('../../src/core/plugin/regs');
    expect(Object.keys(ABILS)).toEqual(['shadow', 'flash', 'crystal', 'counter']);
    expect(KIT_IDS).toEqual(['shadow', 'flash', 'crystal', 'counter']);
    expect(moveReg.ids()).toEqual(['shadow', 'flash', 'dive', 'crystal', 'counter']);
    const codes = moveReg.list().flatMap((m) => m.codes ?? []);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('у открываемых приёмов есть значок, у каждого кода состояния — эффект', async () => {
    const { abilReg, moveReg } = await import('../../src/core/plugin/regs');
    const { abilityViewReg, kitFxView } = await import('../../src/view/content/regs');
    for (const id of abilReg.ids()) expect(abilityViewReg.get(id)?.icon, id).toBeTruthy();
    for (const c of moveReg.list().flatMap((m) => m.codes ?? [])) expect(kitFxView.get(c), String(c)).toBeTruthy();
  });
});

describe('враги', () => {
  it('все виды из уровней найдены, у «врагов 2» есть состояния для сети, у каждого вида — отрисовка', async () => {
    const { enemyReg } = await import('../../src/core/plugin/regs');
    const { enemyViewReg } = await import('../../src/view/content/regs');
    expect(enemyReg.ids()).toEqual(['crawler', 'gnat', 'beetle', 'spitter', 'shell', 'bat', 'lurker']);
    expect(enemyReg.list().map((d) => d.levelType ?? d.id)).toEqual(['crawler', 'gnat', 'beetle', 'spitter', 'shell', 'bats', 'lurker']);
    for (const d of enemyReg.list()) { if (d.e2) expect(d.states?.length, d.id).toBeGreaterThan(0); expect(enemyViewReg.get(d.id), d.id).toBeTruthy(); }
  });
});

describe('снаряды', () => {
  it('прежние коды на проводе и флаги видов; у каждого вида — отрисовка', async () => {
    const { projReg, netKindReg } = await import('../../src/core/plugin/regs');
    const { projViewReg } = await import('../../src/view/content/regs');
    expect(projReg.list().map((d) => [d.id, d.netId])).toEqual([['spore', 0], ['wave', 1], ['rock', 2], ['bomb', 3], ['clef', 4], ['note', 5], ['echo', 6], ['glob', 7]]);
    for (const d of projReg.list()) { expect(netKindReg.get(d.id)?.netId, d.id).toBe(d.netId); expect(projViewReg.get(d.id), d.id).toBeTruthy(); }
    const ids = (f: (d: ProjDef) => unknown): string[] => projReg.list().filter(f).map((d) => d.id).sort();
    expect(ids((d) => d.persist)).toEqual(['clef', 'echo', 'wave']);
    expect(ids((d) => d.heavy)).toEqual(['echo', 'wave']);
    expect(ids((d) => d.slash)).toEqual(['glob', 'note', 'spore']);
    expect(ids((d) => d.cutAll)).toEqual(['clef', 'rock']);
    expect(ids((d) => d.hero)).toEqual(['bomb']);
    expect(ids((d) => d.data)).toEqual(['glob', 'note', 'rock', 'spore', 'wave']);
  });
  it('все виды снарядов в данных боссов заведены для данных', async () => {
    const { projKindErrs } = await import('../../src/core/boss/schema');
    const { dataBossIds, bossDef } = await import('../../src/core/boss/registry');
    expect(dataBossIds().length).toBeGreaterThan(5);
    for (const id of dataBossIds()) expect(projKindErrs(bossDef(id)), id).toEqual([]);
    expect(projKindErrs({ attacks: [{ spawn: [{ proj: { kind: 'nope' } }] }] })[0]).toMatch(/nope/);
  });
});
