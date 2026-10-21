import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ELO_ALL, ELO_START, computeElo, nkey } from '../../src/core/elo';
import { disciplines, eloSeries, parseRoute, playerHref, playerProfile, raceHref, readRatingResponse, readRatingText, routeHash, splitRows, splitTags } from '../../src/rating/model';

const text = readFileSync(new URL('../../data/races.json', import.meta.url), 'utf8');
const ok = (() => { const d = readRatingText(text); if (d.kind !== 'ok') throw new Error('пример races.json не читается'); return d; })();

describe('страница рейтинга: разбор файла', () => {
  it('пример data/races.json читается, Эло совпадает с computeElo по тем же гонкам', () => {
    expect(ok.races.length).toBeGreaterThanOrEqual(6);
    expect(ok.races.length).toBeLessThanOrEqual(8);
    const again = computeElo(ok.races);
    expect(ok.tables.all).toEqual(again.all);
    expect(ok.tables.all.reduce((s, x) => s + x.rating, 0)).toBeGreaterThan(0);
  });
  it('пустой текст и файл без гонок — «пусто»; чужой JSON и не JSON — «ошибка»', () => {
    expect(readRatingText('')).toEqual({ kind: 'empty' });
    expect(readRatingText('  \n')).toEqual({ kind: 'empty' });
    expect(readRatingText(JSON.stringify({ format: 'tropa-tkachei/races', version: 1, races: [] }))).toEqual({ kind: 'empty' });
    expect(readRatingText('{"format":"x"}')).toMatchObject({ kind: 'bad' });
    expect(readRatingText('не json')).toMatchObject({ kind: 'bad', error: expect.stringContaining('JSON') });
  });
  it('ответ сервера: 404 — файла нет, 500 — недоступен, 200 — разбор', () => {
    expect(readRatingResponse(404, '')).toMatchObject({ kind: 'missing' });
    expect(readRatingResponse(500, '')).toMatchObject({ kind: 'missing', reason: expect.stringContaining('500') });
    expect(readRatingResponse(200, text).kind).toBe('ok');
  });
  it('гонки в порядке даты, а порядок в файле не важен', () => {
    const j = JSON.parse(text) as { races: unknown[] }; j.races.reverse();
    const d = readRatingText(JSON.stringify(j));
    expect(d.kind === 'ok' && d.tables.all).toEqual(ok.tables.all);
  });
});

describe('страница рейтинга: маршрутизация', () => {
  it('разбирает хэш и собирает его обратно', () => {
    expect(parseRoute('')).toEqual({ page: 'home', scope: ELO_ALL });
    expect(parseRoute('#/')).toEqual({ page: 'home', scope: ELO_ALL });
    expect(parseRoute('#/disc/boss')).toEqual({ page: 'home', scope: 'boss' });
    expect(parseRoute('#/player/%D0%98%D0%B2%D0%B0')).toEqual({ page: 'player', name: 'Ива' });
    expect(parseRoute('#/race/r-1')).toEqual({ page: 'race', id: 'r-1' });
    expect(parseRoute('#/player/')).toEqual({ page: 'home', scope: ELO_ALL });
    expect(parseRoute('#/что-то')).toEqual({ page: 'home', scope: ELO_ALL });
    for (const r of [{ page: 'player', name: 'Ива Ткачиха/2' }, { page: 'race', id: 'a b' }, { page: 'home', scope: 'duel' }, { page: 'home', scope: ELO_ALL }] as const) expect(parseRoute(routeHash(r))).toEqual(r);
    expect(parseRoute(playerHref('Ярь'))).toEqual({ page: 'player', name: 'Ярь' });
    expect(parseRoute(raceHref('x'))).toEqual({ page: 'race', id: 'x' });
  });
  it('битая процентная запись не роняет разбор', () => {
    expect(parseRoute('#/player/%E0%A4%A')).toEqual({ page: 'player', name: '%E0%A4%A' });
  });
});

describe('страница рейтинга: график Эло', () => {
  const key = nkey('Ива');
  it('ряд начинается с Эло до первой гонки, время строго растёт, последняя точка — текущий рейтинг', () => {
    const s = eloSeries(ok.races, ok.tables, key);
    const mine = ok.races.filter((r) => r.players.some((p) => nkey(p.name) === key)).length;
    expect(s.x.length).toBe(mine + 1); expect(s.y[0]).toBe(ELO_START); expect(s.ids[0]).toBe('');
    for (let i = 1; i < s.x.length; i++) expect(s.x[i]!).toBeGreaterThan(s.x[i - 1]!);
    expect(s.y.at(-1)).toBe(ok.tables.all.find((r) => r.key === key)!.rating);
  });
  it('по дисциплине берутся только её гонки и Эло дисциплины', () => {
    const s = eloSeries(ok.races, ok.tables, key, 'trail');
    expect(s.ids.slice(1).every((id) => ok.races.find((r) => r.id === id)!.discipline === 'trail')).toBe(true);
    expect(s.y.at(-1)).toBe(ok.tables.byDisc['trail']!.find((r) => r.key === key)!.rating);
  });
  it('гонки с одинаковым временем не ломают порядок; неизвестный игрок — одна стартовая точка', () => {
    const r = ok.races[0]!, dup = [r, { ...r, id: r.id + 'z' }];
    const t = computeElo(dup), s = eloSeries(dup, t, nkey(r.players[0]!.name));
    expect(s.x.length).toBe(3); expect(s.x[2]! > s.x[1]!).toBe(true);
    expect(eloSeries(ok.races, ok.tables, 'нетакого').x).toHaveLength(1);
  });
});

describe('страница рейтинга: профиль и разбор гонки', () => {
  it('профиль: рейтинги, рекорды, личные встречи и последние гонки', () => {
    const p = playerProfile(ok.races, ok.tables, ' ива ')!;
    expect(p.name).toBe('Ива'); expect(p.scopes[0]!.scope).toBe(ELO_ALL);
    expect(p.scopes[0]!.rating).toBe(ok.tables.all.find((r) => r.key === 'ива')!.rating);
    expect(p.best.length).toBeGreaterThan(0);
    const trail = p.best.find((b) => b.disc === 'trail')!;
    const times = ok.races.filter((r) => r.discipline === 'trail').flatMap((r) => r.players.filter((x) => nkey(x.name) === 'ива' && !x.dnf).map((x) => x.finalTime!));
    expect(trail.time).toBe(Math.min(...times));
    expect(p.h2h.reduce((s, o) => s + o.games, 0)).toBeGreaterThan(0);
    for (const o of p.h2h) expect(o.wins + o.draws + o.losses).toBe(o.games);
    expect(p.recent.length).toBeLessThanOrEqual(10); expect(p.total).toBe(ok.races.filter((r) => r.players.some((x) => nkey(x.name) === 'ива')).length);
    expect(p.recent[0]!.date >= p.recent.at(-1)!.date).toBe(true);
    expect(playerProfile(ok.races, ok.tables, 'Никто')).toBeNull();
  });
  it('сплиты: отрезки — разности накопленного, разница между игроками; сошедший без значений', () => {
    const r = ok.races.find((x) => x.id === 'r-240901-a1')!, rows = splitRows(r);
    expect(rows.map((x) => x.tag)).toEqual(['Гл. I', 'Гл. II', 'Гл. III', 'Гл. IV']);
    expect(rows[1]!.seg[0]).toBe(r.players[0]!.splits[1]! - r.players[0]!.splits[0]!);
    expect(rows[0]!.dCum).toBe(r.players[0]!.splits[0]! - r.players[1]!.splits[0]!);
    const dnf = splitRows(ok.races.find((x) => x.players.some((p) => p.dnf))!);
    expect(dnf.at(-1)!.cum.includes(null)).toBe(true); expect(dnf.at(-1)!.dCum).toBeNull();
    expect(splitRows(ok.races.find((x) => x.discipline === 'duel')!)).toEqual([]);
  });
  it('дисциплины идут в порядке игры; подписи отрезков для неизвестных — номера', () => {
    expect(disciplines(ok.tables)).toEqual(['trail', 'boss', 'duel']);
    expect(splitTags('zzz', 2)).toEqual(['Отрезок 1', 'Отрезок 2']);
  });
});
