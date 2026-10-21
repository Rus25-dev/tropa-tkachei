// Защита от читов для боссов на данных (src/core/boss/anti.ts + исполнитель): «отогнать», убывающая отдача оглушений, потолок урона за окно оглушения,
// запрет спама атаки, самооглушение от стены с откатом, перемещение при долгой безнаказанной близости. Старые боссы правилами не затронуты.
import { describe, expect, it } from 'vitest';
import dummyJson from '../../data/bosses/dummy.json' with { type: 'json' };
import { STAGGER_T } from '../../src/core/balance';
import { dstate, forceChain, type DState } from '../../src/core/boss/exec';
import { eligible, newMem, noteUse, pickChain, tickMem, type PickCtx } from '../../src/core/boss/policy';
import { BOSS_RULES, bossDef, registerBoss } from '../../src/core/boss/registry';
import { resolveAnti, staggerCap } from '../../src/core/boss/anti';
import { parseRules } from '../../src/core/boss/schema';
import { poiseAdd, execBoss } from '../../src/core/bosses2';
import { damageBoss } from '../../src/core/damage';
import type { BossRef } from '../../src/core/balance';
import type { Boss } from '../../src/core/types';
import { World } from '../../src/core/world';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- правка JSON в тестах
const dummyRaw = (): Raw => JSON.parse(JSON.stringify(dummyJson)) as Raw;
const dummy = bossDef('dummy')!;

/** Босс с одной атакой-таранe: рывок к стене (wall) без ударов по героям; hp побольше */
function oneAttack(id: string, over: Raw = {}): Raw {
  return {
    id, name: 'Тестовый', arena: 'vladik', size: { w: 40, h: 78 }, hp: [100, 100], intro: { frames: 1 },
    attacks: [{
      id: 'a', tell: { frames: 20, cue: { color: 'yellow', sfx: 'swing', pose: 'raise' } },
      active: [{ from: 0, to: 3, hit: { x: 0, y: 0, w: 10, h: 10 }, dmg: 1, kind: 'parry' }],
      recovery: { frames: 18, punishWindow: { from: 2, to: 17 } },
    }],
    chains: [{ id: 'c', steps: [{ attack: 'a' }], weight: 1 }],
    phases: [{ fromHp: 1, policy: { chains: ['c'], noRepeat: 0, restFrames: [0, 0] } }],
    ...over,
  };
}
function make(def: Raw, opts: { seed?: number } = {}): { w: World; b: Boss; d: DState } {
  registerBoss(def);
  const w = new World({ seed: opts.seed ?? 1, mode: 'bosstest', boss: def['id'] as string, players: 1 });
  const b = w.bosses[0]!;
  return { w, b, d: dstate(b) };
}
const far = (w: World, dx = 400): void => { const b = w.bosses[0]!, p = w.players[0]!; p.x = b.x + b.w + dx; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; p.safeX = p.x; p.safeY = p.y; w.hitstop = 0; };
const tickN = (w: World, n: number, each?: () => void): void => { for (let i = 0; i < n; i++) { each?.(); w.tick(); } };
const ctx = (o: Partial<PickCtx> = {}): PickCtx => ({ dist: 200, side: 'center', hpFrac: 1, phase: 1, closeF: {}, ...o });

describe('настройки: rules.json + переопределения босса', () => {
  it('по умолчанию включено для манекена; числа берутся из rules.json', () => {
    const a = resolveAnti(dummy)!;
    expect(a.shoveChain).toBe('c_shove'); expect(a.relocateChain).toBe('c_leap');
    expect(a.shove).toEqual(BOSS_RULES.antiCheese!.shove);
    expect(a.shove.sec).toBe(2.5); expect(a.shove.cornerSec).toBe(2); expect(a.relocate.sec).toBe(12);
    expect(a.stagger.dmgCapFrac).toBeCloseTo(0.18);
  });
  it('флаг enabled=false выключает всё; частичные переопределения числа', () => {
    const off = registerBoss({ ...dummyRaw(), id: 'x_off', antiCheese: { enabled: false } });
    expect(resolveAnti(off)).toBeNull();
    const tuned = registerBoss({ ...dummyRaw(), id: 'x_tuned', antiCheese: { shoveChain: 'c_shove', shove: { sec: 4 }, wallStun: false } });
    const a = resolveAnti(tuned)!;
    expect(a.shove.sec).toBe(4); expect(a.shove.cornerSec).toBe(2); expect(a.wallStun).toBeNull();
    const bare = registerBoss({ ...dummyRaw(), id: 'x_bare', antiCheese: undefined });
    expect(resolveAnti(bare)).not.toBeNull(); // без блока — по умолчанию включено
  });
  it('без блока antiCheese в правилах защиты нет', () => {
    const r = parseRules({ ...(JSON.parse(JSON.stringify(BOSS_RULES)) as object), antiCheese: undefined });
    expect(resolveAnti(dummy, r)).toBeNull();
  });
});

describe('а) «отогнать»', () => {
  it('вплотную 2.5 с (150 кадров) — отгон; у стены 2.0 с (120 кадров)', () => {
    const mem = newMem();
    expect(pickChain(dummy, ctx({ closeF: { c_shove: 149 } }), mem, 0.9)).not.toBe('c_shove');
    expect(pickChain(dummy, ctx({ closeF: { c_shove: 150 } }), mem, 0.9)).toBe('c_shove');
    expect(pickChain(dummy, ctx({ closeF: { c_shove: 119 }, corner: true }), mem, 0.9)).not.toBe('c_shove');
    expect(pickChain(dummy, ctx({ closeF: { c_shove: 120 }, corner: true }), mem, 0.9)).toBe('c_shove');
    expect(pickChain(dummy, ctx({ closeF: { c_shove: 120 }, corner: false }), mem, 0.9)).not.toBe('c_shove');
  });
  it('в живом бою: герой, прижатый к стене вплотную к боссу, получает отгон на 2 с, а не на 2.5', () => {
    const first = (corner: boolean): number => {
      const { w, b, d } = make(dummyRaw(), { seed: 5 });
      // босс у левой стены, герой между боссом и стеной не встанет — ставим героя у стены, босс подходит
      let t = 0;
      for (; t < 1500; t++) {
        const p = w.players[0]!;
        const x = corner ? 32 + 12 : b.x + b.w / 2 - 7 + 30; // у стены или рядом с боссом в центре
        p.x = x; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; b.hp = b.maxHp; w.hitstop = 0;
        if (corner) { b.x = 32 + 40; b.vx = 0; }
        w.tick();
        if (d.atk === 'shove') break;
      }
      return t;
    };
    const wall = first(true), mid = first(false);
    expect(wall).toBeLessThan(mid);
    expect(wall).toBeLessThan(120 + 130 + 60); // вступление 120 + порог 120 + запас на замах
  });
});

describe('б) убывающая отдача оглушений', () => {
  it('каждое следующее оглушение в окне 25 с короче (×0.75, ×0.5) и требует больше стойки (×1.25, ×1.5)', () => {
    const { w, b, d } = make(oneAttack('x_dim'));
    far(w); tickN(w, 5, () => far(w));
    const POISE = 7; // POISE_MAX[1]
    const run = (need: number): number => {
      b.stagger = 0; b['poiseImmune'] = 0; b['poise'] = 0; b.state = 'idle';
      for (let i = 0; i < need - 1; i++) poiseAdd(w, b, 1);
      expect(b.stagger, `за ${need - 1} удар(ов) оглушения ещё не должно быть`).toBe(0);
      poiseAdd(w, b, 1);
      return b.stagger;
    };
    const s1 = run(POISE), s2 = run(Math.ceil(POISE * 1.25)), s3 = run(Math.ceil(POISE * 1.5));
    expect(s1).toBeCloseTo(STAGGER_T); expect(s2).toBeCloseTo(STAGGER_T * 0.75); expect(s3).toBeCloseTo(STAGGER_T * 0.5);
    expect(d.ac.stg).toHaveLength(3);
    // окно истекло — всё как в первый раз
    d.ac.clk += 25 * 60 + 5;
    expect(run(POISE)).toBeCloseTo(STAGGER_T);
  });
  it('старые боссы (без исполнителя на данных) оглушаются как прежде', () => {
    const w = new World({ seed: 1, mode: 'bosstest', boss: 'misha', players: 1 });
    const m = w.misha!; m.state = 'idle';
    for (let k = 0; k < 3; k++) { m.stagger = 0; m['poiseImmune'] = 0; m['poise'] = 0; for (let i = 0; i < 7; i++) poiseAdd(w, m, 1); expect(m.stagger).toBeCloseTo(STAGGER_T); }
  });
});

describe('в) потолок урона за окно оглушения', () => {
  it('за одно оглушение не больше ~18 % здоровья (но не меньше казни), после — без потолка', () => {
    const { w, b, d } = make(oneAttack('x_cap', { hp: [200, 200] }));
    far(w); tickN(w, 5, () => far(w));
    const p = w.players[0]!, cap = staggerCap(resolveAnti(bossDef('x_cap')!)!, b.maxHp);
    expect(cap).toBe(36);
    for (let i = 0; i < 7; i++) poiseAdd(w, b, 1);
    expect(b.stagger).toBeGreaterThan(0);
    const hp0 = b.hp;
    for (let i = 0; i < 40; i++) damageBoss(w, 'd0', p);          // двойной урон по оглушённому
    expect(hp0 - b.hp).toBeLessThanOrEqual(cap);
    expect(hp0 - b.hp).toBeGreaterThanOrEqual(cap - 2);
    const h1 = b.hp; execBoss(w, p, { key: 'd0' as BossRef }, 'u'); // казнь уже не пройдёт сверх потолка
    expect(h1 - b.hp).toBe(0);
    b.stagger = 0; b['poiseImmune'] = 5; d.ac.stgHp0 = -1;
    const h2 = b.hp; damageBoss(w, 'd0', p);
    expect(h2 - b.hp).toBe(1);                                      // вне оглушения — обычный удар
  });
  it('казнь на манекене проходит полностью: потолок не меньше её урона', () => {
    const { w, b } = make(structuredClone(dummyRaw()));
    far(w); tickN(w, 130, () => far(w));
    const p = w.players[0]!;
    for (let i = 0; i < 7; i++) poiseAdd(w, b, 1);
    const h = b.hp; execBoss(w, p, { key: 'd0' as BossRef }, 'u');
    expect(h - b.hp).toBeGreaterThanOrEqual(4);
  });
});

describe('г) запрет спама одной атаки', () => {
  it('атака, начатая maxUses раз за окно, в связки не попадает, пока окно не пройдёт', () => {
    const mem = newMem(), c = dummy.chains.find((x) => x.id === 'c_lunge')!, c2 = dummy.chains.find((x) => x.id === 'c_combo')!;
    // thrust входит в c_lunge и c_combo: после трёх начатых — обе недоступны
    noteUse(dummy, mem, c, 1); noteUse(dummy, mem, c, 1); noteUse(dummy, mem, c, 1);
    const ids = (): string[] => eligible(dummy, ctx({ dist: 120 }), mem, true).map((x) => x.id);
    expect(ids()).not.toContain('c_lunge'); expect(ids()).not.toContain('c_combo');
    expect(ids()).toContain('c_rain');
    for (let i = 0; i < 10 * 60 + 1; i++) tickMem(dummy, mem, 1);
    noteUse(dummy, mem, dummy.chains.find((x) => x.id === 'c_rain')!, 1); // последняя связка — не thrust: noRepeat мешать не будет
    expect(ids()).toContain('c_lunge'); expect(ids()).toContain('c_combo');
    void c2;
  });
});

describe('д) самооглушение от стены с откатом', () => {
  const ram = (): Raw => oneAttack('x_ram', {
    attacks: [{
      id: 'a', tell: { frames: 20, cue: { color: 'red', sfx: 'dash', pose: 'lean' } },
      move: [{ from: 0, to: 40, vx: 700, toward: 'wall' }],
      recovery: { frames: 18, punishWindow: { from: 2, to: 17 } },
    }],
  });
  it('рывок в стену оглушает босса; второе такое же — только после отката', () => {
    const def = ram(); def['antiCheese'] = { wallStun: { cooldownSec: 10 } }; // откат короче окна убывающей отдачи (25 с)
    const { w, b, d } = make(def);
    far(w, 500); tickN(w, 5, () => far(w, 500));
    b.x = 32 + 90; b.vx = 0; // у левой стены, рывок к ближайшей стене
    const run = (): number => {
      b.x = 32 + 90; b.stagger = 0; b['poiseImmune'] = 0;
      expect(forceChain(w, 0, 'c')).toBe(true);
      let stunned = 0;
      for (let i = 0; i < 90; i++) { far(w, 500); w.tick(); if (b.stagger > 0) { stunned = b.stagger; break; } }
      return stunned;
    };
    const s1 = run();
    expect(s1).toBeGreaterThan(0.9); expect(s1).toBeLessThanOrEqual(1.0001);
    d.mode = 'idle'; d.atk = null; d.chain = null;
    expect(run()).toBe(0); // откат
    d.ac.clk += 11 * 60;
    d.mode = 'idle'; d.atk = null; d.chain = null;
    const s3 = run();
    expect(s3).toBeCloseTo(s1 * 0.75, 1); // второе оглушение в окне 25 с — короче (убывающая отдача)
  });
  it('с wallStun:false босс стену не чувствует', () => {
    const def = ram(); def['antiCheese'] = { wallStun: false };
    const { w, b } = make(def);
    far(w, 500); tickN(w, 5, () => far(w, 500)); b.x = 32 + 90;
    forceChain(w, 0, 'c');
    let st = 0; for (let i = 0; i < 90; i++) { far(w, 500); w.tick(); st = Math.max(st, b.stagger); }
    expect(st).toBe(0);
  });
});

describe('е) долгая безнаказанная близость → перемещающая связка', () => {
  it('в выборе: 12 с (720 кадров) — c_leap, минуя веса', () => {
    const mem = newMem();
    expect(pickChain(dummy, ctx({ calmF: 719 }), mem, 0.1)).not.toBe('c_leap');
    expect(pickChain(dummy, ctx({ calmF: 720 }), mem, 0.1)).toBe('c_leap');
  });
  it('в бою: герой невредим и рядом 12 с — босс прыгает; без защиты — нет', () => {
    const used = (raw: Raw): boolean => {
      const { w, b, d } = make(raw, { seed: 4 });
      // «неуязвимый» герой стоит рядом; урон не набирается (hp не меняется)
      for (let i = 0; i < 60 * 40; i++) {
        const p = w.players[0]!;
        p.x = b.x + b.w / 2 - 7 + (b.x > 700 ? -200 : 200); p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; p.inv = 5; b.hp = b.maxHp; w.hitstop = 0;
        w.tick();
        if (d.mem.hist.includes('c_leap')) return true;
      }
      return false;
    };
    expect(used({ ...dummyRaw(), id: 'x_on' })).toBe(true);
    expect(used({ ...dummyRaw(), id: 'x_off2', antiCheese: { enabled: false } })).toBe(false);
  });
});
