import { describe, expect, it } from 'vitest';
import { vesselPick, VESSEL_CHOICES, type VesselMemory } from '../../src/core/boss/vessel-policy';
import { polygonHitsRect } from '../../src/core/hit';

const fresh = (): VesselMemory => ({ counts: {}, missed: {} });
describe('оригинальная политика Сосуда', () => {
  it('веса третьей фазы относительные, сумма равна 1.2', () => {
    expect(VESSEL_CHOICES[2]!.reduce((n, r) => n + r.weight, 0)).toBeCloseTo(1.2);
  });
  it('не допускает третий повтор и форсирует давно пропущенное событие', () => {
    const table = VESSEL_CHOICES[0]!, available = table.map((r) => r.chain), mem = fresh();
    expect(vesselPick(table, mem, available, () => 0)).toBe('c_a3');
    expect(vesselPick(table, mem, available, () => 0)).toBe('c_a3');
    expect(vesselPick(table, mem, available, () => 0)).not.toBe('c_a3');
    mem.missed['c_daggers'] = 5;
    expect(vesselPick(table, mem, available, () => 0)).toBe('c_daggers');
  });
  it('при нескольких просроченных событиях берёт последнее и уважает условия', () => {
    const table = VESSEL_CHOICES[0]!, mem = fresh();
    for (const r of table) mem.missed[r.chain] = 99;
    expect(vesselPick(table, mem, ['c_a3', 'c_pillars'], () => 0)).toBe('c_pillars');
    expect(vesselPick(table, mem, [], () => 0)).toBeNull();
  });
  it('форсирование тоже расходует RNG и сбрасывает серии остальных атак', () => {
    const table = VESSEL_CHOICES[0]!, mem = fresh(); let draws = 0;
    mem.missed['c_daggers'] = 5; mem.counts['c_a3'] = 2;
    expect(vesselPick(table, mem, table.map((r) => r.chain), () => { draws++; return 0; })).toBe('c_daggers');
    expect(draws).toBe(1); expect(mem.counts['c_a3']).toBe(0);
    expect(mem.counts['c_daggers']).toBe(1); expect(mem.missed['c_daggers']).toBe(0);
  });
  it('в узкой вершине столпа нет прямоугольных невидимых углов', () => {
    const points = [{ x: 0, y: 100 }, { x: 20, y: 100 }, { x: 10, y: 0 }];
    expect(polygonHitsRect(points, { x: 1, y: 1, w: 3, h: 3 })).toBe(false);
    expect(polygonHitsRect(points, { x: 8, y: 40, w: 4, h: 10 })).toBe(true);
    expect(polygonHitsRect(points, { x: -5, y: 80, w: 30, h: 5 })).toBe(true);
  });
});
