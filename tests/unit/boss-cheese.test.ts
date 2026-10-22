// Инструмент эксплойтов (tools/boss/cheese.ts): «злые» боты не побеждают манекена быстро и дёшево и не живут «бесконечно» при включённой защите от читов.
// Полную таблицу «до/после» печатает `npm run boss:cheese`, она же — в docs/BOSS_FAIRNESS.md.
import { describe, expect, it } from 'vitest';
import { BOTS, cheeseViolations, runCheese, runCheeseTable, registerOff } from '../../tools/boss/cheese';

describe('эксплойты манекена', () => {
  it('детерминизм: тот же бот и зерно дают тот же исход', () => {
    const bot = BOTS[0]!;
    expect(runCheese(bot, 'dummy', 3, 60)).toEqual(runCheese(bot, 'dummy', 3, 60));
  });
  it('копия босса без защиты регистрируется и отличается только флагом', () => {
    expect(registerOff('dummy')).toBe('dummy_nocheese');
  });
  it('с защитой от читов: ни один бот не убивает босса быстрее 35 с при потерях ≤ 1 и не «живёт бесконечно»', () => {
    const spec = { boss: 'dummy', runs: 8, maxSec: 150, seed: 1, fastSec: 35, cheapHurt: 1 };
    const cells = runCheeseTable(spec).filter((c) => c.variant === 'после');
    expect(cells).toHaveLength(BOTS.length);
    expect(cheeseViolations(cells, 0.25, 0.25)).toEqual([]);
    // быстрее 20 с не убивает никто вообще
    for (const c of cells) if (c.wins) expect(c.killSecMin, c.bot).toBeGreaterThan(20);
  }, 180_000);
});
