// Тренировка боссов на данных: запуск связки по номеру и кадровые данные (атака, кадр, часть, тип удара).
import { describe, expect, it } from 'vitest';
import { frameInfo } from '../../src/core/boss/exec';
import { frameLine, trainChain } from '../../src/core/training';
import { feedInput } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';

describe('тренировка: связка по запросу и кадровые данные', () => {
  it('запуск связки сразу, кадры идут замах → удар → восстановление с типом удара', () => {
    const w = new World({ seed: 3, mode: 'bosstest', boss: 'dummy', players: 1, train: true });
    const b = w.bosses[0]!, p = w.players[0]!;
    for (let i = 0; i < 125; i++) { p.x = b.x + b.w + 300; feedInput(w, [{}]); w.tick(); } // вступление позади
    expect(frameInfo(b)).toBeNull(); expect(frameLine(w)).toBeNull();
    expect(trainChain(w, 0)).toBe(true); // c_combo: взмах → выпад
    w.tick();
    const seen = new Set<string>();
    let line = '';
    for (let i = 0; i < 160; i++) {
      p.x = b.x + b.w + 300; w.tick();
      const f = frameInfo(b); if (!f) continue;
      seen.add(f.attack + ':' + f.part); line ||= frameLine(w) ?? '';
      if (f.part === 'tell') expect(f.kind).toBe('parry');
    }
    expect([...seen]).toEqual(expect.arrayContaining(['Взмах:tell', 'Взмах:active', 'Взмах:recover', 'Выпад:tell']));
    expect(line).toMatch(/Взмах · замах \d+\/\d+ · можно отбить, до удара \d+ кадр\./);
  });
  it('без тренировки или не для босса на данных — ничего не делает', () => {
    const w = new World({ seed: 3, mode: 'bosstest', boss: 'dummy', players: 1 });
    expect(trainChain(w, 0)).toBe(false);
    const m = new World({ seed: 3, mode: 'bosstest', boss: 'misha', players: 1, train: true });
    expect(trainChain(m, 0)).toBe(false); expect(frameLine(m)).toBeNull();
  });
});
