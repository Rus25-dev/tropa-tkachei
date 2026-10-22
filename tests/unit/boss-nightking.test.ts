import { describe, expect, it } from 'vitest';
import { damageBoss } from '../../src/core/damage';
import { dstate, enterPhase, forceChain } from '../../src/core/boss/exec';
import { bossDef } from '../../src/core/boss/registry';
import { kindOf } from '../../src/core/boss/kinds';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { drawDataBoss } from '../../src/view/draw/bosses';

const mk = (seed = 1): World => new World({ seed, mode: 'bosstest', boss: 'nightking', players: 1, fx: true });
/** герой далеко у левой стены и неуязвим: тест смотрит на босса, а не на героя */
const tick = (w: World, n: number): void => { for (let i = 0; i < n; i++) { const p = w.players[0]!; p.x = 60; p.y = 18 * 32 - p.h; p.hp = p.maxHp = 999; w.hitstop = 0; w.tick(); } };
const fakeG = (): never => { const g: unknown = new Proxy({}, { get: () => () => g }); return g as never; };

describe('Король кошмаров', () => {
  it('загружен: три фазы, переходы тихие и с переходным приёмом, особая логика и рисунок на месте', () => {
    const def = bossDef('nightking')!;
    expect(def).toBeTruthy();
    expect(def.phases).toHaveLength(3);
    expect(def.phases.slice(1).every((p) => p.silent && !!p.enterChain)).toBe(true);
    expect(kindOf('nightking')?.fx?.['warp']).toBeTypeOf('function');
    expect(def.chains.length).toBeGreaterThanOrEqual(9);
  });

  it('каждый телепорт заранее красит точку появления: зона арены с тем же номером и тем же x, что и в fx', () => {
    const def = bossDef('nightking')!;
    const ents = typeof def.arena === 'string' ? [] : def.arena.ents;
    for (const a of def.attacks.filter((x) => x.id.startsWith('warp_'))) {
      const fire = a.fire[0]!, fx = a.fx[0]!;
      const z = ents.find((e) => e.id === fire.ent)!;
      expect(z.kind).toBe('beam');
      if (z.kind !== 'beam') continue;
      expect(z.area.x + z.area.w / 2).toBe(fx.args['x']); // центр красного круга = точка выхода
      expect(fx.at).toBeGreaterThanOrEqual(z.timeline[0]!.tell); // выход не раньше, чем круг отработал замах
      expect(a.tell.cue.color).toBe('white');
    }
  });

  it('уход в тень: после атаки босс стоит в центре красного круга', () => {
    for (const [id, x] of [['warp_l', 180], ['warp_c', 672], ['warp_r', 1164]] as const) {
      const w = mk(3); tick(w, 200);
      const b = w.bosses[0]!, d = dstate(b);
      const chain = `c_${id === 'warp_l' ? 'wl_c' : id === 'warp_c' ? 'wc_l' : 'wr_l'}`;
      expect(forceChain(w, 0, chain)).toBe(true);
      let guard = 0; while (d.atk !== 'fan' && guard++ < 400) tick(w, 1);
      expect(Math.abs(b.x + b.w / 2 - (w.arena!.x0 + x))).toBeLessThan(2);
    }
  });

  it('фаза 2 и 3 включаются без рёва: босс уязвим, идёт переходный приём', () => {
    const w = mk(4); tick(w, 200);
    const b = w.bosses[0]!;
    b.hp = Math.floor(b.maxHp * 0.66); damageBoss(w, 'd0', w.players[0]!); tick(w, 2);
    expect(b.phase).toBe(2);
    expect(b.state).not.toBe('rage');
    expect(dstate(b).chain).toBe('c_enter2');
    tick(w, 400);
    b.hp = Math.floor(b.maxHp * 0.33); damageBoss(w, 'd0', w.players[0]!); tick(w, 2);
    expect(b.phase).toBe(3);
    expect(dstate(b).chain).toBe('c_enter3');
  });

  it('рисуется в покое, замахе, уходе в тень и на фазах (пустой Graphics)', () => {
    const w = mk(5); tick(w, 200);
    const b = w.bosses[0]!;
    expect(() => { for (let i = 0; i < 300; i++) { tick(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
    forceChain(w, 0, 'c_wl_c');
    expect(() => { for (let i = 0; i < 160; i++) { tick(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
    enterPhase(w, 0, 3);
    expect(() => { for (let i = 0; i < 600; i++) { tick(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
  });

  it('детерминизм: то же зерно и ввод — то же состояние (и столбы по расписанию)', () => {
    const run = (): string => {
      const w = new World({ seed: 5, mode: 'bosstest', boss: 'nightking', players: 1 });
      const fz = makeFuzzer(w, 5);
      for (let i = 0; i < 4000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.hp, dstate(b).mem.hist])]);
    };
    expect(run()).toBe(run());
  });
});
