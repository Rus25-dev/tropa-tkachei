// Подключаемое содержимое (src/content, src/view/content): автообнаружение, порядок и полнота описаний.
import { describe, expect, it } from 'vitest';
import '../../src/content';
import { WEAPONS, weaponReg } from '../../src/core/weapons';
import { Registry } from '../../src/core/plugin/registry';
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
