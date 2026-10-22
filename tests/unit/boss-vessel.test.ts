// «Пустой сосуд» (vessel): чистая дуэль без арены-помех. Проверяем: загрузку и состав, отсутствие сущностей арены и существ,
// детерминизм, фиксированный порядок шагов связок (в том числе «экзамена»), нарастание темпа по фазам, смену фаз и безошибочную отрисовку.
import { describe, expect, it } from 'vitest';
import { dstate, enterPhase, forceChain } from '../../src/core/boss/exec';
import { bossDef } from '../../src/core/boss/registry';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { drawDataBoss } from '../../src/view/draw/bosses';

const mk = (seed = 1): World => new World({ seed, mode: 'bosstest', boss: 'vessel', players: 1 });
function fakeG(): never {
  const g: unknown = new Proxy({}, { get: () => () => g });
  return g as never;
}
const hold = (w: World): void => { const p = w.players[0]!; p.x = 40; p.y = 18 * 32 - p.h; p.hp = p.maxHp = 999; w.hitstop = 0; };

describe('Пустой сосуд', () => {
  const def = bossDef('vessel')!;

  it('загружен: три фазы, чистая арена (ни сущностей, ни существ), у каждой фазы свои связки', () => {
    expect(def).toBeTruthy();
    expect(def.phases).toHaveLength(3);
    expect(typeof def.arena === 'string' || !(def.arena as { ents?: unknown[] }).ents?.length).toBe(true);
    expect(def.creatures ?? []).toHaveLength(0);
    expect(def.chains.length).toBeGreaterThanOrEqual(15);
    const sets = def.phases.map((p) => new Set(p.policy.chains));
    expect([...sets[2]!].some((c) => !sets[0]!.has(c))).toBe(true);
    expect([...sets[1]!].some((c) => !sets[0]!.has(c))).toBe(true);
  });

  it('все удары имеют цвет замаха, соответствующий типу удара', () => {
    const want: Record<string, string> = { parry: 'yellow', dodge: 'red', unblockable: 'purple' };
    for (const a of def.attacks) {
      const kinds = new Set([...a.active.map((h) => h.kind), ...a.spawn.map((s) => s.kind)]);
      if (!kinds.size || a.tell.cue.color === 'white') continue; // белый — нейтральные «отгон» и «перемещение»
      const strict = kinds.has('unblockable') ? 'unblockable' : kinds.has('dodge') ? 'dodge' : 'parry';
      expect(a.tell.cue.color, a.id).toBe(want[strict]);
    }
  });

  it('темп растёт: паузы между связками и промежутки внутри связок не длиннее, чем в прошлой фазе', () => {
    const rest = def.phases.map((p) => p.policy.restFrames[0]);
    expect(rest[1]!).toBeLessThan(rest[0]!); expect(rest[2]!).toBeLessThan(rest[1]!);
    const gaps = (id: string): number[] => def.chains.find((c) => c.id === id)!.steps.slice(0, -1).map((s) => s.gapFrames ?? 99);
    expect(Math.max(...gaps('c_a3f'))).toBeLessThan(Math.max(...gaps('c_a3')));
    expect(Math.max(...gaps('c_trip'))).toBeLessThan(Math.max(...gaps('c_dbl')));
  });

  it('связка идёт в одном и том же порядке при любом зерне (экзамен: Росчерк, Подъём, Бросок, Обратный бросок, Затмение)', () => {
    const order = (seed: number): string[] => {
      const w = mk(seed); const seen: string[] = [];
      for (let i = 0; i < 200; i++) { hold(w); w.tick(); } // вступление позади
      enterPhase(w, 0, 3); for (let i = 0; i < 400; i++) { hold(w); w.tick(); }
      expect(forceChain(w, 0, 'c_exam')).toBe(true);
      const b = w.bosses[0]!;
      for (let i = 0; i < 1200 && dstate(b).chain === 'c_exam'; i++) { hold(w); w.tick(); const a = dstate(b).atk; if (a && seen[seen.length - 1] !== a) seen.push(a); }
      return seen;
    };
    const want = ['cut', 'rise', 'rush', 'rush2', 'nova'];
    expect(order(1)).toEqual(want); expect(order(77)).toEqual(want);
  });

  it('смена фаз по здоровью: тренировка с фазы 2 и 3 запускает бой, босс атакует', () => {
    for (const ph of [2, 3]) {
      const w = mk(); for (let i = 0; i < 200; i++) { hold(w); w.tick(); }
      const b = w.bosses[0]!;
      enterPhase(w, 0, ph); let attacked = false;
      for (let i = 0; i < 900; i++) { hold(w); w.tick(); if (b.state === 'tell') attacked = true; }
      expect(b.phase).toBe(ph); expect(attacked).toBe(true);
    }
  });

  it('детерминизм: то же зерно и ввод — то же состояние', () => {
    const run = (): string => {
      const w = mk(5); const fz = makeFuzzer(w, 5);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.hp, dstate(b).mem.hist])]);
    };
    expect(run()).toBe(run());
  });

  it('отрисовка тела со всеми позами не падает на пустом Graphics', () => {
    const w = mk(); const b = w.bosses[0]!;
    for (let i = 0; i < 150; i++) { hold(w); w.tick(); }
    const chains = def.chains.map((c) => c.id);
    expect(() => {
      for (const c of chains) { forceChain(w, 0, c); for (let i = 0; i < 260; i++) { hold(w); w.tick(); drawDataBoss(w, b, fakeG(), i / 10); } }
    }).not.toThrow();
  });
});
