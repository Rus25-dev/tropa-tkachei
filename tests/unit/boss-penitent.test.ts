// Первый Кающийся: загрузка, детерминизм, язык цветов в фазе 1, тихий переход фазы как приём, смесь цветов в фазе 2, отрисовка с пустым Graphics.
import { describe, expect, it } from 'vitest';
import { damageBoss } from '../../src/core/damage';
import { dstate } from '../../src/core/boss/exec';
import { BOSS_RULES, bossDef } from '../../src/core/boss/registry';
import { validateRaw } from '../../src/core/boss/validate';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { arenaInfo } from '../../tools/boss/files';
import { drawDataBoss } from '../../src/view/draw/bosses';
import raw from '../../data/bosses/penitent.json' with { type: 'json' };

const def = () => bossDef('penitent')!;
function away(w: World, dx = 500): void {
  const b = w.bosses[0]!, p = w.players[0]!;
  p.x = b.x - dx; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; p.safeX = p.x; p.safeY = p.y; p.vx = 0; w.hitstop = 0;
}
const run = (w: World, n: number): void => { for (let i = 0; i < n; i++) { away(w); w.tick(); } };
function fakeG(): never {
  const g: unknown = new Proxy({}, { get: () => () => g });
  return g as never;
}

describe('Первый Кающийся', () => {
  it('загружен: 2 фазы, 9+ связок, все цвета замаха представлены', () => {
    expect(def()).toBeTruthy();
    const d = def(), w = new World({ seed: 1, mode: 'bosstest', boss: 'penitent', players: 1 });
    expect(w.bosses).toHaveLength(1);
    expect(d.phases).toHaveLength(2);
    expect(d.chains.length).toBeGreaterThanOrEqual(9);
    const colors = new Set(d.attacks.map((a) => a.tell.cue.color));
    expect([...colors].sort()).toEqual(['purple', 'red', 'white', 'yellow']);
  });

  it('валидатор: ошибок нет', () => {
    const issues = validateRaw(raw as unknown as Record<string, unknown>, BOSS_RULES, arenaInfo('vladik'));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('фаза 1 учит языку по одному цвету: нет «обманок» (красный и жёлтый хлёст разведены связками), фаза 2 их смешивает в одной связке', () => {
    const d = def();
    const colorOf = (id: string): string => d.attacks.find((a) => a.id === id)!.tell.cue.color;
    const mixed = (chainId: string): boolean => new Set(d.chains.find((c) => c.id === chainId)!.steps.map((s) => colorOf(s.attack))).size > 1;
    for (const id of d.phases[0]!.policy.chains) expect(mixed(id), id).toBe(false);
    const p2 = d.phases[1]!.policy.chains.filter(mixed);
    expect(p2.length).toBeGreaterThanOrEqual(4);
    // «Кровавый хлёст» повторяет звук и позу «Хлёста цепью», но цвет другой
    const a = d.attacks.find((x) => x.id === 'lash')!.tell.cue, s = d.attacks.find((x) => x.id === 'scourge')!.tell.cue;
    expect([s.sfx, s.pose]).toEqual([a.sfx, a.pose]); expect(s.color).not.toBe(a.color);
    // новые приёмы фазы 2 (широкий замах, метание, вращение) в фазе 1 недоступны
    for (const id of ['c_sweep', 'c_hurl', 'c_spin']) { expect(d.phases[0]!.policy.chains).not.toContain(id); expect(d.phases[1]!.policy.chains).toContain(id); }
  });

  it('переход в фазу 2 — приём, а не ролик: без рёва и сцены, телеграф «Срыв вериг», босс уязвим, тело шире', () => {
    {
      const w = new World({ seed: 1, mode: 'bosstest', boss: 'penitent', players: 1 });
      const b = w.bosses[0]!, d = dstate(b);
      run(w, def().intro.frames + 5);
      expect(b.w).toBe(52);
      b.hp = Math.floor(b.maxHp * 0.5) + 1; w.fxq.length = 0; damageBoss(w, 'd0', w.players[0]!);
      expect(b.phase).toBe(2); expect(b.state).not.toBe('rage'); expect(d.mode).toBe('attack'); expect(d.enter).toBe(true); expect(d.atk).toBe('unchain');
      expect(w.fxq.filter((e) => e.k === 'flash')).toHaveLength(0);
      expect(b.w).toBe(58); expect(b.h).toBe(104); expect(d.formPh).toBe(2);
      run(w, 3); expect(b.state).toBe('tell'); expect(d.cue?.color).toBe('white');
      const h = b.hp; damageBoss(w, 'd0', w.players[0]!); expect(b.hp).toBe(h - 1); // не неуязвим
      // после приёма идут только связки фазы 2
      d.mem.hist.length = 0;
      for (let i = 0; i < 6000; i++) { run(w, 1); b.hp = Math.floor(b.maxHp * 0.45); }
      const p2 = new Set(def().phases[1]!.policy.chains.concat('c_shove', 'c_leap'));
      expect(d.mem.hist.length).toBeGreaterThan(5);
      expect(d.mem.hist.every((c) => p2.has(c))).toBe(true);
    }
  });

  it('детерминизм: то же зерно и ввод — то же состояние', () => {
    const go = (): string => {
      const w = new World({ seed: 5, mode: 'bosstest', boss: 'penitent', players: 1 });
      const fz = makeFuzzer(w, 5);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.hp, dstate(b).mem.hist])]);
    };
    expect(go()).toBe(go());
  });

  it('рисунок обеих фаз проходит на пустом Graphics во всех состояниях', () => {
    const w = new World({ seed: 2, mode: 'bosstest', boss: 'penitent', players: 1, fx: true });
    const b = w.bosses[0]!;
    expect(() => {
      for (let i = 0; i < 900; i++) { away(w); w.tick(); drawDataBoss(w, b, fakeG(), i / 10); }
      b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', w.players[0]!);
      for (let i = 0; i < 1500; i++) { away(w); w.tick(); b.hp = Math.floor(b.maxHp * 0.45); drawDataBoss(w, b, fakeG(), i / 10); }
    }).not.toThrow();
    expect(dstate(b).formPh).toBe(2);
  });
});
