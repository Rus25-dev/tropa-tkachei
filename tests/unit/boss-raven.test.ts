// Ворон-тиран (босс 7): загрузка, три тела по фазам, сцена-трансформация и её пропуск, шар нити, достижимость воздушной фазы, детерминизм, отрисовка.
import { describe, expect, it } from 'vitest';
import { dstate, enterPhase, forceChain, sceneOn } from '../../src/core/boss/exec';
import { effForm } from '../../src/core/boss/form';
import { bossDef, BOSS_RULES } from '../../src/core/boss/registry';
import { minionsAlive } from '../../src/core/boss/minions';
import { validateRaw } from '../../src/core/boss/validate';
import { damageEnemy } from '../../src/core/damage';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { drawDataBoss } from '../../src/view/draw/bosses';
import { bossRaw } from '../../src/core/boss/registry';
import { arenaInfo } from '../../tools/boss/files';

const ID = 'raven';
const mk = (seed = 1): World => new World({ seed, mode: 'bosstest', boss: ID, players: 1, fx: true });
const calm = (w: World, dx = 260): void => { const b = w.bosses[0]!, p = w.players[0]!; p.x = b.x + b.w / 2 - 7 - dx; p.y = dstate(b).floor - p.h; p.hp = p.maxHp = 999; p.vx = 0; p.vy = 0; p.inv = 0; w.hitstop = 0; };
const tickN = (w: World, n: number, dx = 260): void => { for (let i = 0; i < n; i++) { calm(w, dx); w.tick(); } };
function fakeG(): never { const g: unknown = new Proxy({}, { get: () => () => g }); return g as never; }

describe('Ворон-тиран', () => {
  it('определение загружено: три фазы, шесть и более связок, особая логика и рисунок подключены', () => {
    const def = bossDef(ID)!;
    expect(def.phases).toHaveLength(3);
    expect(def.chains.length).toBeGreaterThanOrEqual(10);
    expect(def.creatures.map((c) => c.id)).toEqual(['silkorb']);
    const w = mk(); expect(w.bosses).toHaveLength(1);
  });

  it('валидатор: ни одной ошибки', () => {
    const raw = bossRaw(ID)!;
    const issues = validateRaw(raw as Record<string, unknown>, BOSS_RULES, arenaInfo('vladik'));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('тела по фазам: земля, крылья (полёт, без контакта), земля-ярость', () => {
    const def = bossDef(ID)!;
    const f1 = effForm(def, 1), f2 = effForm(def, 2), f3 = effForm(def, 3);
    expect(f1.fly).toBeNull(); expect(f2.fly).not.toBeNull(); expect(f3.fly).toBeNull();
    expect(f2.contact).toBeNull(); expect(f3.contact).not.toBeNull();
    expect(f2.attacks!.has('swoop')).toBe(true); expect(f2.attacks!.has('claw')).toBe(false);
    expect(f3.attacks!.has('skyring')).toBe(true); expect(f3.attacks!.has('swoop')).toBe(false);
    expect(f2.draw).toBe('wings'); expect(f3.draw).toBe('fury');
  });

  it('трансформация: сцена идёт, пропускается прыжком, тело в воздухе; ярость возвращает на землю', () => {
    const w = mk(), b = w.bosses[0]!, d = dstate(b);
    tickN(w, 200);
    expect(d.mode === 'idle' || d.mode === 'attack').toBe(true);
    expect(enterPhase(w, 0, 2)).toBe(true);
    let scene = false;
    for (let i = 0; i < 200 && !scene; i++) { tickN(w, 1); scene = d.mode === 'scene'; }
    expect(scene).toBe(true); expect(sceneOn(w)?.skippable).toBe(true);
    expect(d.formPh).toBe(1); // тело ещё прежнее до события morph
    w.players[0]!.pend.atkP = true; tickN(w, 1); // пропуск
    tickN(w, 2);
    expect(d.formPh).toBe(2); expect(b.w).toBe(96);
    tickN(w, 120);
    expect(b.y + b.h).toBeLessThan(d.floor - 40); // завис над полом
    expect(enterPhase(w, 0, 3)).toBe(true);
    tickN(w, 400);
    expect(d.formPh).toBe(3); expect(b.h).toBe(108);
    expect(Math.abs(b.y + b.h - d.floor)).toBeLessThan(2); // на земле
  });

  it('воздушная фаза достижима ближним боем: после пике и падения тело снижается до высоты удара героя', () => {
    const w = mk(), b = w.bosses[0]!, d = dstate(b);
    tickN(w, 200); enterPhase(w, 0, 2); tickN(w, 400);
    expect(d.formPh).toBe(2);
    for (const chain of ['c_swoop', 'c_crash']) {
      tickN(w, 120);
      expect(forceChain(w, 0, chain)).toBe(true);
      let low = Infinity, punishLow = Infinity;
      for (let i = 0; i < 260 && (d.mode === 'attack' || i < 5); i++) {
        tickN(w, 1);
        const gap = d.floor - (b.y + b.h);
        low = Math.min(low, gap);
        if (d.punish) punishLow = Math.min(punishLow, gap);
      }
      // игрок ростом 26 с ударом ~40 px и прыжком: окно наказания обязано быть в пределах досягаемости
      expect(punishLow, chain).toBeLessThanOrEqual(30);
      expect(low, chain).toBeLessThanOrEqual(8);
    }
  });

  it('шар нити: разбитый даёт нить и здоровье один раз, исчезнувший сам — ничего', () => {
    const w = mk(), p = w.players[0]!;
    tickN(w, 200);
    p.hp = p.maxHp = 5; p.hp = 3; p.silk = 0;
    expect(forceChain(w, 0, 'c_orb')).toBe(true);
    tickN(w, 70);
    const orbs = minionsAlive(w, 'silkorb'); expect(orbs).toHaveLength(1);
    const e = orbs[0]!;
    p.hp = 3; p.maxHp = 5;
    damageEnemy(w, e, p);
    expect(e.dead).toBe(true); w.hitstop = 0;
    w.tick();
    expect(p.silk).toBe(4); expect(p.hp).toBe(4); // 1 нить за удар по шару + 3 в дар
    for (let i = 0; i < 5; i++) w.tick();
    expect(p.silk).toBe(4); // повторно не дарит

    const w2 = mk(), p2 = w2.players[0]!;
    tickN(w2, 200); p2.silk = 0; forceChain(w2, 0, 'c_orb'); tickN(w2, 70 + 600);
    expect(minionsAlive(w2, 'silkorb')).toHaveLength(0);
    expect(p2.silk).toBe(0); // шар погас сам
  });

  it('детерминизм: то же зерно и ввод — то же состояние', () => {
    const run = (): string => {
      const w = mk(5), fz = makeFuzzer(w, 5);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.y, b.hp, dstate(b).mem.hist])]);
    };
    expect(run()).toBe(run());
  });

  it('отрисовка всех тел и шара нити на пустом Graphics не падает', () => {
    const w = mk(), b = w.bosses[0]!;
    tickN(w, 100);
    expect(() => { for (let i = 0; i < 300; i++) { tickN(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
    enterPhase(w, 0, 2);
    expect(() => { for (let i = 0; i < 600; i++) { tickN(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
    enterPhase(w, 0, 3);
    expect(() => { for (let i = 0; i < 600; i++) { tickN(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
  });
});
