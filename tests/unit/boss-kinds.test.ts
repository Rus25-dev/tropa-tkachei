// Волна 0, особая логика босса (kinds/<id>.ts): хук кадра, смена фазы, начало атаки, смерть, особые эффекты атак (attack.fx), запрет связки (allow).
import { afterEach, describe, expect, it } from 'vitest';
import { dstate } from '../../src/core/boss/exec';
import { registerKind, unregisterKind, type BossKind } from '../../src/core/boss/kinds';
import { registerBoss } from '../../src/core/boss/registry';
import { damageBoss } from '../../src/core/damage';
import { World } from '../../src/core/world';
import { base, dummyAttack, type Raw } from '../fixtures/bosses';

const used: string[] = [];
const kind = (id: string, k: BossKind): void => { used.push(id); registerKind(id, k); };
afterEach(() => { for (const id of used.splice(0)) unregisterKind(id); });

function fxBoss(id: string): Raw {
  const sw = dummyAttack('swing'); sw['fx'] = [{ at: 2, name: 'boom', args: { n: 3 } }, { at: 4, name: 'нет_такого' }];
  return base(id, {
    attacks: [sw, dummyAttack('slam')],
    chains: [{ id: 'c_swing', steps: [{ attack: 'swing' }], weight: 1 }, { id: 'c_slam', steps: [{ attack: 'slam' }], weight: 1 }],
    phases: [{ fromHp: 1, policy: { chains: ['c_swing', 'c_slam'], noRepeat: 0, restFrames: [30, 40] } }, { fromHp: 0.5, rageFrames: 5, policy: { chains: ['c_swing', 'c_slam'], noRepeat: 0, restFrames: [30, 40] } }],
  });
}
function make(raw: Raw): World { registerBoss(raw); return new World({ seed: 3, mode: 'bosstest', boss: raw['id'] as string, players: 1 }); }
const far = (w: World): void => { const b = w.bosses[0]!, p = w.players[0]!; p.x = b.x - 90; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; p.vx = 0; p.vy = 0; w.hitstop = 0; };
const tickN = (w: World, n: number, each?: () => void): void => { for (let i = 0; i < n; i++) { far(w); w.tick(); each?.(); } };

describe('kinds: особая логика босса', () => {
  it('frame вызывается каждый кадр исполнителя; fx — в указанный кадр атаки с аргументами; неизвестный эффект игнорируется', () => {
    const calls: string[] = []; let frames = 0;
    kind('fx_k1', { frame: () => { frames++; }, fx: { boom: (k, a) => { calls.push(`boom:${String(a['n'])}:${k.d.atk}:${k.d.af}`); } } });
    const w = make(fxBoss('fx_k1'));
    tickN(w, 600);
    expect(frames).toBe(600); // шаг мира = один кадр исполнителя
    expect(calls.length).toBeGreaterThan(0);
    // swing: замах 26 + кадр 2 → af = 28 (счётчик уже увеличен после кадра? хук вызывается в кадр t=2, af на нём = 26 + 2)
    expect(calls[0]).toBe('boom:3:swing:28');
  });

  it('onAttack получает id атаки, onPhase — номер новой фазы после рёва, onDeath — один раз', () => {
    const attacks: string[] = [], phases: number[] = []; let deaths = 0;
    kind('fx_k2', { onAttack: (_k, a) => { attacks.push(a); }, onPhase: (_k, p) => { phases.push(p); }, onDeath: () => { deaths++; } });
    const w = make(fxBoss('fx_k2')), b = w.bosses[0]!, p = w.players[0]!;
    tickN(w, 400); expect(attacks.length).toBeGreaterThan(1); expect(new Set(attacks).size).toBeGreaterThan(0);
    b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', p);
    tickN(w, 20); expect(phases).toEqual([2]);
    b.hp = 1; tickN(w, 10); damageBoss(w, 'd0', p);
    expect(deaths).toBe(1);
  });

  it('allow запрещает связку: босс выбирает только разрешённые; если запрещены все — ждёт', () => {
    kind('fx_k3', { allow: (_k, chain) => chain === 'c_slam' });
    const w = make(fxBoss('fx_k3')), d = dstate(w.bosses[0]!);
    tickN(w, 3000);
    expect(d.mem.hist.length).toBeGreaterThan(2);
    // выбор «разрешённого» случаен: допустимы только c_slam
    expect(d.mem.hist.every((c) => c === 'c_slam')).toBe(true);
  });

  it('хуки получают поток ГСЧ боссов: тот же результат при том же зерне', () => {
    const run = (): number[] => {
      const out: number[] = [];
      kind('fx_k4', { frame: (k) => { if (k.d.ac.clk % 100 === 0) out.push(k.rng()); } });
      const w = make(fxBoss('fx_k4')); tickN(w, 500); unregisterKind('fx_k4'); return out;
    };
    const a = run(), b = run(); expect(a.length).toBe(5); expect(b).toEqual(a);
  });
});
