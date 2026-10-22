// Миша Додик на данных (misha2): загрузка, детерминизм, состав связок по фазам, дымовуха в рюкзак (в том числе «застёгнутая» последняя четверть),
// отрисовка с пустым Graphics. Старый автомат (misha) этими тестами не затрагивается: его проверяют прежние тесты и золотые записи.
import { describe, expect, it } from 'vitest';
import { duelBossIds, LEGACY_CARDS, raceBossIds, testCards } from '../../src/core/boss/catalog';
import { dstate, enterPhase, weakStates } from '../../src/core/boss/exec';
import { bossDef } from '../../src/core/boss/registry';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { drawDataBoss } from '../../src/view/draw/bosses';

const ID = 'misha2';
const mk = (seed = 1): World => new World({ seed, mode: 'bosstest', boss: ID, players: 1 });
function fakeG(): never { const g = new Proxy({}, { get: () => () => g }); return g as never; }
/** герой далеко и неуязвим: проверяем босса, а не выживание */
const idle = (w: World, n: number): void => { for (let i = 0; i < n; i++) { const p = w.players[0]!; p.x = 60; p.y = 18 * 32 - p.h; p.hp = p.maxHp = 999; p.inv = 1; w.hitstop = 0; w.tick(); } };
const bomb = (w: World): void => {
  const b = w.bosses[0]!, bx = b.x + b.w / 2 - 26 * b.face - 15, by = b.y + 12;
  w.projs.push({ kind: 'bomb', x: bx + 9, y: by + 14, w: 12, h: 12, vx: 0, vy: 0, life: 3, owner: 0 });
};

describe('Миша Додик на данных', () => {
  it('загружен и виден в Босс-тесте по ?dev=1; обычные карточки и списки ботов/дуэли не тронуты', () => {
    const d = bossDef(ID)!;
    expect(d).toBeTruthy(); expect(d.dev).toBe(true); expect(d.arena).toBe('misha');
    expect(testCards(true).map((c) => c.id)).toContain(ID);
    expect(testCards(false).map((c) => c.id)).not.toContain(ID); // пока dev: общие тесты boss-discovery ждут только старых боссов
    expect(testCards(true).slice(0, 3).map((c) => c.id)).toEqual(LEGACY_CARDS.map((c) => c.id));
    expect(raceBossIds()).toContain('misha');
    expect(duelBossIds()).not.toContain(ID); // дуэль для боссов на данных ещё не подключена
  });

  it('устроен как средний босс: 3 фазы, 9+ связок игрока, все четыре цвета замаха', () => {
    const d = bossDef(ID)!;
    expect(d.phases).toHaveLength(3);
    const used = new Set(d.phases.flatMap((p) => p.policy.chains));
    expect(used.size).toBeGreaterThanOrEqual(9);
    expect(new Set(d.attacks.map((a) => a.tell.cue.color))).toEqual(new Set(['yellow', 'red', 'purple', 'white']));
    // вторая фаза приносит новые связки, которых нет в первой
    const p1 = new Set(d.phases[0]!.policy.chains);
    expect(d.phases[1]!.policy.chains.filter((c) => !p1.has(c)).length).toBeGreaterThanOrEqual(3);
    expect(d.phases[2]!.policy.chains.filter((c) => !d.phases[1]!.policy.chains.includes(c)).length).toBeGreaterThanOrEqual(2);
  });

  it('детерминизм: то же зерно и ввод — то же состояние', () => {
    const run = (): string => {
      const w = mk(5), fz = makeFuzzer(w, 5);
      for (let i = 0; i < 4000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.hp, dstate(b).mem.hist])]);
    };
    expect(run()).toBe(run());
  });

  it('дымовуха в открытый рюкзак за спиной снимает 3 единицы; повтор в течение 0,9 с — нет', () => {
    const w = mk(); idle(w, 400);
    const b = w.bosses[0]!, hp0 = b.hp;
    expect(b.state).not.toBe('intro');
    bomb(w); idle(w, 2);
    expect(hp0 - b.hp).toBe(3);
    bomb(w); idle(w, 2);
    expect(hp0 - b.hp).toBe(3);
  });

  it('последняя четверть: рюкзак застёгнут — бомба и игла проходят, только пока Миша выдохся (окно наказания)', () => {
    const w = mk(); idle(w, 400);
    expect(enterPhase(w, 0, 3)).toBe(true);
    for (let i = 0; i < 600 && dstate(w.bosses[0]!).formPh < 3; i++) idle(w, 1);
    const b = w.bosses[0]!, d = dstate(b);
    expect(d.formPh).toBe(3);
    // ждём, пока Миша дойдёт до замаха обычной атаки: рюкзак закрыт
    let closed = false;
    for (let i = 0; i < 1500 && !closed; i++) { idle(w, 1); closed = d.mode === 'attack' && !d.punish && b.state === 'tell' && b.hp > 0; }
    expect(closed).toBe(true);
    expect(weakStates(b).every((s) => !s.open)).toBe(true);
    const hp1 = b.hp; bomb(w); idle(w, 2);
    expect(b.hp).toBe(hp1);
    // окно наказания: точка открыта
    let open = false;
    for (let i = 0; i < 1500 && !open; i++) { idle(w, 1); open = d.punish && weakStates(b).some((s) => s.open); }
    expect(open).toBe(true);
    const hp2 = b.hp; bomb(w); idle(w, 1);
    expect(b.hp).toBeLessThan(hp2);
  });

  it('отрисовка всех поз и обоих вариантов тела с пустым Graphics не падает', () => {
    const w = mk(3); const b = w.bosses[0]!;
    expect(() => { for (let i = 0; i < 1500; i++) { idle(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
    enterPhase(w, 0, 3);
    expect(() => { for (let i = 0; i < 1500; i++) { idle(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
  });
});
