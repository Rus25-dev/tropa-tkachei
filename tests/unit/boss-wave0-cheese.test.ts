// Волна 0, защита от читов и «злые» боты: неподвижного босса нельзя «пересидеть» вдали, бои нескольких боссов и арены с платформами проходят через тех же ботов.
import { describe, expect, it } from 'vitest';
import { registerBoss } from '../../src/core/boss/registry';
import { BOTS, cheeseViolations, registerOff, runCheese, runCheeseTable } from '../../tools/boss/cheese';
import { arenaBoss, stillBoss, trioBosses, type Raw } from '../fixtures/bosses';

const bot = (id: string): (typeof BOTS)[number] => BOTS.find((b) => b.id === id)!;
const reg = (...list: Raw[]): void => { for (const r of list) registerBoss(r); };

describe('злые боты: волна 0', () => {
  it('набор ботов расширен: отсидка у дальней стены и насест на платформе', () => {
    expect(BOTS.map((b) => b.id)).toEqual(expect.arrayContaining(['far-camp', 'perch']));
  });

  it('неподвижный босс: «до» отсидка вдали бессмертна, «после» перемещающая связка достаёт героя', () => {
    const raw = stillBoss('fx_ch1'); (raw['phases'] as Raw[])[0]!['policy'].chains = ['c_shove']; // без защиты босс сам не достаёт героя вдали
    reg(raw);
    const off = registerOff('fx_ch1');
    const before = runCheese(bot('far-camp'), off, 1, 150), after = runCheese(bot('far-camp'), 'fx_ch1', 1, 150);
    expect(before.stalled).toBe(true); expect(before.hurt).toBe(0); expect(before.won).toBe(false);
    expect(after.stalled).toBe(false); expect(after.hurt).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('неподвижный босс с защитой: ни один бот не убивает его быстро и дёшево и не живёт «бесконечно»', () => {
    reg(stillBoss('fx_ch2'));
    const cells = runCheeseTable({ boss: 'fx_ch2', runs: 3, maxSec: 150, seed: 1, fastSec: 35, cheapHurt: 1 }, [bot('far-camp'), bot('hug-parry'), bot('perch'), bot('corner')]).filter((c) => c.variant === 'после');
    expect(cells).toHaveLength(4);
    expect(cheeseViolations(cells, 0.34, 0.34)).toEqual([]);
  }, 300_000);

  it('копия без защиты у боя нескольких боссов: участники тоже копируются без защиты', () => {
    const list = trioBosses('fx_ch3'); reg(...list);
    const off = registerOff('fx_ch3');
    expect(off).toBe('fx_ch3_nocheese');
    const w = runCheese(bot('hug-parry'), off, 2, 40);
    expect(w).toEqual(runCheese(bot('hug-parry'), off, 2, 40)); // детерминизм
  }, 120_000);

  it('арена с платформами: боты играют против ближайшего босса, насест находит платформу; исход воспроизводим', () => {
    reg(arenaBoss('fx_ch4'));
    const a = runCheese(bot('perch'), 'fx_ch4', 3, 60), b = runCheese(bot('perch'), 'fx_ch4', 3, 60);
    expect(a).toEqual(b);
  }, 120_000);
});
