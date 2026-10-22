// Волна 0, прогон sim: фикстуры (трансформация, арена, дирижёр, неподвижный с существами) выдерживают долгий бой случайным вводом на одном и двух героях,
// без исключений и с одинаковым исходом при повторе (детерминизм ядра: ГСЧ, расписания, существа).
import { describe, expect, it } from 'vitest';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { outcome } from '../../src/core/journal';
import { registerBoss } from '../../src/core/boss/registry';
import { World } from '../../src/core/world';
import { arenaBoss, morphBoss, silentBoss, stillBoss, trioBosses, type Raw } from '../fixtures/bosses';

const CASES: [string, Raw[]][] = [
  ['fx_morph', [morphBoss('fx_sm1')]], ['fx_silent', [silentBoss('fx_sm2')]], ['fx_arena', [arenaBoss('fx_sm3')]],
  ['fx_trio', trioBosses('fx_sm4')], ['fx_pool', trioBosses('fx_sm5', true)], ['fx_still', [stillBoss('fx_sm6')]],
];

function play(list: Raw[], seed: number, players: number, frames: number): string {
  for (const r of list) registerBoss(r);
  const w = new World({ seed, mode: 'bosstest', boss: list[0]!['id'] as string, players });
  const fz = makeFuzzer(w, seed);
  for (let i = 0; i < frames; i++) { feedInput(w, w.players.map((p) => fz(p.i))); w.tick(); if (w.won) break; }
  return JSON.stringify([outcome(w), w.arena ? w.arena.ents.map((e) => [e.shown, e.tx, e.ty, e.t]) : null, w.cond, w.enemies.filter((e) => e['m']).length]);
}

describe('прогон случайным вводом', () => {
  for (const [name, list] of CASES) {
    it(`${name}: 12000 тиков, 1 и 2 героя, повтор даёт то же`, () => {
      for (const players of [1, 2]) {
        const a = play(list, 3, players, 12_000), b = play(list, 3, players, 12_000);
        expect(b, `${name}, героев ${players}`).toBe(a);
        expect(play(list, 4, players, 3_000)).not.toBe(play(list, 5, players, 3_000));
      }
    });
  }
});
