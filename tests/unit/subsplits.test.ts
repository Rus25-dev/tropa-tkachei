// Подсплиты забега (2.2): выход из коридора, скамья, начало боя, фазы 2 и 3, смерть босса. Это только наблюдение за миром: на золотые записи
// влиять не должны, а при повторном воспроизведении журнала получаются те же значения.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../../src/core/balance';
import { bossDef } from '../../src/core/boss/registry';
import { replayJournal } from '../../src/core/replay';
import type { SubSplit } from '../../src/core/racestats';

const load = (n: string): { journal: Parameters<typeof replayJournal>[0]; players?: { name: string; journal: Parameters<typeof replayJournal>[0] }[] } => JSON.parse(readFileSync(join(__dirname, '../golden/v2', n), 'utf8'));
const subsOf = (j: Parameters<typeof replayJournal>[0]): { subs: SubSplit[]; splits: { igt: number }[] } => {
  const r = replayJournal(j); if (!r.ok) throw new Error(r.why);
  return { subs: JSON.parse(JSON.stringify(r.sr!.stats!.subs)) as SubSplit[], splits: r.sr!.splits };
};

describe('подсплиты в ядре', () => {
  it('босс-раш: у каждого босса начало боя, фазы 2 и 3 и смерть босса по порядку; смерть босса совпадает со сплитом', () => {
    const { subs, splits } = subsOf(load('speedrun-boss-rush.json').journal);
    for (let ch = 1; ch <= 4; ch++) {
      const mine = subs.filter((s) => s.ch === ch), phases = bossDef(CHAPTERS[ch]!.boss)!.phases.length;
      expect(mine.map((s) => s.k)).toEqual(['fight', ...(['ph2', 'ph3'] as const).slice(0, phases - 1), 'kill']); // у боссов глав две или три фазы
      for (let i = 1; i < mine.length; i++) expect(mine[i]!.igt).toBeGreaterThanOrEqual(mine[i - 1]!.igt);
      expect(mine[mine.length - 1]!.igt).toBe(splits[ch - 1]!.igt);
    }
    expect(subs.some((s) => s.k === 'exit' || s.k === 'bench')).toBe(false); // в босс-раше нет ни коридоров, ни скамей
  });
  it('повторное воспроизведение даёт те же подсплиты', () => {
    const j = load('speedrun-boss-rush.json').journal;
    expect(subsOf(j).subs).toEqual(subsOf(j).subs);
  });
  it('«Тропа целиком» (гонка): выход из коридора в каждой главе, по одному разу', () => {
    for (const p of load('race-b1.json').players!) {
      const { subs } = subsOf(p.journal);
      expect(subs.filter((s) => s.k === 'exit').map((s) => s.ch)).toEqual([1, 2, 3, 4]);
      expect(new Set(subs.map((s) => s.ch + s.k)).size).toBe(subs.length);
    }
  });
});

describe('итоги боёв с боссами (2.3)', () => {
  it('босс-раш: по записи на каждого босса — урон, отбивы, смерти и время боя; сумма совпадает со счётчиками забега', () => {
    const r = replayJournal(load('speedrun-boss-rush.json').journal); if (!r.ok) throw new Error(r.why);
    const S = r.sr!.stats!, b = S.bosses;
    expect(b.map((x) => x.ch)).toEqual([1, 2, 3, 4]);
    expect(b.reduce((a, x) => a + x.parries, 0)).toBe(S.parries); expect(b.reduce((a, x) => a + x.deaths, 0)).toBe(r.sr!.deaths);
    // «смерть босса» записывается внутри убивающего удара, до того как его урон попал в общий счётчик: последний удар забега остаётся за скобками
    expect(S.bossDmg - Math.round(b.reduce((a, x) => a + x.dmg, 0) * 10) / 10).toBeLessThanOrEqual(1.01); expect(b.every((x) => x.dmg > 0 && x.fight > 1000)).toBe(true);
  });
});
