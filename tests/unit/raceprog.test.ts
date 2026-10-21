// Ход забега по подсплитам (2.2): личный рекорд и сумма лучших отрезков по архиву, отрыв между игроками, лента кампании, подписи этапа, таблица сравнения,
// а также совместимость races.json: записи без новых полей читаются, с новыми проверяются.
import { describe, expect, it } from 'vitest';
import { cmpRows, dtxt, kindsOf, leadBySubs, leadInfo, personalBest, ribbonPos, stageText, sumOfBest, sumOfBestNow, timeOf } from '../../src/net/raceprog';
import { racesJson, type RaceResult, type RoomPlayer } from '../../src/net/racecommon';
import { parseRaces } from '../../src/net/racesfile';

const row = (name: string, time: number | null, splits: number[], subs?: { ch: number; k: string; rta: number }[]): RaceResult['players'][number] => ({
  seat: 1, name, dnf: time == null, time, finalTime: time, igt: time, deaths: 0, stats: null, splits, eloBefore: null, eloAfter: null, place: 1, ...(subs ? { subs } : {}),
});
const race = (id: string, disc: string, rows: ReturnType<typeof row>[]): RaceResult => ({
  id, date: '2026-02-0' + id.slice(-1) + 'T10:00:00Z', version: '2.2.0', discipline: disc, settings: { cat: disc, easy: false, speed: 100 }, seed: 1,
  players: rows, winner: rows[0]!.name, winnerSeat: 1, awarded: false, gap: 1, goAt: 0, pauseMs: 0, events: [],
});
const rp = (name: string, o: Partial<RoomPlayer>): RoomPlayer => ({ seat: 1, name, ready: true, loaded: true, online: true, rtt: 10, fin: null, dnf: false, sp: 0, splits: [], restored: 0, ...o });

describe('личный рекорд и лучшие отрезки', () => {
  const arch = [
    race('r1', 'trail', [row('Ива', 100_000, [20_000, 50_000, 80_000, 100_000], [{ ch: 1, k: 'fight', rta: 12_000 }])]),
    race('r2', 'trail', [row('ива ', 98_000, [24_000, 48_000, 70_000, 98_000], [{ ch: 1, k: 'fight', rta: 15_000 }])]),
    race('r3', 'boss', [row('Ива', 60_000, [10_000, 25_000, 40_000, 60_000])]),
    race('r4', 'trail', [row('Ива', null, [])]),
  ];
  it('берёт лучший финиш дисциплины (имя без учёта регистра), игнорирует сход и другие дисциплины', () => {
    const pb = personalBest(arch, 'Ива', 'trail')!;
    expect(pb.t).toBe(98_000); expect(pb.sp).toEqual([24_000, 48_000, 70_000, 98_000]); expect(pb.sb['1:fight']).toBe(15_000); expect(pb.sb['3:kill']).toBe(70_000);
    expect(personalBest(arch, 'Ива', 'boss')!.t).toBe(60_000); expect(personalBest(arch, 'Ярь', 'trail')).toBeNull();
  });
  it('лучшие отрезки собираются из разных гонок, сумма лучших быстрее лучшей гонки', () => {
    const pb = personalBest(arch, 'Ива', 'trail')!;
    expect(pb.bs).toEqual([20_000, 24_000, 22_000, 20_000]); // 20 из r1, 24 из r2 (и r1: 30), 22 из r2, 20 из r1 (r2: 28)
    expect(sumOfBest(pb)).toBe(86_000); expect(sumOfBest(pb)!).toBeLessThan(pb.t);
    expect(sumOfBest(null)).toBeNull(); expect(sumOfBest({ ...pb, bs: [1, null, 1, 1] })).toBeNull();
  });
  it('сумма лучших с учётом идущего забега: пройденная глава может улучшить отрезок', () => {
    const pb = personalBest(arch, 'Ива', 'trail')!;
    expect(sumOfBestNow(pb, [15_000])).toBe(81_000); // первый отрезок 15 с вместо 20
    expect(sumOfBestNow(null, [1, 2])).toBeNull();
  });
});

describe('отрыв по подсплитам', () => {
  const A = { subs: [{ ch: 1, k: 'exit', rta: 10_000 }, { ch: 1, k: 'fight', rta: 14_000 }, { ch: 1, k: 'bench', rta: 11_000 }], splits: [] as number[] };
  const B = { subs: [{ ch: 1, k: 'exit', rta: 12_000 }], splits: [] as number[] };
  it('на общей точке — просто разница; скамья в сравнении не участвует', () => {
    expect(leadBySubs('trail', A, { subs: [{ ch: 1, k: 'exit', rta: 12_000 }, { ch: 1, k: 'bench', rta: 99_000 }], splits: [] }, null, null)).toBe(-2000);
  });
  it('первый уже прошёл следующую точку, второй нет: отрыв не меньше, чем время второго после неё', () => {
    const i = leadInfo('trail', A, B, 20_000, 18_000)!;
    expect(i.kind).toBe('a'); expect(i.k).toBe('fight'); expect(i.ms).toBe(14_000 - 18_000); // A прошёл «начало боя» в 14 с, B в 18 с ещё не дошёл: A впереди минимум на 4 с
    expect(leadInfo('trail', B, A, 18_000, 20_000)!.ms).toBe(4000);
    expect(leadBySubs('trail', A, B, null, null)).toBe(-2000); // без часов — по общей точке
  });
  it('сплит главы главнее подсплита «смерть босса»', () => {
    expect(timeOf({ splits: [30_000], subs: [{ ch: 1, k: 'kill', rta: 29_000 }] }, 1, 'kill')).toBe(30_000);
    expect(timeOf({ splits: [], subs: [{ ch: 1, k: 'kill', rta: 29_000 }] }, 1, 'kill')).toBe(29_000);
    expect(leadBySubs('trail', { splits: [30_000] }, { splits: [33_500] }, null, null)).toBe(-3500);
  });
  it('нет общих точек и нет часов — отрыва нет', () => { expect(leadBySubs('trail', { subs: [] }, { subs: [] }, 5, 5)).toBeNull(); });
  it('подпись разницы', () => { expect(dtxt(4200)).toBe('+4.2'); expect(dtxt(-1000)).toBe('−1.0'); expect(dtxt(0)).toBe('±0.0'); expect(dtxt(-65_300)).toBe('−1:05.3'); expect(dtxt(null)).toBe(''); });
});

describe('лента, этап и таблица', () => {
  it('положение на ленте растёт по подсплитам и главам, финиш — край', () => {
    const a = ribbonPos('trail', { subs: [], splits: [] }, undefined), b = ribbonPos('trail', { subs: [{ ch: 1, k: 'exit', rta: 1 }], splits: [] }, undefined);
    const c = ribbonPos('trail', { subs: [{ ch: 1, k: 'exit', rta: 1 }, { ch: 1, k: 'fight', rta: 2 }, { ch: 1, k: 'ph2', rta: 3 }], splits: [] }, undefined);
    const d = ribbonPos('trail', { subs: [], splits: [30_000] }, undefined);
    expect(a).toBe(0); expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b); expect(c).toBeLessThan(0.25); expect(d).toBeGreaterThanOrEqual(0.25); expect(ribbonPos('trail', { fin: {} }, undefined)).toBe(1);
    expect(ribbonPos('trail', { subs: [], splits: [] }, { st: 'arena' })).toBeGreaterThan(0.05);
  });
  it('подпись этапа: коридор, бой с боссом и фаза, лавка, скамья, финиш', () => {
    expect(stageText('trail', { ch: 3, st: 'road' }, [], false)).toBe('Гл. III · коридор');
    expect(stageText('trail', { ch: 3, st: 'arena' }, [{ ch: 3, k: 'exit', rta: 1 }], false)).toBe('Гл. III · перед боем с Владиком');
    expect(stageText('trail', { ch: 3, st: 'arena' }, [{ ch: 3, k: 'fight', rta: 1 }, { ch: 3, k: 'ph2', rta: 2 }], false)).toBe('Гл. III · бой с Владиком, фаза 2');
    expect(stageText('trail', { ch: 2, st: 'road', sh: 1 }, [], false)).toBe('Гл. II · в лавке'); expect(stageText('trail', { ch: 1, st: 'level', sit: 1 }, [], false)).toBe('Гл. I · на скамье');
    expect(stageText('boss', { ch: 2, st: 'arena' }, [{ ch: 2, k: 'fight', rta: 1 }], false)).toBe('Миша · бой'); expect(stageText('trail', undefined, [], true)).toBe('финиш');
  });
  it('в босс-раше нет коридора и скамьи', () => {
    expect(kindsOf('boss')).toEqual(['fight', 'ph2', 'ph3', 'kill']); expect(kindsOf('trail')).toContain('exit');
    expect(cmpRows('boss', undefined, undefined).some((r) => r.k === 'exit' || r.k === 'bench')).toBe(false);
  });
  it('таблица: время, разница между игроками и к личному рекорду', () => {
    const pbA = { t: 100, sp: [20_000], sb: { '1:exit': 9000, '1:kill': 20_000 }, bs: [null, null, null, null] };
    const a = rp('Ива', { subs: [{ ch: 1, k: 'exit', rta: 8000 }], splits: [19_000], pb: pbA }), b = rp('Ярь', { seat: 2, subs: [{ ch: 1, k: 'exit', rta: 11_000 }], splits: [] });
    const rows = cmpRows('trail', a, b), exit = rows.find((r) => r.key === '1:exit')!, kill = rows.find((r) => r.key === '1:kill')!;
    expect(exit).toMatchObject({ a: 8000, b: 11_000, d: -3000, pa: -1000, pb: null }); expect(kill).toMatchObject({ a: 19_000, b: null, d: null, pa: -1000 });
    expect(rows.length).toBe(4 * kindsOf('trail').length);
  });
});

describe('races.json: новые поля 2.2 необязательны', () => {
  const old = race('r1', 'trail', [row('Ива', 100_000, [20_000, 50_000, 80_000, 100_000]), row('Ярь', 101_000, [21_000, 51_000, 81_000, 101_000])]);
  it('старая запись без подсплитов читается', () => {
    const r = parseRaces(racesJson([old], '2.0.0', 'x')); expect(r.ok).toBe(true);
  });
  it('запись с подсплитами, потерями и покупками читается и сохраняет поля', () => {
    const n = race('r2', 'trail', [{ ...row('Ива', 100_000, [1, 2, 3, 4], [{ ch: 1, k: 'exit', rta: 5 }]), lost: 4200, deathList: [{ ch: 1, rta: 3, lost: 4200 }], buys: [{ id: 'dmg', name: 'Острая игла', ch: 1, rta: 9, price: 12 }] }]);
    const r = parseRaces(racesJson([n], '2.2.0', 'x')); expect(r.ok).toBe(true);
    if (r.ok) { const p = r.races[0]!.players[0]!; expect(p.subs).toEqual([{ ch: 1, k: 'exit', rta: 5 }]); expect(p.lost).toBe(4200); expect(p.buys![0]!.name).toBe('Острая игла'); }
  });
  it('испорченные подсплиты дают понятную ошибку с путём к полю', () => {
    const j = JSON.parse(racesJson([race('r3', 'trail', [row('Ива', 1, [1, 2, 3, 4], [{ ch: 1, k: 'exit', rta: 5 }])])], '2.2.0', 'x'));
    j.races[0].players[0].subs[0].rta = 'скоро';
    const r = parseRaces(JSON.stringify(j)); expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toContain('subs');
  });
});
