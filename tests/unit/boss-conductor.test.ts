// Волна 0, дирижёр: в бою до трёх боссов (sc.bosses[]), своё здоровье или общий пул, расписание по общему такту, эстафета, условие победы, безопасные окна по всем.
import { describe, expect, it } from 'vitest';
import { barFrac } from '../../src/core/boss/conductor';
import { dstate } from '../../src/core/boss/exec';
import { BOSS_RULES, registerBoss } from '../../src/core/boss/registry';
import { validateRaw } from '../../src/core/boss/validate';
import { damageBoss } from '../../src/core/damage';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { arenaInfo } from '../../tools/boss/files';
import { trioBosses, type Raw } from '../fixtures/bosses';

function make(list: Raw[], opts: { seed?: number; players?: number; train?: boolean; trainPhase?: number } = {}): World {
  for (const r of list) registerBoss(r);
  return new World({ seed: opts.seed ?? 1, mode: 'bosstest', boss: list[0]!['id'] as string, players: opts.players ?? 1, fx: true, train: opts.train, trainPhase: opts.trainPhase });
}
/** герой в дальнем левом углу, бессмертный */
function far(w: World): void { const p = w.players[0]!; p.x = 40; p.y = 18 * 32 - p.h; p.vx = 0; p.vy = 0; p.hp = p.maxHp = 9999; p.inv = 1; w.hitstop = 0; }
const tickN = (w: World, n: number, each?: (i: number) => void): void => { for (let i = 0; i < n; i++) { far(w); w.tick(); each?.(i); } };
/** когда (кадр) каждый босс начал связку: [босс, связка, кадр] */
function starts(w: World, n: number): [number, string, number][] {
  const out: [number, string, number][] = [], last: (string | null)[] = w.bosses.map(() => null);
  for (let f = 0; f < n; f++) {
    far(w); w.tick();
    w.bosses.forEach((b, i) => { const d = dstate(b); const cur = d.mode === 'attack' && d.step === 0 && d.af <= 1 ? d.chain : null; if (cur && last[i] !== `${cur}@${d.ac.clk}`) { last[i] = `${cur}@${d.ac.clk}`; out.push([i, cur, f]); } });
  }
  return out;
}

describe('несколько боссов: состав и расписание', () => {
  it('ведущий и два участника в мире, на заданных местах, со своими определениями и здоровьем', () => {
    const w = make(trioBosses('fx_t1'));
    expect(w.bosses).toHaveLength(3);
    expect(w.bosses.map((b) => dstate(b).id)).toEqual(['fx_t1', 'fx_t1_b', 'fx_t1_c']);
    const cx = (i: number): number => w.bosses[i]!.x + w.bosses[i]!.w / 2;
    expect(cx(1)).toBeCloseTo(32 + 0.2 * 42 * 32, 0); expect(cx(2)).toBeCloseTo(32 + 0.8 * 42 * 32, 0);
    expect(w.bosses.map((b) => b.hp)).toEqual([60, 60, 60]);
    expect(w.cond).not.toBeNull();
  });

  it('расписание по такту: ведущий в такт 0, второй в такт 3 (кадр 180), третий в такт 4 (кадр 240); цикл повторяется', () => {
    const w = make(trioBosses('fx_t2'));
    const s = starts(w, 800);
    const first = (i: number, nth = 0): number => s.filter((x) => x[0] === i && x[1] === 'c_a')[nth]![2];
    expect(s.filter((x) => x[0] === 0 && x[1] === 'c_a').length).toBeGreaterThanOrEqual(2);
    const base = first(0);
    expect(first(1) - base).toBe(180); expect(first(2) - base).toBe(240);
    expect(first(0, 1) - base).toBe(360); // следующий цикл (6 тактов × 60)
  });

  it('эстафета: когда второй босс заканчивает связку, ведущий через after кадров начинает свою', () => {
    const w = make(trioBosses('fx_t3'));
    const s = starts(w, 700);
    const b1 = s.find((x) => x[0] === 1)!, relay = s.find((x) => x[0] === 0 && x[1] === 'c_b');
    expect(relay).toBeDefined();
    // c_a длится: замах 26 + удар 6 + восстановление 32 = 64 кадра; эстафета +10
    expect(relay![2] - b1[2]).toBeGreaterThanOrEqual(64); expect(relay![2] - b1[2]).toBeLessThanOrEqual(64 + 14);
  });

  it('занятый босс пропускает приказ, не ломая очередь', () => {
    const w = make(trioBosses('fx_t4'));
    starts(w, 360 * 3);
    expect(w.cond!.skips).toBeGreaterThanOrEqual(0);
    expect(w.bosses.every((b) => b.state !== 'dead')).toBe(true);
  });

  it('детерминизм: те же зерно и ввод — одно и то же состояние всех боссов', () => {
    const run = (): string => {
      const w = make(trioBosses('fx_t5'), { seed: 9 });
      const fz = makeFuzzer(w, 9);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.bosses.map((b) => [b.x, b.y, b.hp, b.state, dstate(b).mem.hist]), w.cond, w.players.map((p) => [p.x, p.hp])]);
    };
    expect(run()).toBe(run());
  });
});

describe('здоровье и победа', () => {
  it('раздельное здоровье: убит один — бой идёт; убиты все — победа; полоса босса — сумма', () => {
    const w = make(trioBosses('fx_h1'));
    tickN(w, 5);
    const p = w.players[0]!;
    expect(barFrac(w)).toBe(1);
    w.bosses[1]!.hp = 1; damageBoss(w, 'd1', p);
    expect(w.bosses[1]!.state).toBe('dead'); expect(w.cond!.over).toBe(false); expect(w.bosses[0]!.state).not.toBe('dead');
    expect(barFrac(w)).toBeCloseTo(120 / 180, 2);
    tickN(w, 400); expect(w.won).toBe(false);
    w.bosses[0]!.hp = 1; damageBoss(w, 'd0', p); expect(w.cond!.over).toBe(false);
    w.bosses[2]!.hp = 1; damageBoss(w, 'd2', p);
    expect(w.cond!.over).toBe(true); expect(w.bosses.every((b) => b.state === 'dead')).toBe(true);
    tickN(w, 400); expect(w.won).toBe(true);
  });

  it('win: any — смерть любого заканчивает бой, остальные падают вместе с ним', () => {
    const list = trioBosses('fx_h2'); list[0]!['conductor'].win = 'any';
    const w = make(list); tickN(w, 5);
    w.bosses[2]!.hp = 1; damageBoss(w, 'd2', w.players[0]!);
    expect(w.cond!.over).toBe(true); expect(w.bosses.every((b) => b.state === 'dead')).toBe(true);
    tickN(w, 400); expect(w.won).toBe(true);
  });

  it('общий пул: удар по любому снимает здоровье у всех; смерть пула — победа; фазы по общей доле', () => {
    const list = trioBosses('fx_h3', true);
    for (const r of list) r['phases'] = [{ fromHp: 1, policy: { chains: ['c_a'], noRepeat: 0, restFrames: [30, 40] } }, { fromHp: 0.5, rageFrames: 10, policy: { chains: ['c_a'], noRepeat: 0, restFrames: [30, 40] } }];
    for (const r of list.slice(1)) r['chains'] = [{ id: 'c_a', steps: [{ attack: 'swing' }], weight: 1 }];
    const w = make(list); tickN(w, 5);
    const p = w.players[0]!;
    damageBoss(w, 'd1', p);
    expect(w.bosses.map((b) => b.hp)).toEqual([59, 59, 59]);
    expect(barFrac(w)).toBeCloseTo(59 / 60, 3);
    // порог второй фазы (0.5): все три боссы переходят во вторую фазу
    w.bosses[2]!.hp = 31; for (const b of w.bosses) b.hp = 31;
    damageBoss(w, 'd2', p); tickN(w, 2);
    expect(w.bosses.map((b) => b.phase)).toEqual([2, 2, 2]);
    expect(w.bosses.map((b) => b.state)).toEqual(['rage', 'rage', 'rage']);
    // убить пул: падают все
    tickN(w, 40);
    for (const b of w.bosses) b.hp = 1;
    damageBoss(w, 'd0', p);
    expect(w.bosses.every((b) => b.state === 'dead')).toBe(true); expect(w.cond!.over).toBe(true);
    tickN(w, 400); expect(w.won).toBe(true);
  });

  it('тренировка с фазой 2: фаза выставляется у всех участников', () => {
    const list = trioBosses('fx_h4', true);
    for (const r of list) r['phases'] = [{ fromHp: 1, policy: { chains: ['c_a'], noRepeat: 0, restFrames: [30, 40] } }, { fromHp: 0.5, rageFrames: 10, policy: { chains: ['c_a'], noRepeat: 0, restFrames: [30, 40] } }];
    for (const r of list.slice(1)) r['chains'] = [{ id: 'c_a', steps: [{ attack: 'swing' }], weight: 1 }];
    const w = make(list, { train: true, trainPhase: 2 });
    expect(w.bosses.map((b) => b.phase)).toEqual([2, 2, 2]); expect(new Set(w.bosses.map((b) => b.hp)).size).toBe(1);
  });

  it('сброс боя (обрыв нити) пересоздаёт всех участников и дирижёра', () => {
    const w = make(trioBosses('fx_h5'));
    tickN(w, 400);
    w.bosses[1]!.hp = 5; const clk = w.cond!.clk;
    w.teamWipe(); tickN(w, 200);
    expect(w.bosses.map((b) => b.maxHp)).toEqual([60, 60, 60]);
    expect(w.bosses[1]!.hp).toBe(60); expect(w.cond!.clk).toBeLessThan(clk);
  });
});

describe('дирижёр: проверки честности', () => {
  const info = arenaInfo('vladik');
  const errs = (raw: Raw): string[] => validateRaw(raw, BOSS_RULES, info).filter((i) => i.level === 'error').map((i) => i.code);
  const prep = (list: Raw[]): Raw => { for (const r of list.slice(1)) registerBoss(r); return list[0]!; };

  it('исправное расписание без ошибок', () => {
    expect(errs(prep(trioBosses('fx_v1')))).toEqual([]);
  });
  it('нет участника в реестре', () => {
    const list = trioBosses('fx_v2'); expect(errs(list[0]!)).toContain('cond-member');
  });
  it('все трое бьют в один такт: поток урона и нет окна без атак', () => {
    const list = trioBosses('fx_v3'); const c = list[0]!['conductor'];
    c.schedule = [{ beat: 0, boss: 'all', chain: 'c_a' }, { beat: 1, boss: 'all', chain: 'c_a' }, { beat: 2, boss: 'all', chain: 'c_a' }, { beat: 3, boss: 'all', chain: 'c_a' }, { beat: 4, boss: 'all', chain: 'c_a' }, { beat: 5, boss: 'all', chain: 'c_a' }];
    const e = errs(prep(list));
    expect(e).toContain('cond-flux'); expect(e).toContain('cond-no-window');
  });
  it('два неотбиваемых удара разных боссов вплотную', () => {
    const list = trioBosses('fx_v4');
    for (const r of list) { r['attacks'] = [{ ...(r['attacks'][0] as Raw), id: 'swing', tell: { frames: 34, cue: { color: 'purple', sfx: 'x', pose: 'y' } }, active: [{ from: 0, to: 5, hit: { x: 6, y: 14, w: 72, h: 56 }, dmg: 1, kind: 'unblockable' }] }, ...(r['attacks'] as Raw[]).slice(1)]; }
    list[0]!['conductor'].schedule = [{ beat: 0, boss: 0, chain: 'c_a' }, { beat: 1, boss: 1, chain: 'c_a' }];
    list[0]!['conductor'].relay = []; list[0]!['conductor'].beat = 20;
    expect(errs(prep(list))).toContain('cond-unblock');
  });
  it('рассинхрон: приказ занятому боссу — предупреждение; неизвестная связка/босс/арена — ошибка при загрузке', () => {
    const list = trioBosses('fx_v5'); list[0]!['conductor'].schedule = [{ beat: 0, boss: 0, chain: 'c_a' }, { beat: 1, boss: 0, chain: 'c_a' }];
    const issues = validateRaw(prep(list), BOSS_RULES, info);
    expect(issues.map((i) => i.code)).toContain('cond-overlap');
    const bad = trioBosses('fx_v6'); bad[0]!['conductor'].schedule[0].chain = 'нет'; expect(() => registerBoss(bad[0]!)).toThrow(/нет связки/);
    const bad2 = trioBosses('fx_v7'); bad2[0]!['conductor'].schedule[0].boss = 5; expect(() => registerBoss(bad2[0]!)).toThrow();
    const bad3 = trioBosses('fx_v8'); bad3[0]!['conductor'].schedule[0].arena = 'нет'; expect(() => registerBoss(bad3[0]!)).toThrow(/сущность арены/);
  });
});
