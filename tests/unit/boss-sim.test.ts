// Каркас боссов 2.5: прогон манекена в Node (аналог `npm run sim -- --boss dummy`): 36000 кадров случайного ввода без исключений и NaN;
// тип удара hk доходит до hurtPlayer из ударов босса и из снарядов.
import { describe, expect, it, vi } from 'vitest';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { outcome } from '../../src/core/journal';
import { dstate } from '../../src/core/boss/exec';
import { World } from '../../src/core/world';
import { findNonFinite } from '../../tools/fuzz/invariants';
import type { HitKind } from '../../src/core/types';

const calls: { dmg: number; hk: HitKind | undefined }[] = [];
vi.mock('../../src/core/damage', async (orig) => {
  const m = await orig<typeof import('../../src/core/damage')>();
  return { ...m, hurtPlayer: (sc: never, p: never, dmg: number, srcX: number | null, spike?: boolean, hk?: HitKind) => { calls.push({ dmg, hk }); return m.hurtPlayer(sc, p, dmg, srcX, spike, hk); } };
});

function sim(seed: number, frames: number, o: { players?: number; train?: boolean; pump?: boolean } = {}): { w: World; phases: Set<number>; chains: Set<string> } {
  const w = new World({ seed, mode: 'bosstest', boss: 'dummy', players: o.players ?? 1, train: o.train, loadoutSave: { weapon: 'needle', tool: '', charms: [], have: { weapons: ['needle'], tools: [], charms: [] } } });
  const fz = makeFuzzer(w, seed);
  const phases = new Set<number>(), chains = new Set<string>();
  for (let i = 0; i < frames; i++) {
    feedInput(w, w.players.map((p) => fz(p.i)));
    // чтобы за один прогон побывать во всех фазах, периодически «подтачиваем» здоровье босса
    const b = w.bosses[0];
    if (o.pump && b && b.state !== 'dead' && i % 600 === 599) b.hp = Math.max(2, b.hp - Math.ceil(b.maxHp * 0.2));
    w.tick();
    if (b) { phases.add(b.phase || 1); for (const c of dstate(b).mem.hist) chains.add(c); }
    if (i % 600 === 0) {
      for (const x of [...w.bosses, ...w.players]) expect(findNonFinite(x, 'x', 3), `NaN на тике ${i}`).toBeNull();
      for (const pr of w.projs) expect(findNonFinite(pr, 'pr', 1)).toBeNull();
    }
    if (w.won) break;
  }
  return { w, phases, chains };
}

describe('манекен в Node: симуляция', () => {
  it('36000 кадров случайного ввода: без исключений, NaN и зависаний', () => {
    const t0 = calls.length;
    const { w, chains } = sim(1, 36000);
    const o = JSON.parse(JSON.stringify(outcome(w))) as Record<string, unknown>;
    expect(findNonFinite(o, 'outcome')).toBeNull();
    expect(w.tickN).toBeGreaterThan(3000);
    expect(chains.size).toBeGreaterThanOrEqual(3);
    expect(calls.length).toBeGreaterThan(t0); // герой получал удары от босса
  }, 60_000);
  it('с подтачиванием здоровья: обе фазы, переходный приём и смерть босса', () => {
    const { w, phases, chains } = sim(2, 36000, { pump: true });
    expect([...phases].sort()).toEqual([1, 2]);
    expect(chains.size).toBeGreaterThanOrEqual(4);
    expect(findNonFinite(JSON.parse(JSON.stringify(outcome(w))), 'outcome')).toBeNull();
  }, 60_000);
  it('тренировка и двое героев', () => {
    sim(3, 12000, { train: true, pump: true });
    sim(4, 12000, { players: 2, pump: true });
  }, 60_000);
  it('детерминизм: два прогона с одним зерном дают одинаковый итог', () => {
    const a = outcome(sim(5, 8000, { pump: true }).w), b = outcome(sim(5, 8000, { pump: true }).w);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 60_000);
});

describe('тип удара hk', () => {
  it('удары босса и его снаряды передают hk в hurtPlayer', () => {
    calls.length = 0;
    sim(7, 20000, { pump: true });
    const kinds = new Set(calls.map((c) => c.hk));
    expect(kinds.has('parry')).toBe(true);
    expect(kinds.has('dodge')).toBe(true);
    expect(calls.every((c) => c.hk === 'parry' || c.hk === 'dodge' || c.hk === 'unblockable')).toBe(true);
  }, 60_000);
  it('неотбиваемый удар «Сокрушения» идёт с hk=unblockable и уроном 2', () => {
    calls.length = 0;
    const w = new World({ seed: 8, mode: 'bosstest', boss: 'dummy', players: 1 });
    const b = w.bosses[0]!, p = w.players[0]!;
    b.hp = Math.floor(b.maxHp * 0.5); b.phase = 2;
    for (let i = 0; i < 20000 && !calls.some((c) => c.hk === 'unblockable'); i++) {
      p.x = b.x + b.w + 60; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; w.hitstop = 0; b.hp = Math.floor(b.maxHp * 0.5);
      w.tick();
    }
    expect(calls.find((c) => c.hk === 'unblockable')?.dmg).toBe(2);
  });
});
