// No-hit бот (tools/bot/nohit.ts): копия мира точна, каждая связка манекена проходима без урона, бой проходится безупречно;
// заведомо нечестная связка (три удара по всей арене через 22 кадра — откат рывка не успевает) ловится как «нет выхода».
import { describe, expect, it } from 'vitest';
import { registerBoss } from '../../src/core/boss/registry';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { cloneWorld } from '../../tools/bot/clone';
import { loadBossFiles } from '../../tools/boss/files';
import { NoHitPilot, parryImplemented, runFlawless, scanChains } from '../../tools/bot/nohit';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- черновое определение в тесте

const snap = (w: World): string => JSON.stringify([w.players, w.bosses, w.projs, w.tickN, w.hitstop, w.timeSec]);

describe('копия мира для заглядывания вперёд', () => {
  it('копия и оригинал дальше идут одинаково при одинаковом вводе; оригинал копией не меняется', () => {
    const w = new World({ seed: 7, mode: 'bosstest', boss: 'dummy', players: 1 });
    const fz = makeFuzzer(w, 7);
    for (let i = 0; i < 900; i++) { feedInput(w, [fz(0)]); w.tick(); }
    const before = snap(w);
    const c = cloneWorld(w);
    expect(snap(c)).toBe(before);
    // пробег копии вперёд не трогает оригинал
    const fz2 = makeFuzzer(c, 99);
    for (let i = 0; i < 300; i++) { feedInput(c, [fz2(0)]); c.tick(); }
    expect(snap(w)).toBe(before);
    // обе стороны с общим вводом дают то же состояние (включая решения босса из ГСЧ)
    const a = cloneWorld(w), b = cloneWorld(w), fz3 = makeFuzzer(w, 5);
    for (let i = 0; i < 1500; i++) { const r = fz3(0); feedInput(a, [r]); a.tick(); feedInput(b, [r]); b.tick(); feedInput(w, [r]); w.tick(); }
    expect(snap(a)).toBe(snap(b)); expect(snap(a)).toBe(snap(w));
  });
});

describe('no-hit: проходимость', () => {
  it('режим parry отключён, пока в ядре нет Парирования 2.0 (HitKind-логики)', () => {
    if (parryImplemented()) expect(() => new NoHitPilot({ mode: 'parry' })).not.toThrow();
    else expect(() => new NoHitPilot({ mode: 'parry' })).toThrow(/Парирования 2\.0/);
  });
  // непроходимая связка в data/bosses/*.json — ошибка баланса и падение теста
  for (const f of loadBossFiles()) {
    it(`«${f.id}»: каждая связка каждой фазы проходима без урона из разных положений`, () => {
      registerBoss(f.raw);
      const rs = scanChains({ boss: f.id, bossAt: [0.04, 0.5, 0.96], offsets: [-250, -90, -45, 45, 90, 250], seed: 11 });
      expect(rs.length).toBeGreaterThanOrEqual(1);
      for (const r of rs) expect(r.passable, `фаза ${r.phase}, ${r.chain}: ${JSON.stringify(r.fails[0]?.forced)}`).toBe(true);
    }, 300_000);
    it(`«${f.id}»: бой проходится безупречно (без единого удара), босс убит`, () => {
      registerBoss(f.raw);
      for (const seed of [1, 2, 3]) {
        const r = runFlawless(f.id, seed, {}, 300);
        expect(r.won, `бой ${seed}`).toBe(true);
        expect(r.hits, `бой ${seed}: ${JSON.stringify(r.forced[0])}`).toBe(0);
        expect(r.sec).toBeGreaterThan(15);
      }
    }, 300_000);
  }
  for (const [id, froms, ok] of [['x_unfair', [0, 22, 44], false], ['x_fair', [0, 22], true]] as const) it(`удары на всю арену на кадрах ${froms.join(', ')}: ${ok ? 'проходима (рывок + неуязвимость после него)' : 'нет выхода (откат рывка не успевает)'}`, () => {
    const wall = { x: -700, y: -300, w: 1400, h: 380 };
    const raw: Raw = {
      id, name: 'Нечестный', arena: 'vladik', size: { w: 40, h: 78 }, hp: [60, 80], intro: { frames: 1 },
      attacks: [{
        id: 'wall', tell: { frames: 30, cue: { color: 'red', sfx: 'slam', pose: 'overhead' } },
        active: froms.map((from) => ({ from, to: from, hit: wall, dmg: 1, kind: 'dodge' })),
        recovery: { frames: 40, punishWindow: { from: 6, to: 35 } },
      }],
      chains: [{ id: 'c_wall', steps: [{ attack: 'wall' }], weight: 1 }],
      phases: [{ fromHp: 1, policy: { chains: ['c_wall'], noRepeat: 0, restFrames: [30, 30] } }],
      antiCheese: { enabled: false },
    };
    registerBoss(raw);
    const rs = scanChains({ boss: id, bossAt: [0.5], offsets: [-120, 120], seed: 3 });
    expect(rs).toHaveLength(1);
    const r = rs[0]!;
    expect(r.passable).toBe(ok);
    if (!ok) {
      const f = r.fails[0]!.forced; // кадр атаки и положение героя названы
      expect(f.attack).toBe('wall'); expect(f.attackFrame).not.toBeNull(); expect(f.hero.dx).not.toBe(0);
      expect(f.exhausted).toBe(true);
    }
  }, 60_000);
});
