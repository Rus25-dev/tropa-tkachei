// Бот на ядре v2: детерминизм по зерну, воркеры = один поток, статистика, баланс.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyBalanceOverride, BAL, P } from '../../src/core/balance';
import { playTtrec } from '../../src/core/ttrec';
import { runFight, type FightJob } from '../../tools/bot/fight';
import { runInline, runPool } from '../../tools/bot/pool';
import { bootstrapCI, mean, median, meanCI, wilson } from '../../tools/bot/stats';
import { summarize, tableJobs } from '../../tools/bot/table';

const root = join(__dirname, '../..');
const base: FightJob = { boss: 'misha2', skill: 0.6, players: 1, seed: 7, maxSec: 30 };

describe('бот: детерминизм', () => {
  it('одно зерно — один и тот же бой (результат и журнал ввода)', () => {
    const a = runFight({ ...base, record: true }), b = runFight({ ...base, record: true });
    expect(b.ticks).toBe(a.ticks);
    expect(JSON.stringify(b.ttrec!.journal)).toBe(JSON.stringify(a.ttrec!.journal));
    expect({ ...b, ttrec: undefined }).toEqual({ ...a, ttrec: undefined });
  }, 120_000);

  it('другое зерно — другой бой', () => {
    const a = runFight({ ...base, record: true }), b = runFight({ ...base, seed: 8, record: true });
    expect(JSON.stringify(b.ttrec!.journal.segs[0]!.rle)).not.toBe(JSON.stringify(a.ttrec!.journal.segs[0]!.rle));
  }, 120_000);

  it('мастерство меняет поведение: слабый бот чаще ошибается', () => {
    const lo = runFight({ ...base, skill: 0.2, record: true }), hi = runFight({ ...base, skill: 0.95, record: true });
    expect(JSON.stringify(lo.ttrec!.journal.segs[0]!.rle)).not.toBe(JSON.stringify(hi.ttrec!.journal.segs[0]!.rle));
  }, 120_000);

  it('запись боя воспроизводится ядром в тот же исход (журнал → состояние)', () => {
    const r = runFight({ ...base, skill: 0.9, record: true });
    const p = playTtrec(r.ttrec!);
    expect(p.result.ok).toBe(true);
    expect(p.match).toBe(true);
  }, 120_000);
});

describe('бот: пул воркеров', () => {
  it('воркеры дают те же числа, что один поток', async () => {
    const jobs: FightJob[] = [0.2, 0.3, 0.5, 0.2, 0.4, 0.3].map((skill, i) => ({ boss: i % 2 ? 'vladik2' : 'misha2', skill, players: 1, seed: 100 + i * 13, maxSec: 60 }));
    const one = runInline(jobs);
    const many = await runPool(jobs, { workers: 3, execArgv: ['--import', 'tsx', '--import', pathToFileURL(join(root, 'tools/ldtk-register.mjs')).href] });
    expect(many).toEqual(one);
    expect(JSON.stringify(summarize(jobs, many))).toBe(JSON.stringify(summarize(jobs, one)));
  }, 240_000);
});

describe('бот: таблица и статистика', () => {
  it('интервал Уилсона', () => {
    const [l0, h0] = wilson(0, 10); expect(l0).toBe(0); expect(h0).toBeCloseTo(0.2775, 3);
    const [l5, h5] = wilson(5, 10); expect(l5).toBeCloseTo(0.2366, 3); expect(h5).toBeCloseTo(0.7634, 3);
    const [l, h] = wilson(190, 200); expect(l).toBeGreaterThan(0.91); expect(h).toBeLessThan(0.98);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
  it('нормальный и бутстрэп-интервалы среднего: содержат среднее, воспроизводимы', () => {
    const a = Array.from({ length: 60 }, (_, i) => 80 + (i % 7) * 5 + (i % 3));
    const m = mean(a), [nl, nh] = meanCI(a), [bl, bh] = bootstrapCI(a);
    expect(nl).toBeLessThan(m); expect(nh).toBeGreaterThan(m); expect(bl).toBeLessThan(m); expect(bh).toBeGreaterThan(m);
    expect(bootstrapCI(a)).toEqual([bl, bh]);
    expect(median([3, 1, 2])).toBe(2);
  });
  it('задания таблицы: зёрна как в v1.8, порядок боссов и мастерства', () => {
    const jobs = tableJobs({ bosses: ['misha2', 'tima2'], skills: [0.3, 0.6], fights: 2, players: 1, maxSec: 240, seed: 1 });
    expect(jobs).toHaveLength(8);
    expect(jobs[0]).toMatchObject({ boss: 'misha2', skill: 0.3, seed: 1 + 30 });
    expect(jobs[1]!.seed).toBe(1 + 13 + 30);
  });
});

describe('баланс: переопределение для инструментов', () => {
  it('схема отвергает лишние и неверные значения', () => {
    expect(() => applyBalanceOverride({ P: { NOPE: 1 } })).toThrow(/неизвестный ключ/);
    expect(() => applyBalanceOverride({ P: { G: 'x' } })).toThrow(/число/);
    expect(() => applyBalanceOverride({ BAL: { hp: { misha: [1] } } })).toThrow(/массив из 2/);
  });
  it('переопределение меняет бой и откатывается обратно', () => {
    const was = BAL.silkEvery, g = P.G, job = { ...base, skill: 0.95, maxSec: 30 };
    const normal = runFight(job);
    applyBalanceOverride({ BAL: { silkEvery: 1 } });
    const changed = runFight(job);
    applyBalanceOverride({ BAL: { silkEvery: was } });
    expect(P.G).toBe(g);
    expect(BAL.silkEvery).toBe(was);
    expect(changed.sec === normal.sec && changed.won === normal.won && changed.dmg === normal.dmg).toBe(false);
    expect(runFight(job).sec).toBe(normal.sec);
  }, 300_000);
});
