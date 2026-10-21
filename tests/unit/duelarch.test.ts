// «Дуэль ткачей» в архиве: серия — несколько записей раундов с общим seriesId; Эло, файл races.json, картинка итогов и страница рейтинга.
import { describe, expect, it } from 'vitest';
import { computeElo, ELO_ALL } from '../../src/core/elo';
import { mergeRaces, parseRaces } from '../../src/net/racesfile';
import { mergeNames, racesJson, type RaceResult } from '../../src/net/racecommon';
import { disciplines, duelLabel, duelMods, playerProfile, readRatingText, seriesRounds, splitRows } from '../../src/rating/model';
import { drawCard } from '../../src/ui/racecard';
import { duelArchive } from './helpers/duelarch';

const ctx = (): { g: CanvasRenderingContext2D; texts: string[] } => {
  const texts: string[] = [];
  const g = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k === 'fillText' ? (s: string) => { texts.push(s); } : k === 'measureText' ? (s: string) => ({ width: s.length * 10 }) : k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { g, texts };
};

describe('Эло дуэли: серия — одна партия', () => {
  const arch = duelArchive();
  it('промежуточные раунды Эло не меняют, последний раунд даёт одну партию по победителю серии; дисциплина duel отдельная', () => {
    const t = computeElo(arch);
    expect(t.perRace['d1']).toBeUndefined(); expect(t.perRace['d2']).toBeUndefined(); expect(t.perRace['d3']).toBeDefined();
    expect(t.byDisc['duel']!.map((x) => [x.name, x.games, x.wins, x.losses])).toEqual([['Ива', 1, 1, 0], ['Ярь', 1, 0, 1]]);
    expect(t.byDisc['duel']![0]!.rating).toBe(1020); expect(t.byDisc['duel']![1]!.rating).toBe(980);
    expect(t.byDisc['trail']!.length).toBe(2); expect(t.all.find((x) => x.name === 'Ива')!.games).toBe(2); // общий рейтинг: серия + гонка
  });
  it('серия без последней записи (прервана) в Эло не попадает', () => {
    const t = computeElo(arch.slice(0, 2));
    expect(t.byDisc['duel']).toBeUndefined(); expect(t.all).toEqual([]);
  });
  it('старые записи без seriesId и duel считаются как раньше', () => {
    const old = arch[3]!; const t = computeElo([old]);
    expect(t.perRace[old.id]).toBeDefined(); expect(t.byDisc['trail']![0]!.name).toBe('Ива');
  });
});

describe('races.json с сериями', () => {
  const arch = duelArchive();
  it('записывается и читается обратно; необязательные поля сохраняются', () => {
    const r = parseRaces(racesJson(arch, '2.4.0', '2026-04-02T00:00:00.000Z'));
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.races.length).toBe(4); expect(r.races[2]!.seriesId).toBe('ser1'); expect(r.races[2]!.duel).toMatchObject({ fmt: 3, boss: 'tima', final: true, seriesWinner: 'Ива', score: [2, 1] });
    expect(r.races[0]!.players[1]!.duel).toMatchObject({ kill: false, frac: 0.72 });
    expect(r.races[3]!.seriesId).toBeUndefined(); // обычная запись без полей серии
  });
  it('файл прежних версий без полей серии читается; повреждённое поле дуэли отклоняется понятным сообщением', () => {
    const old = JSON.parse(racesJson([arch[3]!], '2.3.0', 'x')) as { races: Record<string, unknown>[] };
    expect(parseRaces(JSON.stringify(old)).ok).toBe(true);
    const bad = JSON.parse(racesJson(arch, '2.4.0', 'x')) as { races: { duel?: { fmt: number } }[] };
    bad.races[0]!.duel!.fmt = 4;
    const r = parseRaces(JSON.stringify(bad)); expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toContain('duel');
  });
  it('слияние архивов добавляет раунды серии по id и не дублирует', () => {
    const m1 = mergeRaces(arch.slice(0, 2), arch), m2 = mergeRaces(m1.races, arch);
    expect(m1.added).toBe(2); expect(m2.added).toBe(0); expect(m2.races.map((r) => r.id).sort()).toEqual(['d1', 'd2', 'd3', 't1']);
  });
});

describe('объединение игроков в архиве', () => {
  it('имя меняется и у игрока, и у победителя раунда, и у победителя серии', () => {
    const a = duelArchive(), n = mergeNames(a, 'Ива', 'Ива К.');
    expect(n).toBeGreaterThan(3); expect(a[0]!.players[0]!.name).toBe('Ива К.'); expect(a[0]!.winner).toBe('Ива К.'); expect(a[2]!.duel!.seriesWinner).toBe('Ива К.');
    expect(computeElo(a).byDisc['duel']![0]!.name).toBe('Ива К.'); // Эло серии по-прежнему считается
  });
});

describe('картинка итогов дуэли', () => {
  const arch = duelArchive();
  it('раунд: босс, счёт, модификаторы, «босс убит» и доля снятого здоровья у проигравшего', () => {
    const { g, texts } = ctx(); drawCard(g, arch[0]!);
    expect(texts.some((t) => t.includes('Дуэль ткачей'))).toBe(true); expect(texts).toContain('Раунд: Ива');
    expect(texts.some((t) => t.includes('Bo3') && t.includes('раунд 1') && t.includes('Миша Додик') && t.includes('1:0') && t.includes('Зеркало'))).toBe(true);
    expect(texts).toContain('снято 72 %'); expect(texts).toContain('0:47.20'); expect(texts).toContain('босс убит');
  });
  it('последний раунд серии: заголовок про победителя серии и Эло', () => {
    const { g, texts } = ctx(); drawCard(g, arch[2]!);
    expect(texts).toContain('Серия: победил Ива'); expect(texts.some((t) => t.startsWith('Эло 1000 → 1020'))).toBe(true); expect(texts.some((t) => t.includes('2:1'))).toBe(true);
  });
});

describe('страница рейтинга: серии', () => {
  const data = readRatingText(racesJson(duelArchive(), '2.4.0', 'x'));
  if (data.kind !== 'ok') throw new Error('архив дуэли не читается');
  it('дисциплина «Дуэль ткачей» — отдельная вкладка в порядке игры', () => {
    expect(disciplines(data.tables)).toEqual(['trail', 'duel']);
    expect(data.tables.byDisc['duel']!.length).toBe(2);
  });
  it('подписи раунда и модификаторов; раунды серии по порядку', () => {
    const r2 = data.races.find((r) => r.id === 'd2')!;
    expect(duelLabel(r2)).toBe('Bo3 · раунд 2 · Владик Скрипка'); expect(duelMods(r2)).toBe('Зеркало + Блиц +20 %'); expect(duelLabel(data.races.find((r) => r.id === 't1')!)).toBe('');
    expect(seriesRounds(data.races, r2).map((r) => r.id)).toEqual(['d1', 'd2', 'd3']); expect(seriesRounds(data.races, data.races.find((r) => r.id === 't1')!)).toEqual([]);
  });
  it('сплиты раунда подписаны боссом; профиль считает серию, а не раунды: игр два, лучшие времена только в обычных дисциплинах', () => {
    const rows = splitRows(data.races.find((r) => r.id === 'd1')!); expect(rows.map((x) => x.tag)).toEqual(['Миша Додик']); expect(rows[0]!.cum).toEqual([47200, null]);
    const p = playerProfile(data.races, data.tables, 'Ива')!;
    expect(p.total).toBe(2); expect(p.best.map((b) => b.disc)).toEqual(['trail']); expect(p.streak).toBe(2); // серия и гонка
    expect(p.scopes.find((s) => s.scope === ELO_ALL)!.games).toBe(2); expect(p.scopes.find((s) => s.scope === 'duel')!.games).toBe(1);
    expect(p.h2h.find((o) => o.name === 'Ярь')).toMatchObject({ games: 2, wins: 2 });
    const y = playerProfile(data.races, data.tables, 'Ярь')!; expect(y.streak).toBe(0); expect(y.h2h[0]).toMatchObject({ games: 2, losses: 2 });
  });
});

describe('выбор последней записи не ломает старые', () => {
  it('RaceResult без duel и seriesId — тип допускает', () => {
    const r: RaceResult = duelArchive()[3]!; expect(r.duel).toBeUndefined(); expect(r.round).toBeUndefined();
  });
});
