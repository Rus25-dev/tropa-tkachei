// «Дуэль ткачей»: чистые функции графика погони и таблицы фаз (src/net/raceduel.ts).
import { describe, expect, it } from 'vitest';
import { applyVeto, newSeries, vetoNow } from '../../src/core/duel';
import { bossName, chaseEnd, chaseLead, fracAt, lastPhaseDiff, modsLine, phaseRows, thin, vetoLines, type ChasePt } from '../../src/net/raceduel';
import type { RoomPlayer } from '../../src/net/racecommon';

const A: ChasePt[] = [[0, 0], [10000, 200], [20000, 600], [30000, 1000]], B: ChasePt[] = [[0, 0], [10000, 100], [20000, 300]];
const pl = (subs: { ch: number; k: string; rta: number }[]): RoomPlayer => ({ seat: 1, name: 'x', ready: true, loaded: true, online: true, rtt: 1, fin: null, dnf: false, sp: 0, splits: [], restored: 0, subs });

describe('график погони', () => {
  it('доля снятого здоровья в момент t: линейно между точками, до первой — по ней, после последней — последнее значение', () => {
    expect(fracAt(A, 5000)).toBeCloseTo(0.1, 5); expect(fracAt(A, 15000)).toBeCloseTo(0.4, 5); expect(fracAt(A, 99000)).toBe(1); expect(fracAt(A, -5)).toBe(0); expect(fracAt(undefined, 1)).toBe(0); expect(fracAt([], 1)).toBe(0);
    expect(fracAt([[1000, 500]], 0)).toBe(0.5);
  });
  it('разница в процентных пунктах: плюс — первый снял больше; конец графика — самая поздняя точка', () => {
    expect(chaseLead(A, B, 20000)).toBe(30); expect(chaseLead(B, A, 20000)).toBe(-30); expect(chaseLead(A, undefined, 10000)).toBe(20);
    expect(chaseEnd(A, B)).toBe(30000); expect(chaseEnd(undefined, undefined)).toBe(0);
  });
  it('облегчение ряда сохраняет первую и последнюю точки и число не больше заданного', () => {
    const long: ChasePt[] = Array.from({ length: 1000 }, (_, i) => [i * 250, i]);
    const t = thin(long, 100); expect(t.length).toBe(100); expect(t[0]).toEqual(long[0]); expect(t[99]).toEqual(long[999]); expect(thin(A, 100)).toEqual(A);
  });
});

describe('разница к фазам', () => {
  it('начало боя, фазы 2 и 3 и смерть босса: время каждого и разница (минус — первый быстрее)', () => {
    const rows = phaseRows(pl([{ ch: 3, k: 'fight', rta: 3000 }, { ch: 3, k: 'ph2', rta: 20000 }, { ch: 2, k: 'ph3', rta: 1 }]), pl([{ ch: 3, k: 'fight', rta: 3500 }, { ch: 3, k: 'ph2', rta: 19000 }]), 3);
    expect(rows.map((r) => [r.k, r.a, r.b, r.d])).toEqual([['fight', 3000, 3500, -500], ['ph2', 20000, 19000, 1000], ['ph3', null, null, null], ['kill', null, null, null]]);
    expect(lastPhaseDiff(rows)!.k).toBe('ph2'); expect(lastPhaseDiff(phaseRows(undefined, undefined, 1))).toBeNull();
  });
});

describe('подписи', () => {
  it('босс, модификаторы, журнал бан/пика по ходам с решающим', () => {
    expect(bossName('vladik2')).toBe('Владик Скрипка'); expect(bossName(null)).toBe('—'); expect(modsLine([])).toBe('без модификаторов'); expect(modsLine(['mirror', 'blitz'])).toBe('Зеркало · Блиц +20 %');
    let s = newSeries(3, 2);
    for (const b of ['penitent', 'misha2', 'vladik2'] as const) { const r = applyVeto(s, vetoNow(s)!.side, b); if (!r.ok) throw new Error(r.why); s = r.s; }
    expect(vetoLines(s).map((l) => [l.kind, l.boss])).toEqual([['ban', 'penitent'], ['pick', 'misha2'], ['pick', 'vladik2'], ['decider', 'tima2']]);
  });
});
