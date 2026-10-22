// Каркас боссов 2.5: схема данных (валидные/невалидные), правила честности, реестр.
import { describe, expect, it } from 'vitest';
import '../../src/content'; // виды снарядов (src/content/projectiles) нужны проверке proj.kind
import rulesRaw from '../../data/bosses/rules.json' with { type: 'json' };
import dummyRaw from '../../data/bosses/dummy.json' with { type: 'json' };
import { BOSS_RULES, bossDef, dataBossIds, registerBoss } from '../../src/core/boss/registry';
import { BossDefSchema, activeEnd, checkBossDef, parseBossDef, parseRules } from '../../src/core/boss/schema';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- правка JSON в тестах

describe('схема данных боссов', () => {
  it('правила и манекен проходят схему и правила честности', () => {
    expect(parseRules(rulesRaw)).toEqual(BOSS_RULES);
    const d = parseBossDef(dummyRaw, BOSS_RULES);
    expect(d.id).toBe('dummy');
    expect(checkBossDef(d, BOSS_RULES)).toEqual([]);
    expect(bossDef('dummy')).toBeTruthy();
    expect(dataBossIds()).toContain('dummy');
  });
  it('манекен: 2 фазы, 6–9 атак, 5+ обычных связок, все три типа удара и все цвета замаха разумно представлены', () => {
    const d = bossDef('dummy')!;
    expect(d.phases).toHaveLength(2);
    expect(d.attacks.length).toBeGreaterThanOrEqual(6); expect(d.attacks.length).toBeLessThanOrEqual(9);
    expect(d.phases[0]!.policy.chains.length).toBeGreaterThanOrEqual(5);
    const kinds = new Set(d.attacks.flatMap((a) => [...a.active.map((x) => x.kind), ...a.spawn.map((x) => x.kind)]));
    expect([...kinds].sort()).toEqual(['dodge', 'parry', 'unblockable']);
    for (const a of d.attacks) expect(a.recovery.punishWindow.to).toBeLessThan(a.recovery.frames);
  });
  it('значения по умолчанию подставляются (box.at, move.toward, spawn.count)', () => {
    const d = bossDef('dummy')!;
    expect(d.attacks[0]!.active[0]!.hit.at).toBe('self');
    expect(d.attacks.find((a) => a.id === 'thrust')!.move[0]!.toward).toBe('player');
    expect(d.attacks.find((a) => a.id === 'slam')!.spawn[0]!.count).toBe(1);
    expect(d.chains.find((c) => c.id === 'c_combo')!.cooldown).toBe(0);
  });
  it('activeEnd: последний кадр удара/движения/выстрела', () => {
    const d = bossDef('dummy')!;
    expect(activeEnd(d.attacks.find((a) => a.id === 'swing')!)).toBe(5);
    expect(activeEnd(d.attacks.find((a) => a.id === 'rain')!)).toBe(28);
    expect(activeEnd(d.attacks.find((a) => a.id === 'thrust')!)).toBe(11);
  });

  const bad: [string, (d: Raw) => void, RegExp][] = [
    ['нет обязательного поля', (d) => { delete d['name']; }, /name/],
    ['лишний ключ (опечатка)', (d) => { d['attaks'] = []; }, /attaks|unrecognized|Unrecognized/i],
    ['неизвестный цвет замаха', (d) => { d['attacks'][0].tell.cue.color = 'green'; }, /color/],
    ['неизвестный тип удара', (d) => { d['attacks'][0].active[0].kind = 'magic'; }, /kind/],
    ['неизвестный вид снаряда', (d) => { d['attacks'][2].spawn[0].proj.kind = 'laser'; }, /proj/],
    ['отрицательный кадр', (d) => { d['attacks'][0].active[0].from = -1; }, /from/],
    ['не число вместо кадров', (d) => { d['attacks'][0].tell.frames = 'много'; }, /frames/],
    ['замах короче нормы для парируемого', (d) => { d['attacks'][0].tell.frames = 10; }, /замах 10/],
    ['замах неотбиваемого короче нормы', (d) => { d['attacks'][5].tell.frames = 28; }, /замах 28/],
    ['восстановление короче нормы', (d) => { d['attacks'][0].recovery.frames = 12; d['attacks'][0].recovery.punishWindow = { from: 0, to: 11 }; }, /восстановление 12/],
    ['окно наказания выходит за восстановление', (d) => { d['attacks'][0].recovery.punishWindow.to = 60; }, /выходит/],
    ['окно наказания слишком короткое', (d) => { d['attacks'][0].recovery.punishWindow = { from: 5, to: 8 }; }, /окно наказания 4/],
    ['active.to < from', (d) => { d['attacks'][0].active[0].from = 9; d['attacks'][0].active[0].to = 3; }, /active\.to/],
    ['связка ссылается на несуществующую атаку', (d) => { d['chains'][0].steps[0].attack = 'nope'; }, /нет атаки «nope»/],
    ['политика ссылается на несуществующую связку', (d) => { d['phases'][0].policy.chains.push('nope'); }, /неизвестную связку «nope»/],
    ['повтор id атаки', (d) => { d['attacks'][1].id = 'swing'; }, /повторяется/],
    ['первая фаза не с 1', (d) => { d['phases'][0].fromHp = 0.9; }, /первой фазы/],
    ['фазы не убывают', (d) => { d['phases'][1].fromHp = 1; }, /убывать/],
    ['enterChain неизвестен', (d) => { d['phases'][1].enterChain = 'zzz'; }, /enterChain/],
    ['noRepeat не меньше числа связок', (d) => { d['phases'][0].policy.noRepeat = 5; }, /noRepeat/],
    ['пустая атака', (d) => { const a = d['attacks'][0]; a.active = []; a.move = []; a.spawn = []; }, /пустая/],
    ['больше трёх фаз', (d) => { d['phases'].push(clone(d['phases'][1]), clone(d['phases'][1]), clone(d['phases'][1])); }, /phases/],
  ];
  for (const [name, mut, re] of bad) {
    it(`невалидно: ${name}`, () => {
      const d = clone(dummyRaw) as Raw; mut(d);
      expect(() => parseBossDef(d, BOSS_RULES)).toThrow(re);
    });
  }
  it('registerBoss отвергает нечестного босса и не портит реестр', () => {
    const d = clone(dummyRaw) as Raw; d['id'] = 'broken'; d['attacks'][0].tell.frames = 5;
    expect(() => registerBoss(d)).toThrow();
    expect(bossDef('broken')).toBeUndefined();
  });
  it('схема строгая: лишнее поле в правилах — ошибка', () => {
    expect(() => parseRules({ ...rulesRaw, extra: 1 })).toThrow();
    expect(BossDefSchema.safeParse({}).success).toBe(false);
  });
});
