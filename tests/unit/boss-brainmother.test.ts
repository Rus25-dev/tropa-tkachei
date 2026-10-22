// «Мозг-мать»: загрузка, неподвижность, броня и ядро, кольца-стражи, финальная сцена, детерминизм, отрисовка без браузера.
import { describe, expect, it } from 'vitest';
import { dstate, enterPhase, forceChain, weakStates } from '../../src/core/boss/exec';
import { minionsAlive } from '../../src/core/boss/minions';
import { BOSS_RULES, bossDef } from '../../src/core/boss/registry';
import { validateBoss } from '../../src/core/boss/validate';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { arenaInfo } from '../../tools/boss/files';
import { World } from '../../src/core/world';
import { drawDataBoss } from '../../src/view/draw/bosses';
import { bodyDrawer, creatureDrawer } from '../../src/view/draw/bossdraw';

const ID = 'brainmother', FLOOR = 18 * 32;
const mk = (seed = 1): World => new World({ seed, mode: 'bosstest', boss: ID, players: 1, fx: true });
const safe = (w: World): void => { const p = w.players[0]!; p.x = 60; p.y = FLOOR - p.h; p.vx = 0; p.hp = p.maxHp = 9999; w.hitstop = 0; };
const tickN = (w: World, n: number): void => { for (let i = 0; i < n; i++) { safe(w); w.tick(); } };
function fakeG(): never {
  const g: unknown = new Proxy({}, { get: () => () => g });
  return g as never;
}

describe('Мозг-мать', () => {
  it('загружена: неподвижная, с ядром, тремя фазами и существом-кольцом; валидатор без ошибок', () => {
    const def = bossDef(ID)!;
    expect(def).toBeTruthy();
    expect(def.still).toBe(true); expect(def.phases).toHaveLength(3); expect(def.creatures.map((c) => c.id)).toEqual(['ring']);
    expect(def.chains.filter((c) => c.id !== 'c_shove' && c.id !== 'c_hail' && !c.id.startsWith('c_enter')).length).toBeGreaterThanOrEqual(6);
    expect(validateBoss(def, BOSS_RULES, arenaInfo('vladik')).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('стоит на месте; ядро закрыто в покое и открывается в окне наказания', () => {
    const w = mk(), b = w.bosses[0]!, x0 = b.x, y0 = b.y;
    tickN(w, 200);
    expect(b.x).toBe(x0); expect(b.y).toBe(y0);
    expect(weakStates(b).every((s) => !s.open)).toBe(true);
    forceChain(w, 0, 'c_volley'); let opened = false;
    for (let i = 0; i < 300 && !opened; i++) { tickN(w, 1); opened = weakStates(b).some((s) => s.open); }
    expect(opened).toBe(true); expect(dstate(b).punish).toBe(true);
  });

  it('«Зов колец» призывает двух стражей; смена фазы их убирает', () => {
    const w = mk(); tickN(w, 200);
    forceChain(w, 0, 'c_rings'); tickN(w, 60);
    expect(minionsAlive(w, 'ring')).toHaveLength(2);
    enterPhase(w, 0, 2); tickN(w, 5);
    expect(minionsAlive(w, 'ring')).toHaveLength(0);
  });

  it('третья фаза начинается со скипаемой сцены и без неё не пропускается дольше нормы', () => {
    const def = bossDef(ID)!, sc = def.phases[2]!.scene!;
    expect(sc.skippable).toBe(true); expect(sc.frames).toBeLessThanOrEqual(480);
    const w = mk(); tickN(w, 200);
    enterPhase(w, 0, 3); tickN(w, 100);
    expect(dstate(w.bosses[0]!).mode).toBe('scene');
    tickN(w, sc.frames + 80);
    expect(dstate(w.bosses[0]!).mode).not.toBe('scene'); expect(w.bosses[0]!.phase).toBe(3);
  });

  it('детерминизм: то же зерно и ввод — то же состояние', () => {
    const run = (): string => {
      const w = mk(5), fz = makeFuzzer(w, 5);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.hp, dstate(b).mem.hist])]);
    };
    expect(run()).toBe(run());
  });

  it('рисунок: тело трёх фаз и кольцо рисуются пустым Graphics', () => {
    expect(bodyDrawer(ID, null)).toBeTruthy(); expect(bodyDrawer(ID, 'shattered')).toBeTruthy(); expect(bodyDrawer(ID, 'frenzy')).toBeTruthy();
    expect(creatureDrawer(ID, 'ring')).toBeTruthy();
    const w = mk(); const b = w.bosses[0]!;
    expect(() => { for (let i = 0; i < 300; i++) { tickN(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow();
    for (const ph of [2, 3]) { enterPhase(w, 0, ph); expect(() => { for (let i = 0; i < 500; i++) { tickN(w, 1); drawDataBoss(w, b, fakeG(), i / 10); } }).not.toThrow(); }
    forceChain(w, 0, 'c_rings'); tickN(w, 200);
    const e = w.enemies.find((x) => x['m']);
    if (e) expect(() => creatureDrawer(ID, 'ring')!(e as never, fakeG(), 1, { color: 1, alpha: 1, tell: true, rgb: 2 })).not.toThrow();
  });
});
