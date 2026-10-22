// Подключаемое содержимое (src/content, src/view/content): автообнаружение, порядок и полнота описаний.
import { describe, expect, it } from 'vitest';
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
