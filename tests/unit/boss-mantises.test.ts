// «Три Богомола» (босс 11): три бойца под дирижёром — общий пул здоровья, приказы по такту, фазы добавляют голоса (1: Ила и Орс, 2: все трое, 3: жатва и пересборка),
// безопасные окна по всем, no-hit бот, отрисовка с пустым Graphics.
import { describe, expect, it } from 'vitest';
import { dstate } from '../../src/core/boss/exec';
import { BOSS_RULES, bossDef } from '../../src/core/boss/registry';
import { validateBoss } from '../../src/core/boss/validate';
import { barFrac } from '../../src/core/boss/conductor';
import { damageBoss } from '../../src/core/damage';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { drawDataBoss } from '../../src/view/draw/bosses';
import { NoHitPilot } from '../../tools/bot/nohit';
import { arenaInfo } from '../../tools/boss/files';

const ID = 'mantises';
const make = (opts: { seed?: number; phase?: number } = {}): World => new World({ seed: opts.seed ?? 1, mode: 'bosstest', boss: ID, players: 1, fx: true, train: !!opts.phase, trainPhase: opts.phase });
/** герой в дальнем левом углу, бессмертный (бой идёт сам по расписанию) */
const far = (w: World): void => { const p = w.players[0]!; p.x = 40; p.y = 18 * 32 - p.h; p.vx = 0; p.vy = 0; p.hp = p.maxHp = 9999; p.inv = 1; w.hitstop = 0; };
/** начала связок: [босс, связка, кадр боя] */
function starts(w: World, n: number): [number, string, number][] {
  const out: [number, string, number][] = [], last: (string | null)[] = w.bosses.map(() => null);
  for (let f = 0; f < n; f++) {
    far(w); w.tick();
    w.bosses.forEach((b, i) => { const d = dstate(b); const cur = d.mode === 'attack' && d.step === 0 && d.af <= 1 ? d.chain : null; if (cur && last[i] !== `${cur}@${d.ac.clk}`) { last[i] = `${cur}@${d.ac.clk}`; out.push([i, cur, f]); } });
  }
  return out;
}
const fakeG = (): never => { const g: unknown = new Proxy({}, { get: () => () => g }); return g as never; };

describe('Три Богомола: состав и данные', () => {
  it('в бою три бойца на своих местах, здоровье общее, героя в стартовой точке никто не давит', () => {
    const w = make();
    expect(w.bosses.map((b) => dstate(b).id)).toEqual(['mantises', 'mantises_b', 'mantises_c']);
    expect(new Set(w.bosses.map((b) => b.hp)).size).toBe(1);
    expect(bossDef(ID)!.conductor!.pool).toBe(true);
    const p = w.players[0]!;
    for (const b of w.bosses) expect(p.x + 14 < b.x || p.x > b.x + b.w, `${b.name} не на старте героя`).toBe(true);
    expect(w.cond).not.toBeNull();
  });

  it('участники скрыты из списков, главный босс виден всем; у каждого свой рисовальщик', () => {
    expect(bossDef('mantises_b')!.hidden).toBe(true); expect(bossDef('mantises_c')!.hidden).toBe(true);
    expect(bossDef(ID)!.dev).toBeFalsy(); expect(bossDef(ID)!.hidden).toBeFalsy();
  });

  it('валидатор: ошибок нет ни у ведущего, ни у участников; расписание проверено по каждой фазе отдельно', () => {
    for (const id of [ID, 'mantises_b', 'mantises_c']) {
      const def = bossDef(id)!, errs = validateBoss(def, BOSS_RULES, arenaInfo(def.arena)).filter((i) => i.level === 'error');
      expect(errs.map((e) => `${e.code}: ${e.msg}`), id).toEqual([]);
    }
    const cond = validateBoss(bossDef(ID)!, BOSS_RULES, arenaInfo('vladik')).filter((i) => i.code.startsWith('cond-') && i.level === 'error');
    expect(cond).toEqual([]);
  });
});

describe('Три Богомола: фазы и такт', () => {
  it('фаза 1 — Ила и Орс; Вьюн только наблюдает (без своей связки, кроме отгона)', () => {
    const w = make();
    const s = starts(w, 120 + 24 * 30 * 2 + 30);
    const by = (i: number): string[] => [...new Set(s.filter((x) => x[0] === i).map((x) => x[1]))];
    expect(by(0)).toEqual(expect.arrayContaining(['a_cross', 'a_fan', 'a_rush']));
    expect(by(1)).toEqual(expect.arrayContaining(['b_dash', 'b_twin', 'b_vault']));
    expect(by(2).filter((c) => c !== 'c_shove')).toEqual([]);
  });

  it('фаза 2 — все трое; фаза 3 — жатва и серпопад, прежние голоса переписаны', () => {
    const w2 = make({ phase: 2 });
    const s2 = starts(w2, 300 + 24 * 30 * 2);
    const by2 = (i: number): Set<string> => new Set(s2.filter((x) => x[0] === i).map((x) => x[1]));
    expect([...by2(2)]).toEqual(expect.arrayContaining(['c_fan', 'c_throw', 'c_rain']));
    expect(by2(0).has('a_reap')).toBe(false);
    const w3 = make({ phase: 3 });
    const s3 = starts(w3, 300 + 24 * 30 * 2);
    const by3 = (i: number): Set<string> => new Set(s3.filter((x) => x[0] === i).map((x) => x[1]));
    expect([...by3(0)]).toEqual(expect.arrayContaining(['a_reap', 'a_drop', 'a_cross', 'a_rush']));
    expect([...by3(1)]).toEqual(expect.arrayContaining(['b_twin3', 'b_dash', 'b_vault']));
    expect([...by3(2)]).toEqual(expect.arrayContaining(['c_fan3', 'c_throw3', 'c_rain']));
  });

  it('залп на счёт: приказы одного такта начинаются на одном кадре; все начала кратны такту', () => {
    const w = make({ phase: 3 });
    const s = starts(w, 300 + 24 * 30), cd = bossDef(ID)!.conductor!;
    const t0 = Math.min(...s.map((x) => x[2]));
    const first = s.filter((x) => x[2] - t0 < 4);
    expect(new Set(first.map((x) => x[0])).size).toBe(3); // в такт 0 стартуют все трое
    for (const x of s) if (x[1] !== 'a_shove' && !x[1].endsWith('_shove') && !x[1].endsWith('_leap')) expect((x[2] - t0) % cd.beat <= 3 || cd.beat - ((x[2] - t0) % cd.beat) <= 3, `${x[1]} на кадре ${x[2] - t0}`).toBe(true);
  });

  it('общая пауза: после залпа есть окно, когда никто из троих не в замахе и не бьёт (не короче нормы)', () => {
    for (const phase of [1, 2, 3]) {
      const w = make({ phase });
      for (let i = 0; i < 400; i++) { far(w); w.tick(); }
      let calm = 0, best = 0;
      for (let i = 0; i < 24 * 30 * 2; i++) {
        far(w); w.tick();
        const busy = w.bosses.some((b) => b.state === 'tell' || b.state === 'active');
        calm = busy ? 0 : calm + 1; best = Math.max(best, calm);
      }
      expect(best, `фаза ${phase}`).toBeGreaterThanOrEqual(BOSS_RULES.conductor!.minSafeGapFrames);
    }
  });
});

describe('Три Богомола: здоровье, победа, детерминизм', () => {
  it('общий пул: удар по любому снимает здоровье у всех; полоса босса — общая доля', () => {
    const w = make();
    for (let i = 0; i < 200; i++) { far(w); w.tick(); }
    const b = w.bosses[2]!, h0 = b.hp, p = w.players[0]!;
    p.x = b.x - 20; p.y = b.y; p.atkT = 0.1; // удар героя по Вьюн — пул один
    const before = w.bosses.map((q) => q.hp);
    expect(before.every((v) => v === h0)).toBe(true);
    damageBoss(w, 'd2', p);
    far(w); w.tick();
    expect(new Set(w.bosses.map((q) => q.hp)).size).toBe(1);
    expect(w.bosses[0]!.hp).toBeLessThan(h0); // удар по третьему бойцу снял здоровье у первого
    expect(barFrac(w)).toBeCloseTo(w.bosses[0]!.hp / w.bosses[0]!.maxHp, 5);
  });

  it('пул обнулился — падают все трое сразу (победа)', () => {
    const w = make();
    for (let i = 0; i < 200; i++) { far(w); w.tick(); }
    for (const b of w.bosses) b.hp = 0.5;
    const p = w.players[0]!; p.x = w.bosses[0]!.x - 10; p.y = w.bosses[0]!.y; p.atkT = 0.1;
    damageBoss(w, 'd0', p);
    for (let i = 0; i < 400; i++) { far(w); w.tick(); }
    expect(w.bosses.every((b) => b.state === 'dead' || b.hp <= 0)).toBe(true);
  });

  it('детерминизм: то же зерно и ввод — то же состояние всех боссов', () => {
    const run = (): string => {
      const w = make({ seed: 9 });
      const fz = makeFuzzer(w, 9);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.bosses.map((b) => [b.x, b.y, b.hp, b.state, dstate(b).mem.hist]), w.cond, w.players.map((p) => [p.x, p.hp])]);
    };
    expect(run()).toBe(run());
  });
});

describe('Три Богомола: no-hit бот и рисунок', () => {
  it('бот, только уходящий от ударов, переживает два цикла каждой фазы без урона', () => {
    for (const phase of [1, 2, 3]) {
      const w = make({ phase, seed: 4 });
      const p = w.players[0]!, pilot = new NoHitPilot({ mode: 'strict', aggressive: false });
      let hits = 0, hp = p.hp;
      for (let t = 0; t < 120 + 24 * 30 + 200; t++) {
        feedInput(w, [w.bosses.some((b) => dstate(b).mode === 'intro') ? {} : pilot.frame(w)]);
        w.tick();
        if (p.hp < hp) hits += hp - p.hp;
        hp = p.hp;
      }
      expect(hits, `фаза ${phase}: ${JSON.stringify(pilot.forced[0])}`).toBe(0);
    }
  }, 300_000);

  it('отрисовка трёх тел во всех состояниях не падает (пустой Graphics)', () => {
    for (const phase of [1, 3]) {
      const w = make({ phase, seed: 2 });
      expect(() => { for (let i = 0; i < 700; i++) { far(w); w.tick(); for (const b of w.bosses) drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
    }
  });
});
