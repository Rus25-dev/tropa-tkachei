// No-hit бот и волна 0: динамические платформы и лучи входят в поиск безопасного пути (бот ходит по копии мира), проверяются сцены и превращения,
// бои нескольких боссов и неподвижный босс с уязвимыми точками; заведомо нечестные расписания ловятся как «нет выхода».
import { describe, expect, it } from 'vitest';
import { registerBoss } from '../../src/core/boss/registry';
import { World } from '../../src/core/world';
import { runFlawless, scanChains, scanFight, scanTransitions, stageWorld } from '../../tools/bot/nohit';
import { arenaBoss, morphBoss, stillBoss, trioBosses, type Raw } from '../fixtures/bosses';

const reg = (...list: Raw[]): void => { for (const r of list) registerBoss(r); };
const SCAN = { bossAt: [0.05, 0.5, 0.95], offsets: [-250, -90, 45, 120, 300], seed: 11 };

describe('no-hit бот: волна 0', () => {
  it('превращение: связки обеих форм (в том числе летающая) проходимы, переход в фазу 2 со сценой переживается', () => {
    reg(morphBoss('fx_n1'));
    const rs = scanChains({ boss: 'fx_n1', ...SCAN });
    expect(rs.map((r) => `${r.phase}:${r.chain}`).sort()).toEqual(['1:c_swing', '2:c_dive', '2:c_orb']);
    for (const r of rs) expect(r.passable, `фаза ${r.phase} ${r.chain}: ${JSON.stringify(r.fails[0]?.forced)}`).toBe(true);
    const tr = scanTransitions({ boss: 'fx_n1', ...SCAN });
    expect(tr).toHaveLength(1);
    expect(tr[0]!.passable, JSON.stringify(tr[0]!.fails[0]?.forced)).toBe(true);
  }, 120_000);

  it('арена по расписанию: связки, лучи и платформы проходимы; бот видит платформы мира (они в копии) и встаёт на них', () => {
    reg(arenaBoss('fx_n2'));
    const w = stageWorld('fx_n2', 1, 0.5, 3);
    expect(w.arena!.ents.some((e) => e.on)).toBe(true); // bind.start запущен при постановке
    const rs = scanChains({ boss: 'fx_n2', ...SCAN });
    expect(rs.length).toBeGreaterThanOrEqual(4);
    for (const r of rs) expect(r.passable, `фаза ${r.phase} ${r.chain}: ${JSON.stringify(r.fails[0]?.forced)}`).toBe(true);
  }, 180_000);

  it('нечестная арена: зона по всему полу с коротким замахом и без платформ — нет выхода', () => {
    const raw = arenaBoss('fx_n3');
    const ents = (raw['arena'] as Raw)['ents'] as Raw[];
    ents[2] = { id: 'beam_a', kind: 'beam', hit: 'dodge', area: { x: 0, y: 0, w: 1344, h: 448 }, bind: { chain: 'c_beam', step: 0 }, timeline: [0, 22, 44].map((at) => ({ at, tell: 30, active: 1 })) };
    ents.splice(0, 2); ents.splice(2, 3);
    reg(raw);
    const rs = scanChains({ boss: 'fx_n3', chains: ['c_beam'], phases: [1], bossAt: [0.5], offsets: [-200, 200], seed: 5 });
    expect(rs).toHaveLength(1);
    expect(rs[0]!.passable).toBe(false);
    expect(rs[0]!.fails[0]!.forced.hero).toBeDefined();
  }, 60_000);

  it('несколько боссов: целый цикл расписания без ответа проходим; бой с убийством всех — безупречен', () => {
    const list = trioBosses('fx_n4'); reg(...list);
    const r = scanFight('fx_n4', [1, 2], {}, 2);
    for (const x of r) expect(x.passable, JSON.stringify(x.forced[0])).toBe(true);
    const f = runFlawless('fx_n4', 3, {}, 300);
    expect(f.won).toBe(true); expect(f.hits, JSON.stringify(f.forced[0])).toBe(0);
    expect(Object.keys(f.chains).some((k) => k.startsWith('fx_n4_b:'))).toBe(true); // связки считаются по боссам
  }, 240_000);

  it('нечестное расписание дирижёра: три стены через 11 кадров друг за другом — бот не находит выхода; одна стена из того же набора — находит', () => {
    const wall = { x: -700, y: -300, w: 1400, h: 380 };
    const mk = (id: string, bosses: number[], beat: number): Raw[] => {
      const list = trioBosses(id); const cd = list[0]!['conductor'];
      for (const r of list) {
        r['attacks'] = [{ id: 'swing', tell: { frames: 30, cue: { color: 'red', sfx: 'slam', pose: 'overhead' } }, active: [0, 22].map((from) => ({ from, to: from, hit: wall, dmg: 1, kind: 'dodge' })), recovery: { frames: 40, punishWindow: { from: 6, to: 35 } } }, ...(r['attacks'] as Raw[]).slice(1)];
        r['antiCheese'] = { enabled: false };
      }
      cd.schedule = bosses.map((boss, k) => ({ beat: k, boss, chain: 'c_a' })); cd.relay = []; cd.beat = beat; cd.cycle = 40;
      return list;
    };
    reg(...mk('fx_n5', [0, 1, 2], 11));
    const bad = scanFight('fx_n5', [1], { budget: 600 }, 1);
    expect(bad[0]!.passable).toBe(false); expect(bad[0]!.forced.length).toBeGreaterThan(0);
    reg(...mk('fx_n5b', [0], 11));
    const ok = scanFight('fx_n5b', [1], { budget: 600 }, 1);
    expect(ok[0]!.passable, JSON.stringify(ok[0]!.forced[0])).toBe(true);
  }, 180_000);

  it('неподвижный босс с уязвимыми точками: связки проходимы с любых позиций героя; бой выигрывается (бьём в открытые окна)', () => {
    reg(stillBoss('fx_n6'));
    const rs = scanChains({ boss: 'fx_n6', ...SCAN });
    for (const r of rs) expect(r.passable, `${r.chain}: ${JSON.stringify(r.fails[0]?.forced)}`).toBe(true);
    expect(rs.find((r) => r.chain === 'c_shove')).toBeDefined(); // отгон и перемещение проверяются тоже
    expect(rs.find((r) => r.chain === 'c_sweep')).toBeDefined();
    const f = runFlawless('fx_n6', 2, {}, 400);
    expect(f.hits, JSON.stringify(f.forced[0])).toBe(0);
    expect(f.won).toBe(true);
  }, 300_000);

  it('постановка мира: у неподвижного босса положение не меняется, у участников дирижёр отключён', () => {
    reg(stillBoss('fx_n7'));
    const w = stageWorld('fx_n7', 1, 0.05, 1), b = w.bosses[0]!;
    expect(Math.round(b.x + b.w / 2)).toBe(Math.round(32 + 0.55 * 42 * 32));
    reg(...trioBosses('fx_n8'));
    const w2 = stageWorld('fx_n8', 1, 0.5, 1);
    expect(w2.cond).toBeNull(); expect(w2.bosses).toHaveLength(3);
    expect(w2 instanceof World).toBe(true);
  });
});
