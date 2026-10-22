// Тима Пиво на каркасе (tima2): данные, особая логика kinds/tima2.ts (лужи, банкротство, лаг, пыль и разгон), фазы, отрисовка без браузера.
import { describe, expect, it } from 'vitest';
import { dstate, enterPhase, forceChain } from '../../src/core/boss/exec';
import { kindOf } from '../../src/core/boss/kinds';
import { BOSS_RULES, bossDef } from '../../src/core/boss/registry';
import { validateBoss } from '../../src/core/boss/validate';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { bodyDrawer } from '../../src/view/draw/bossdraw';
import { drawDataBoss } from '../../src/view/draw/bosses';

const mk = (seed = 1, players: 1 | 2 = 1): World => new World({ seed, mode: 'bosstest', boss: 'tima2', players, fx: true });
const FLOOR = 18 * 32;
/** герой стоит на полу в точке x (центр), неуязвим по здоровью */
const stand = (w: World, x: number): void => { const p = w.players[0]!; p.x = x - 7; p.y = FLOOR - p.h; p.vx = 0; p.vy = 0; p.hp = p.maxHp = 999; w.hitstop = 0; };
const tickN = (w: World, n: number, x = 300): void => { for (let i = 0; i < n; i++) { stand(w, x); w.tick(); } };
const untilIdle = (w: World, x = 300): void => { for (let g = 0; g < 400 && dstate(w.bosses[0]!).mode !== 'idle'; g++) { stand(w, x); w.tick(); } };

/** Graphics, записывающий вызовы */
function fakeG(): { g: never; log: [string, unknown[]][] } {
  const log: [string, unknown[]][] = [];
  const g = new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => { log.push([name, a]); return g; } });
  return { g: g as never, log };
}

describe('Тима Пиво на каркасе: данные', () => {
  it('босс загружен, особая логика и рисунок найдены сами; арена Тимы, три фазы, связок не меньше девяти', () => {
    const def = bossDef('tima2')!;
    expect(def).toBeTruthy(); expect(kindOf('tima2')).toBeTruthy(); expect(bodyDrawer('tima2', null)).toBeTypeOf('function');
    expect(bodyDrawer('tima2', 'angry')).not.toBe(bodyDrawer('tima2', 'fury'));
    expect(def.arena).toBe('tima'); expect(def.phases).toHaveLength(3); expect(def.phases[2]!.silent).toBe(true);
    expect(def.chains.length).toBeGreaterThanOrEqual(9);
    const w = mk(); expect(w.bosses).toHaveLength(1); expect(w.bosses[0]!.w).toBe(48);
  });
  it('вторая фаза даёт связки, которых нет в первой; каждый приём имеет телеграф и окно наказания', () => {
    const def = bossDef('tima2')!, p1 = new Set(def.phases[0]!.policy.chains), p2 = def.phases[1]!.policy.chains.filter((c) => !p1.has(c));
    expect(p2.length).toBeGreaterThanOrEqual(3);
    for (const a of def.attacks) { expect(a.tell.frames).toBeGreaterThanOrEqual(24); expect(a.recovery.punishWindow.to).toBeGreaterThan(a.recovery.punishWindow.from); }
  });
  it('валидатор честности: без ошибок', () => {
    expect(validateBoss(bossDef('tima2')!, BOSS_RULES).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('детерминизм: то же зерно и ввод — то же состояние (включая лужи и разгон)', () => {
    const run = (): string => {
      const w = mk(5); const fz = makeFuzzer(w, 5);
      for (let i = 0; i < 4000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp, p.silk]), w.bosses.map((b) => [b.x, b.hp, b['hyper'], dstate(b).mem.hist]), w.puddles]);
    };
    expect(run()).toBe(run());
  });
});

describe('Тима Пиво: особая логика', () => {
  it('лужа: бутылка, упавшая на пол, оставляет лужу на 5 с, которая гаснет сама', () => {
    const w = mk(); untilIdle(w); w.bosses[0]!.x = 1000;
    expect(forceChain(w, 0, 'c_lob')).toBe(true);
    tickN(w, 30 + 120, 200);
    expect((w.puddles ?? []).length).toBeGreaterThan(0);
    const q = w.puddles![0]!; expect(q.y).toBe(FLOOR); expect(q.t).toBeLessThanOrEqual(5);
    tickN(w, 5 * 60 + 5, 200); expect(w.puddles).not.toContain(q); // эта лужа высохла (босс мог пролить новые)
  });

  it('банкротство: нить пополам только у героя, которого задела печать (стоящего вплотную), прыжок над ней нить сохраняет', () => {
    const near = mk(); untilIdle(near); const b = near.bosses[0]!, cx = b.x + b.w / 2;
    near.players[0]!.silk = 8; forceChain(near, 0, 'c_bank');
    for (let i = 0; i < 46 + 3; i++) { stand(near, cx - 40); near.tick(); }
    expect(near.players[0]!.silk).toBe(4);
    const air = mk(); untilIdle(air); const b2 = air.bosses[0]!, cx2 = b2.x + b2.w / 2;
    air.players[0]!.silk = 8; forceChain(air, 0, 'c_bank');
    for (let i = 0; i < 46 + 3; i++) { stand(air, cx2 - 40); air.players[0]!.y = FLOOR - air.players[0]!.h - 120; air.tick(); }
    expect(air.players[0]!.silk).toBe(8);
  });

  it('лаг: Тима исчезает с места и падает на точку, где стоял герой к концу замаха', () => {
    const w = mk(); untilIdle(w); const b = w.bosses[0]!;
    expect(forceChain(w, 0, 'c_lag')).toBe(true);
    let sawHigh = false;
    for (let i = 0; i < 44 + 40; i++) { stand(w, 600); w.tick(); if (b.y < 200) sawHigh = true; }
    expect(sawHigh).toBe(true);
    for (let i = 0; i < 60; i++) { stand(w, 600); w.tick(); }
    expect(Math.abs(b.x + b.w / 2 - 600)).toBeLessThan(40);
    expect(b.y + b.h).toBeLessThanOrEqual(FLOOR + 1);
  });

  it('пыль: три удара, пока Тима чертит круг, обрывают приём — он чихает и стоит; без ударов он разгоняется, паузы короче', () => {
    const w = mk(); untilIdle(w); const b = w.bosses[0]!, d = dstate(b);
    expect(forceChain(w, 0, 'c_dust')).toBe(true);
    tickN(w, 10);
    for (let k = 0; k < 3; k++) { b.hp -= 1; tickN(w, 2); }
    expect(d.mode).toBe('idle'); expect(b['sneeze']).toBeGreaterThan(0); expect(b['hyper'] ?? 0).toBe(0);
    expect(d.rest).toBeGreaterThanOrEqual(150);
    tickN(w, 100); expect(b['sneeze']).toBe(0);

    const v = mk(); untilIdle(v); const b2 = v.bosses[0]!;
    forceChain(v, 0, 'c_dust'); tickN(v, 64 + 52);
    expect(b2['hyper']).toBeGreaterThan(0);
    // разогнанный Тима не чертит круг второй раз
    const k = kindOf('tima2')!; expect(k.allow!({ sc: v, b: b2, d: dstate(b2), def: bossDef('tima2')!, i: 0, rng: v.rBoss }, 'c_dust')).toBe(false);
  });
});

describe('Тима Пиво: фазы и отрисовка', () => {
  it('вторая фаза: рёв, сцена, переходный приём «коллекторы» — призваны два коллектора; третья — без рёва, переходная ачивка', () => {
    const w = mk(); untilIdle(w); const b = w.bosses[0]!, d = dstate(b);
    expect(enterPhase(w, 0, 2)).toBe(true);
    let guard = 0; while (!(d.mode === 'attack' && d.atk === 'collect') && guard++ < 500) tickN(w, 1, 500);
    expect(d.atk).toBe('collect'); expect(d.chain).toBe('c_coll');
    tickN(w, 45, 500);
    expect(w.enemies.filter((e) => e['m'] && !e.dead).length).toBe(2);
    untilIdle(w, 500);
    expect(enterPhase(w, 0, 3)).toBe(true);
    expect(d.mode).not.toBe('rage'); // silent: переход без рёва
    tickN(w, 5, 500); expect(d.atk).toBe('trophy');
  });

  it('тело рисуется во всех фазах и на всех приёмах без ошибок; в замахе есть общий контур телеграфа', () => {
    const w = mk(); untilIdle(w); const b = w.bosses[0]!;
    const def = bossDef('tima2')!;
    for (const ph of [1, 2, 3] as const) {
      if (ph > 1) { untilIdle(w); enterPhase(w, 0, ph); for (let i = 0; i < 400 && dstate(b).mode !== 'idle'; i++) tickN(w, 1, 500); }
      for (const a of def.attacks.filter((x) => x.id !== 'shove' && x.id !== 'leap')) {
        untilIdle(w, 500);
        const c = def.chains.find((x) => x.steps[0]!.attack === a.id && (!x.requires?.phase || x.requires.phase.includes(ph)));
        if (!c) continue;
        forceChain(w, 0, c.id);
        for (let i = 0; i < a.tell.frames + 60; i++) { tickN(w, 1, 500); drawDataBoss(w, b, fakeG().g, i / 10); }
      }
    }
    // в замахе рисуется контур цвета замаха
    untilIdle(w, 500); forceChain(w, 0, 'c_ring'); tickN(w, 10, 500);
    const f = fakeG(); drawDataBoss(w, b, f.g, 1);
    expect(f.log.some(([m, a]) => m === 'lineStyle' && a[1] === 0xff4a3a)).toBe(true);
  });
});
