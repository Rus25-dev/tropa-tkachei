// Владик на данных (vladik2): загрузка, детерминизм, связки по фазам, ключи-бумеранги и эхо, рисунок на пустом Graphics, старый Владик цел.
import { describe, expect, it } from 'vitest';
import { bossDef } from '../../src/core/boss/registry';
import { dstate, forceChain } from '../../src/core/boss/exec';
import { kindOf } from '../../src/core/boss/kinds';
import { duelBossIds, raceBossIds, testCards } from '../../src/core/boss/catalog';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { drawDataBoss } from '../../src/view/draw/bosses';
import { bodyDrawer } from '../../src/view/draw/bossdraw';

function fakeG(): never {
  const g: unknown = new Proxy({}, { get: () => () => g });
  return g as never;
}
const mk = (seed = 1, train?: number): World => new World({ seed, mode: 'bosstest', boss: 'vladik2', players: 1, ...(train ? { train: true, trainPhase: train } : {}) });
const far = (w: World): void => { const p = w.players[0]!; p.hp = p.maxHp = 999; w.hitstop = 0; };
const tickN = (w: World, n: number): void => { for (let i = 0; i < n; i++) { far(w); w.tick(); } };

describe('Владик на данных', () => {
  it('загружен, три фазы, связки новой фазы отличаются от первой; kinds и рисовальщик подключены сами', () => {
    const d = bossDef('vladik2')!;
    expect(d).toBeTruthy(); expect(d.phases).toHaveLength(3);
    const c1 = new Set(d.phases[0]!.policy.chains), c2 = new Set(d.phases[1]!.policy.chains);
    expect([...c2].filter((c) => !c1.has(c)).length).toBeGreaterThanOrEqual(4);
    expect(kindOf('vladik2')?.fx?.['clef']).toBeTypeOf('function');
    expect(bodyDrawer('vladik2', null)).toBeTypeOf('function');
    expect(d.chains.length).toBeGreaterThanOrEqual(8);
  });
  it('в списках: карточка Босс-теста и список ботов; старый Владик остаётся ручным автоматом', () => {
    expect(testCards(false).map((c) => c.id)).toEqual(expect.arrayContaining(['vladik', 'vladik2']));
    expect(raceBossIds()).toEqual(expect.arrayContaining(['vladik', 'vladik2']));
    expect(duelBossIds()).not.toContain('vladik2');
    const old = new World({ seed: 1, mode: 'bosstest', boss: 'vladik', players: 1 });
    expect(old.vladik).toBeTruthy(); expect(old.bosses).toHaveLength(0);
  });
  it('детерминизм: то же зерно и ввод — то же состояние', () => {
    const run = (): string => {
      const w = mk(5), fz = makeFuzzer(w, 5);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.hp, dstate(b).mem.hist])]);
    };
    expect(run()).toBe(run());
  });
  it('ключи-бумеранги вылетают, возвращаются к Владику и гаснут; эхо предупреждает, потом бежит', () => {
    const w = mk(); tickN(w, 260);
    expect(forceChain(w, 0, 'c_clef')).toBe(true);
    let seen = false, gone = false;
    for (let i = 0; i < 400; i++) {
      tickN(w, 1);
      const n = w.projs.filter((p) => p.kind === 'clef').length;
      if (n) seen = true; else if (seen) { gone = true; break; }
    }
    expect(seen).toBe(true); expect(gone).toBe(true);
    const w2 = mk(2); tickN(w2, 260);
    expect(forceChain(w2, 0, 'c_echo')).toBe(true);
    let echo = false, moved = false;
    for (let i = 0; i < 300 && !moved; i++) {
      tickN(w2, 1);
      const e = w2.projs.find((p) => p.kind === 'echo');
      if (e) { echo = true; if ((e.delay ?? 0) <= 0) moved = true; }
    }
    expect(echo).toBe(true); expect(moved).toBe(true);
  });
  it('нотный стан: линии зажигаются после замаха, платформа-парта появляется в стане с нижней линией', () => {
    const w = mk(3); tickN(w, 260);
    expect(forceChain(w, 0, 'c_staff_a')).toBe(true);
    let lines = 0, desk = false;
    for (let i = 0; i < 160; i++) { tickN(w, 1); lines = Math.max(lines, w.arena!.ents.filter((e) => e.kind === 'beam' && e.strikes.length).length); if (w.arena!.ents.some((e) => e.id === 'desk' && e.shown)) desk = true; }
    expect(lines).toBe(2); expect(desk).toBe(true);
  });
  it('тренировка: старт с фазы 3 запускает падающие ноты крещендо', () => {
    const w = mk(4, 3); tickN(w, 400);
    expect(w.arena!.ents.some((e) => e.id.startsWith('crescendo') && e.on)).toBe(true);
    expect(dstate(w.bosses[0]!).formPh).toBeGreaterThanOrEqual(1);
  });
  it('рисунок: тело и снаряды рисуются на пустом Graphics во всех состояниях боя', () => {
    const w = mk(6), fz = makeFuzzer(w, 6);
    expect(() => {
      for (let i = 0; i < 2400; i++) {
        feedInput(w, [fz(0)]); far(w); w.tick();
        if (i % 7 === 0) drawDataBoss(w, w.bosses[0]!, fakeG(), i / 60);
      }
    }).not.toThrow();
  });
});
