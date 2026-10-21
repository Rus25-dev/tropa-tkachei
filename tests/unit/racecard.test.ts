// Картинка итогов гонки: босс-раш подписывает отрезки именами боссов, название дисциплины и Эло берутся из архива.
import { describe, expect, it } from 'vitest';
import { drawCard } from '../../src/ui/racecard';
import type { RaceResult } from '../../src/net/racecommon';

const ctx = (): { g: CanvasRenderingContext2D; texts: string[] } => {
  const texts: string[] = [];
  const g = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k === 'fillText' ? (s: string) => { texts.push(s); } : k === 'measureText' ? (s: string) => ({ width: s.length * 10 }) : k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { g, texts };
};
const race = (disc: string): RaceResult => ({
  id: 'c1', date: '2026-03-01T10:00:00Z', version: '2.3.0', discipline: disc, settings: { cat: disc, easy: false, speed: 100 }, seed: 1,
  players: [{ seat: 1, name: 'Ива', dnf: false, time: 130000, finalTime: 130000, igt: 129000, deaths: 0, stats: null, splits: [20000, 60000, 80000, 130000], eloBefore: 1000, eloAfter: 1020, place: 1 },
    { seat: 2, name: 'Ярь', dnf: false, time: 140000, finalTime: 140000, igt: 139000, deaths: 1, stats: null, splits: [25000, 50000, 90000, 140000], eloBefore: 1000, eloAfter: 980, place: 2 }],
  winner: 'Ива', winnerSeat: 1, awarded: false, gap: -10000, goAt: 0, pauseMs: 0, events: [],
});

describe('картинка итогов', () => {
  it('босс-раш: название дисциплины, имена боссов у отрезков, Эло', () => {
    const { g, texts } = ctx(); drawCard(g, race('boss'));
    expect(texts.some((t) => t.includes('Босс-раш'))).toBe(true); expect(texts).toContain('Корнематка: 0:20.00'); expect(texts).toContain('Тима: 2:10.00');
    expect(texts).toContain('Эло 1000 → 1020'); expect(texts).toContain('Победил Ива');
  });
  it('«Тропа целиком»: отрезки подписаны главами', () => {
    const { g, texts } = ctx(); drawCard(g, race('trail'));
    expect(texts.some((t) => t.includes('Тропа целиком'))).toBe(true); expect(texts).toContain('Гл. I: 0:20.00'); expect(texts).toContain('Гл. IV: 2:10.00');
  });
});
