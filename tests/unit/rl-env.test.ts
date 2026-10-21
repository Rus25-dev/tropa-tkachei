// Среда RL и нейросеть-игрок: детерминизм (зерно + действия → те же наблюдения), сброс, награда, действия, инференс.
import { describe, expect, it } from 'vitest';
import { Agent } from '../../src/agent/agent';
import { HEADS, SKIP, actionToInp } from '../../src/agent/actions';
import { HERO_DIM, OBS_DIM, WORLD_DIM, buildObs } from '../../src/agent/obs';
import { Policy, type AgentModel } from '../../src/agent/policy';
import { feedInput } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { Done, RlEnv } from '../../tools/rl/env';
import { fightAgent } from '../../tools/rl/agent-fight';

/** действия по зерну: дёшево и повторяемо */
function script(n: number, seed: number): number[][] {
  let x = seed >>> 0; const r = (): number => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  return Array.from({ length: n }, () => [Math.floor(r() * 3), Math.floor(r() * 3), r() < 0.3 ? 1 : 0, r() < 0.1 ? 1 : 0, Math.floor(r() * 4)]);
}
function rollout(seed: number, acts: number[][], cfg = {}): { obs: number[][]; rew: number[]; done: number } {
  const e = new RlEnv({ boss: 'misha', ...cfg }); const o = new Float32Array(OBS_DIM);
  e.reset(seed, o, 0);
  const obs: number[][] = [Array.from(o)], rew: number[] = []; let done = 0;
  for (const a of acts) { const r = e.step(a, o, 0); rew.push(r.r); done = r.done; if (r.done) break; obs.push(Array.from(o)); }
  return { obs, rew, done };
}

describe('среда RL', () => {
  it('одно зерно и те же действия — те же наблюдения и награды', () => {
    const a = script(120, 5), x = rollout(11, a), y = rollout(11, a);
    expect(y).toEqual(x);
    expect(x.obs.length).toBeGreaterThan(50);
  }, 60_000);

  it('другое зерно — другой бой', () => {
    const a = script(150, 5);
    expect(rollout(12, a).obs).not.toEqual(rollout(11, a).obs);
  }, 60_000);

  it('сброс: наблюдение нужной длины, конечное, бой начинается после вступления босса', () => {
    const e = new RlEnv({ boss: 'misha' }), o = new Float32Array(OBS_DIM);
    e.reset(3, o, 0);
    expect(o.length).toBe(HERO_DIM + WORLD_DIM);
    for (const v of o) expect(Number.isFinite(v)).toBe(true);
    expect(e.started).toBeGreaterThan(100); // вступление Миши ≈ 3.2 с
    expect(e.w.testBoss()!.state).not.toBe('intro');
    e.reset(3, o, 0); expect(e.steps).toBe(0);
  });

  it('награда: стоять на месте — поражение со штрафом, конечные значения; весами управляем', () => {
    const idle = Array.from({ length: 4000 }, () => [0, 0, 0, 0, 0]);
    const a = rollout(4, idle), b = rollout(4, idle, { reward: { lose: 10 } });
    expect(a.done).toBe(Done.Died); expect(b.done).toBe(Done.Died);
    const sa = a.rew.reduce((s, v) => s + v, 0), sb = b.rew.reduce((s, v) => s + v, 0);
    expect(sa).toBeLessThan(0);
    expect(sb).toBeLessThan(sa - 7); // штраф за поражение поднят на 8
    for (const v of a.rew) expect(Number.isFinite(v)).toBe(true);
  }, 60_000);

  it('запись боя: запись .ttrec есть после конца боя', () => {
    const e = new RlEnv({ boss: 'misha', record: true, ver: '2.0.0' }), o = new Float32Array(OBS_DIM);
    e.reset(4, o, 0);
    let r = e.step([0, 0, 0, 0, 0], o, 0); for (let i = 0; i < 4000 && !r.done; i++) r = e.step([0, 0, 0, 0, 0], o, 0);
    expect(r.done).toBeGreaterThan(0);
    expect(e.ttrec?.format).toBe('ttrec');
    expect(e.ttrec!.journal.segs[0]!.n).toBeGreaterThan(300);
  }, 60_000);
});

describe('действия и инференс агента', () => {
  it('actionToInp: нажатия — только в первом тике решения, прыжок и движение держатся', () => {
    const a = [2, 1, 1, 1, 1];
    const f = actionToInp(a, 0), g = actionToInp(a, 1);
    expect(f).toMatchObject({ right: true, up: true, jump: true, dash: true, atk: true });
    expect(g).toMatchObject({ right: true, up: true, jump: true, dash: false, atk: false });
    expect(HEADS.length).toBe(5); expect(SKIP).toBe(4);
  });

  const tiny = (): AgentModel => {
    const nIn = OBS_DIM, h = 8, nOut = HEADS.reduce((s, x) => s + x, 0);
    let x = 12345; const r = (): number => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296 - 0.5; };
    const lay = (i: number, o: number) => ({ in: i, out: o, w: Array.from({ length: i * o }, () => r() * 0.3), b: Array.from({ length: o }, () => 0) });
    return { boss: 'misha', obsDim: nIn, heads: [...HEADS], lag: 3, skip: 4, mean: new Array(nIn).fill(0), std: new Array(nIn).fill(1), layers: [lay(nIn, h)], pi: lay(h, nOut) };
  };

  it('политика детерминирована; жадный выбор не зависит от rng', () => {
    const p = new Policy(tiny()), obs = new Float32Array(OBS_DIM).fill(0.1);
    const l1 = Array.from(p.forward(obs)), l2 = Array.from(p.forward(obs));
    expect(l2).toEqual(l1);
    const o1 = new Uint8Array(5), o2 = new Uint8Array(5);
    p.sample(p.forward(obs), 0, () => 0.1, o1); p.sample(p.forward(obs), 0, () => 0.9, o2);
    expect(Array.from(o2)).toEqual(Array.from(o1));
  });

  it('агент: то же зерно и характер — тот же бой; стоит во время вступления босса', () => {
    const job = { boss: 'misha' as const, seed: 9, model: tiny(), play: { temperature: 1.5, stick: 0.3, atkGap: 1 }, maxSec: 20 };
    const a = fightAgent(job), b = fightAgent(job);
    expect(b).toEqual(a);
    const w = new World({ seed: 1, mode: 'bosstest', boss: 'misha', players: 1 }), ag = new Agent(tiny(), job.play, 1);
    expect(w.testBoss()!.state).toBe('intro');
    expect(ag.tick(w)).toEqual({});
    feedInput(w, [{}]);
  }, 60_000);

  it('buildObs не пишет за пределы и не даёт NaN в бою с каждым боссом', () => {
    for (const boss of ['misha', 'vladik', 'tima']) {
      const w = new World({ seed: 2, mode: 'bosstest', boss, players: 1 }), o = new Float32Array(OBS_DIM + 4).fill(7);
      for (let t = 0; t < 900; t++) { feedInput(w, [{ right: t % 40 < 20, atk: t % 7 === 0 }]); w.tick(); }
      buildObs(w, 0, o, 0);
      for (let i = 0; i < OBS_DIM; i++) expect(Number.isFinite(o[i]!)).toBe(true);
      expect(o[OBS_DIM]).toBe(7);
    }
  }, 60_000);
});
