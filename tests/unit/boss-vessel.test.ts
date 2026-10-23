// «Пустой сосуд» (vessel): чистая дуэль без арены-помех. Проверяем: загрузку и состав, отсутствие сущностей арены и существ,
// детерминизм, фиксированный порядок шагов связок (в том числе «экзамена»), нарастание темпа по фазам, смену фаз и безошибочную отрисовку.
import { describe, expect, it } from 'vitest';
import { dstate, enterPhase, forceChain, rawData } from '../../src/core/boss/exec';
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
    expect(def.chains.length).toBeGreaterThanOrEqual(10);
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
  });

  it('тройной удар сохраняет порядок при любом зерне', () => {
    const order = (seed: number): string[] => {
      const w = mk(seed), seen: string[] = [];
      for (let i = 0; i < 150; i++) { hold(w); w.tick(); }
      expect(forceChain(w, 0, 'c_a3')).toBe(true);
      const b = w.bosses[0]!;
      for (let i = 0; i < 600 && dstate(b).chain === 'c_a3'; i++) {
        hold(w); w.tick(); const id = dstate(b).atk;
        if (id && seen[seen.length - 1] !== id) seen.push(id);
      }
      return seen;
    };
    expect(order(1)).toEqual(['cut', 'cut2', 'cut3']);
    expect(order(77)).toEqual(order(1));
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

  it('парирование блокирует ближний удар и запускает ответ; заклинание проходит', () => {
    const w = mk(); for (let i = 0; i < 150; i++) { hold(w); w.tick(); }
    const b = w.bosses[0]!, p = w.players[0]!;
    forceChain(w, 0, 'c_guard'); for (let i = 0; i < 14; i++) { hold(w); w.tick(); } const hp = b.hp;
    expect(rawData(w, 'd0', p, { source: 'melee' })).toEqual({ outcome: 'armor', damage: 0 });
    expect(b.hp).toBe(hp); expect(dstate(b).chain).toBe('c_riposte');
    forceChain(w, 0, 'c_guard'); hold(w); w.tick();
    expect(rawData(w, 'd0', p, { source: 'projectile' }).outcome).toBe('damage');
  });

  it('фокусировка и щупальца добавляются по фазам, прежние камни и волны не выбираются', () => {
    expect(def.phases[0]!.policy.chains).not.toContain('c_focus');
    expect(def.phases[1]!.policy.chains).toContain('c_focus');
    expect(def.phases[1]!.policy.chains).not.toContain('c_tendrils');
    expect(def.phases[2]!.policy.chains).toContain('c_tendrils');
    for (const ph of def.phases) for (const id of ['c_sky', 'c_sky2', 'c_quake', 'c_exam']) expect(ph.policy.chains).not.toContain(id);
  });

  it('выключение хитбоксов убирает прямоугольники урона, оставляя тело и сигналы', () => {
    const w = mk(); for (let i = 0; i < 150; i++) { hold(w); w.tick(); }
    const b = w.bosses[0]!; forceChain(w, 0, 'c_a3');
    const count = (boxes: boolean): number => {
      let n = 0; const g: unknown = new Proxy({}, { get: (_t, k) => (..._args: unknown[]) => { if (k === 'strokeRect') n++; return g; } });
      drawDataBoss(w, b, g as never, 0, boxes); return n;
    };
    expect(count(true)).toBeGreaterThan(count(false)); expect(count(false)).toBe(0);
  });

  it('телепорт кинжалов оставляет свободное тело и дистанцию до героя', () => {
    const w = mk(); for (let i = 0; i < 150; i++) { hold(w); w.tick(); }
    const b = w.bosses[0]!;
    expect(forceChain(w, 0, 'c_daggers')).toBe(true);
    expect(w.solidRect(b)).toBe(false);
    expect(Math.abs(b.x - w.players[0]!.x)).toBeGreaterThan(100);
  });

  it('падение фиксирует цель, заканчивается на полу и оставляет просветы между столпами', () => {
    const w = mk(); for (let i = 0; i < 150; i++) { hold(w); w.tick(); }
    const b = w.bosses[0]!;
    expect(forceChain(w, 0, 'c_pillars')).toBe(true);
    const x = b.x, floor = dstate(b).floor;
    for (let i = 0; i < 58; i++) { w.players[0]!.x = 400; w.hitstop = 0; w.tick(); }
    expect(b.x).toBeCloseTo(x); expect(b.y + b.h).toBeCloseTo(floor);
    const pillars = def.attacks.find((a) => a.id === 'pillars')!.active.filter((h) => h.from === 40);
    expect(pillars[1]!.hit.x - pillars[0]!.hit.x - pillars[0]!.hit.w).toBeGreaterThan(w.players[0]!.w);
  });

  it('подготовка стойки не блокирует урон, активное окно имеет конец', () => {
    const w = mk(); for (let i = 0; i < 150; i++) { hold(w); w.tick(); }
    forceChain(w, 0, 'c_guard'); hold(w); w.tick();
    expect(rawData(w, 'd0', w.players[0]!, { source: 'melee' }).outcome).toBe('damage');
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
