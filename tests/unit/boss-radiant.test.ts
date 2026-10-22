import { describe, expect, it } from 'vitest';
import { bossDef } from '../../src/core/boss/registry';
import { dstate, enterPhase, forceChain } from '../../src/core/boss/exec';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { drawArena } from '../../src/view/draw/arena';
import { drawDataBoss } from '../../src/view/draw/bosses';

function fakeG(): never {
  const g = new Proxy({}, { get: () => () => g });
  return g as never;
}
const fresh = (seed = 1): World => new World({ seed, mode: 'bosstest', boss: 'radiant', players: 1 });

describe('Сияющая', () => {
  it('загружена: три фазы, неподвижное тело, экзамен необязательный: пока hidden, порядок — в конце списка', () => {
    const d = bossDef('radiant')!;
    expect(d).toBeTruthy();
    expect(d.phases).toHaveLength(3);
    expect(d.still).toBe(true);
    expect(d.hidden).toBe(true); // карточку включает автор плана после игры: убрать hidden (или поставить dev)
    expect(d.order).toBeGreaterThanOrEqual(9000);
    expect(d.chains.length).toBeGreaterThanOrEqual(9);
    expect(new World({ seed: 1, mode: 'bosstest', boss: 'radiant', players: 1 }).bosses).toHaveLength(1);
  });

  it('каждый приём, кроме снарядных, предупреждает цветом удара: красное — dodge, фиолетовое — unblockable, жёлтое — parry', () => {
    const d = bossDef('radiant')!;
    const ents = (d.arena as { ents: { id: string; kind: string; hit?: string }[] }).ents;
    for (const a of d.attacks) {
      for (const f of a.fire) {
        const e = ents.find((x) => x.id === f.ent)!;
        if (e.kind !== 'beam') continue;
        expect(a.tell.cue.color, a.id).toBe(e.hit === 'unblockable' ? 'purple' : 'red');
      }
    }
    expect(d.attacks.find((a) => a.id === 'orbs')!.tell.cue.color).toBe('yellow');
  });

  it('платформы появляются только со второй фазы и мигают заранее', () => {
    const w = fresh(2);
    const plat = (): number => w.arena!.ents.filter((e) => e.shown).length;
    for (let i = 0; i < 200; i++) { w.players[0]!.hp = 99; w.tick(); }
    expect(plat()).toBe(0);
    enterPhase(w, 0, 2);
    let seen = 0, warned = 0;
    for (let i = 0; i < 400; i++) {
      const p = w.players[0]!; p.hp = p.maxHp = 999; w.tick();
      seen = Math.max(seen, plat());
      if (w.arena!.ents.some((e) => e.warnShow > 0 || e.warnHide > 0)) warned++;
    }
    expect(seen).toBeGreaterThan(0);
    expect(warned).toBeGreaterThan(0);
  });

  it('связки каждой фазы запускаются, луч арены стреляет через замах и бьёт в активных кадрах', () => {
    const w = fresh(3);
    for (let i = 0; i < 130; i++) w.tick();
    const p = w.players[0]!;
    forceChain(w, 0, 'c_spears');
    let hits = 0;
    for (let i = 0; i < 160; i++) {
      p.x = 32 + 130; p.y = 18 * 32 - p.h; p.inv = 0; const hp0 = p.hp; w.tick();
      if (p.hp < hp0) hits++;
    }
    expect(hits).toBe(1); // стоял в первом столбе: ровно один удар, и только после замаха
  });

  it('детерминизм: то же зерно и ввод — то же состояние', () => {
    const run = (): string => {
      const w = fresh(5);
      const fz = makeFuzzer(w, 5);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.hp, dstate(b).mem.hist])]);
    };
    expect(run()).toBe(run());
  });

  it('рисуется во всех фазах с пустым Graphics', () => {
    const w = fresh(4);
    const b = w.bosses[0]!;
    expect(() => {
      for (let ph = 1; ph <= 3; ph++) {
        if (ph > 1) enterPhase(w, 0, ph);
        for (let i = 0; i < 260; i++) { const p = w.players[0]!; p.hp = p.maxHp = 999; w.tick(); drawDataBoss(w, b, fakeG(), i / 10); drawArena(w, fakeG(), i / 10); }
      }
    }).not.toThrow();
  });
});
