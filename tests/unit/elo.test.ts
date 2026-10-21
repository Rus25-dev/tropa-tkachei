// Рейтинг Эло и файл races.json: формулы, K-фактор, пересчёт с нуля, проверка и слияние файла.
import { describe, expect, it } from 'vitest';
import { computeElo, ELO_START, expected, kFor, winChances, type EloRace } from '../../src/core/elo';
import type { RaceResult } from '../../src/net/racecommon';
import { mergeRaces, parseRaces } from '../../src/net/racesfile';
import { racesJson } from '../../src/net/racecommon';

const race = (i: number, a: string, b: string, winner: string | null, disc = 'trail'): EloRace => ({
  id: 'r' + i, date: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`, discipline: disc, winner, players: [{ name: a }, { name: b }],
});
const full = (r: EloRace): RaceResult => ({
  id: r.id, date: r.date, version: '2.0.0', discipline: r.discipline, settings: { cat: r.discipline, easy: false, speed: 100 }, seed: 1,
  players: r.players.map((p, i) => ({ seat: i + 1, name: p.name, dnf: false, time: 90000 + i * 1000, finalTime: 90000 + i * 1000, igt: 89000, deaths: 0, stats: null, splits: [1, 2, 3, 4].map((k) => k * 20000), eloBefore: null, eloAfter: null, place: i + 1 })),
  winner: r.winner, winnerSeat: 1, awarded: false, gap: 1000, goAt: 0, pauseMs: 0, events: [],
});

describe('Эло', () => {
  it('равные игроки: победитель получает половину K, проигравший теряет столько же', () => {
    const t = computeElo([race(0, 'Ива', 'Ярь', 'Ива')]);
    const c = t.perRace['r0']!.disc;
    expect(c['ива']).toEqual({ before: ELO_START, after: ELO_START + 20 });
    expect(c['ярь']).toEqual({ before: ELO_START, after: ELO_START - 20 });
    expect(t.all.map((x) => x.name)).toEqual(['Ива', 'Ярь']);
  });
  it('ничья между равными ничего не меняет; шанс по формуле', () => {
    const t = computeElo([race(0, 'Ива', 'Ярь', 'draw')]);
    expect(t.all.every((x) => x.rating === ELO_START && x.draws === 1)).toBe(true);
    expect(expected(1000, 1000)).toBeCloseTo(0.5, 6);
    expect(expected(1400, 1000)).toBeCloseTo(0.909, 3);
  });
  it('K = 40 для первых 10 гонок, затем 24', () => {
    expect(kFor(0)).toBe(40); expect(kFor(9)).toBe(40); expect(kFor(10)).toBe(24);
  });
  it('имена без учёта регистра и пробелов — один игрок; дисциплины считаются отдельно, общий — по всем', () => {
    const t = computeElo([race(0, 'Ива', 'Ярь', 'Ива'), race(1, 'ива ', 'ЯРЬ', 'Ива', 'boss'), race(2, 'Ива', 'Ярь', null)]);
    expect(t.all.find((x) => x.key === 'ива')!.games).toBe(2);
    expect(t.byDisc['trail']!.length).toBe(2); expect(t.byDisc['boss']!.length).toBe(2);
    expect(t.perRace['r2']).toBeUndefined(); // без победителя не засчитывается
    expect(t.byDisc['boss']!.find((x) => x.key === 'ива')!.rating).toBe(ELO_START + 20);
  });
  it('пересчёт детерминирован и не зависит от порядка записей в массиве', () => {
    const rs = [race(0, 'А', 'Б', 'А'), race(1, 'Б', 'В', 'В'), race(2, 'А', 'В', 'draw'), race(3, 'Б', 'А', 'Б')];
    expect(computeElo(rs)).toEqual(computeElo(rs.slice().reverse()));
    const sum = computeElo(rs).all.reduce((s, x) => s + x.rating, 0);
    expect(sum).toBe(3 * ELO_START); // Эло сохраняет сумму (при целых округлениях допускаем ±3)
  });
  it('шансы на победу складываются в 100 %', () => {
    const t = computeElo([race(0, 'А', 'Б', 'А'), race(1, 'А', 'Б', 'А')]);
    const [a, b] = winChances(t, 'А', 'Б', 'trail');
    expect(a + b).toBe(100); expect(a).toBeGreaterThan(50);
  });
});

describe('races.json', () => {
  const rs = [full(race(0, 'Ива', 'Ярь', 'Ива')), full(race(1, 'Ива', 'Ярь', 'Ярь'))];
  const text = racesJson(rs, '2.0.0', '2026-01-01T00:00:00Z');
  it('собственный экспорт читается обратно без потерь', () => {
    const r = parseRaces(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.races.map((x) => x.id)).toEqual(['r0', 'r1']);
  });
  it('мусор, чужой формат и битая запись дают понятные ошибки', () => {
    expect(parseRaces('{не json')).toEqual({ ok: false, error: expect.stringContaining('не JSON') });
    expect(parseRaces('{"format":"x"}')).toEqual({ ok: false, error: expect.stringContaining('не архив гонок') });
    const bad = JSON.parse(text); delete bad.races[0].players[0].name;
    const r = parseRaces(JSON.stringify(bad));
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toContain('races.0.players.0.name');
  });
  it('слияние по id не дублирует и сортирует по дате', () => {
    const m = mergeRaces([rs[1]!], rs);
    expect(m.added).toBe(1); expect(m.races.map((x) => x.id)).toEqual(['r0', 'r1']);
  });
});
