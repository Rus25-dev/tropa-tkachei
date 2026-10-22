// Контрудар (v2.7, набор игрока): удар в последние кадры замаха босса срывает атаку (оглушение, бонусный урон, усиленная контратака).
// Проверяется по кадрам на боссе «Хранительница Печатей» (keeper): окно, дальность, цвета, откат и иммунитет, закрытый приём, детерминизм и журнал.
import { describe, expect, it } from 'vitest';
import { PARRY2 } from '../../src/core/balance';
import { dstate, forceChain } from '../../src/core/boss/exec';
import { emptyFrame } from '../../src/core/input';
import { ABILS, KIT_IDS, kitHas } from '../../src/core/kit/abilities';
import { COUNTER, counterReady, counterTarget, tellLeft } from '../../src/core/kit/counter';
import { kitHud } from '../../src/core/kit/moves';
import { normalizeSave } from '../../src/core/loadout';
import { outcome, hashFor } from '../../src/core/journal';
import { replayJournal } from '../../src/core/replay';
import { SessionRecorder } from '../../src/core/recording';
import { Session } from '../../src/core/session';
import type { Inp, Player } from '../../src/core/types';
import { World } from '../../src/core/world';

const mk = (o: { kit?: boolean; abil?: Record<string, boolean>; seed?: number } = {}): { w: World; p: Player } => {
  const w = new World({ seed: o.seed ?? 3, mode: 'bosstest', boss: 'keeper', players: 1, kit: o.kit ?? true, loadoutSave: normalizeSave(null) });
  if (o.abil) w.abil = { ...w.abil, ...o.abil };
  const p = w.players[0]!;
  for (let i = 0; i < 170; i++) { p.hp = p.maxHp = 99; p.x = 60; p.inv = 5; w.tick(); } // вступление босса позади, герой далеко
  p.inv = 0;
  return { w, p };
};
function step(w: World, raw: Inp = {}, edge: Inp = {}): void { const p = w.players[0]!; p.raw = { ...raw }; p.pend = { ...edge }; w.tick(); }
/** герой вплотную слева от босса, на полу */
function stand(w: World, p: Player, gap = 50): void {
  const b = w.bosses[0]!;
  p.x = b.x + b.w / 2 - gap - p.w / 2; p.y = b.y + b.h - p.h; p.vx = p.vy = 0; p.inv = 0; p.hp = p.maxHp = 99; p.face = 1; p.atkCd = 0; p.atkT = 0;
}
/** запустить связку босса и дойти до кадра замаха, когда до удара остаётся ровно left кадров (как видит шаг героя) */
function toLeft(w: World, p: Player, chain: string, left: number): void {
  expect(forceChain(w, 0, chain)).toBe(true);
  stand(w, p);
  for (let i = 0; i < 120 && tellLeft(w.bosses[0]!) !== left; i++) { stand(w, p); p.atkCd = 0; step(w); }
  expect(tellLeft(w.bosses[0]!)).toBe(left);
}
const hit = (w: World): void => { stand(w, w.players[0]!); step(w, {}, { atkP: true }); };

describe('реестр Контрудара', () => {
  it('приём в реестре, закрыт по умолчанию (unlock — locked, выдаст автор волны)', () => {
    expect(KIT_IDS).toContain('counter');
    expect(ABILS.counter.unlock).toBe('locked');
    expect(ABILS.counter.name).toBe('Контрудар');
    const { w, p } = mk({ kit: false });
    expect(kitHas(w, p, 'counter')).toBe(false);
    expect(kitHud(w, p).some((k) => k.id === 'counter')).toBe(false);
  });
  it('открывается флагом способности и режимом Босс-теста с kit', () => {
    const a = mk({ kit: false, abil: { counter: true } });
    expect(kitHas(a.w, a.p, 'counter')).toBe(true);
    const b = mk({ kit: true });
    expect(kitHas(b.w, b.p, 'counter')).toBe(true);
    expect(counterReady(b.w, b.p)).toBe(true);
  });
});

describe('Контрудар по кадрам', () => {
  it('в окне: оглушение, бонусный урон, неуязвимость, усиленный удар, откат', () => {
    const { w, p } = mk(); const b = w.bosses[0]!, hp0 = b.hp;
    toLeft(w, p, 'c_stamp', COUNTER.WINDOW_F);
    expect(counterTarget(w, p)).not.toBeNull();
    hit(w);
    expect(b.stagger).toBeGreaterThan(0);
    expect(b.stagger).toBeLessThanOrEqual(COUNTER.STUN_T + 1e-9);
    expect(hp0 - b.hp).toBeGreaterThanOrEqual(COUNTER.BONUS);
    expect(p['cxN']).toBe(1);
    expect(p['cxCd']).toBeGreaterThan(0); expect(counterReady(w, p)).toBe(false);
    expect(p.inv).toBeGreaterThan(0);
    expect(p['counterHit']).toBe(true); // нижний слой начал удар как контратаку Парирования 2.0
    expect(dstate(b).mode).toBe('idle'); expect(dstate(b).atk).toBeNull(); // атака сорвана
    expect(b['executed']).toBe(true); // казни по срыву нет
  });
  it('граница окна: за кадр до окна нажатие обычное, в первом кадре окна и в последнем — контрудар', () => {
    const out = mk(); toLeft(out.w, out.p, 'c_stamp', COUNTER.WINDOW_F + 1);
    hit(out.w); expect(out.p['cxN'] ?? 0).toBe(0); expect(out.w.bosses[0]!.stagger).toBe(0);
    const first = mk(); toLeft(first.w, first.p, 'c_stamp', COUNTER.WINDOW_F);
    hit(first.w); expect(first.p['cxN']).toBe(1);
    const last = mk(); toLeft(last.w, last.p, 'c_stamp', 1);
    hit(last.w); expect(last.p['cxN']).toBe(1);
  });
  it('красный замах берётся так же, как жёлтый', () => {
    const { w, p } = mk(); toLeft(w, p, 'c_sweep', 5); hit(w);
    expect(p['cxN']).toBe(1); expect(w.bosses[0]!.stagger).toBeGreaterThan(0);
  });
  it('фиолетовый и белый замахи не берутся (печать и защита от читов каркаса)', () => {
    for (const chain of ['c_bind', 'c_shove']) {
      const { w, p } = mk(); toLeft(w, p, chain, 5);
      expect(counterTarget(w, p), chain).toBeNull();
      hit(w); expect(p['cxN'] ?? 0, chain).toBe(0); expect(w.bosses[0]!.stagger, chain).toBe(0);
    }
  });
  it('издалека не работает; вплотную — работает; вверх и вниз — это казнь, а не контрудар', () => {
    const far = mk(); toLeft(far.w, far.p, 'c_stamp', 5);
    const b = far.w.bosses[0]!; far.p.x = b.x + b.w / 2 - 50 - COUNTER.REACH - b.w / 2 - 40;
    expect(counterTarget(far.w, far.p)).toBeNull();
    const up = mk(); toLeft(up.w, up.p, 'c_stamp', 5); stand(up.w, up.p);
    step(up.w, { up: true }, { atkP: true, upP: true }); expect(up.p['cxN'] ?? 0).toBe(0);
  });
  it('закрытый приём ничего не меняет: удар в окне обычный', () => {
    const { w, p } = mk({ kit: false }); toLeft(w, p, 'c_stamp', 5); hit(w);
    expect(p['cxN'] ?? 0).toBe(0); expect(w.bosses[0]!.stagger).toBe(0);
  });
  it('откат и иммунитет после оглушения: повторный срыв невозможен, пока босс не оправился', () => {
    const { w, p } = mk(); const b = w.bosses[0]!;
    toLeft(w, p, 'c_stamp', 5); hit(w); expect(p['cxN']).toBe(1);
    for (let i = 0; i < 400 && b.stagger > 0; i++) { stand(w, p); step(w); }
    expect(b.stagger).toBeLessThanOrEqual(0);
    expect(forceChain(w, 0, 'c_stamp')).toBe(true);
    p['cxCd'] = 0; // откат вышел, но босс ещё под защитой от повторного оглушения (poiseImmune)
    for (let i = 0; i < 120 && tellLeft(b) !== 5; i++) { stand(w, p); step(w); }
    expect(counterTarget(w, p)).toBeNull();
    hit(w); expect(p['cxN']).toBe(1);
  });
  it('откат героя: пока он идёт, приём не готов, потом снова готов', () => {
    const { w, p } = mk(); toLeft(w, p, 'c_stamp', 5); hit(w);
    expect(counterReady(w, p)).toBe(false);
    for (let i = 0; i < COUNTER.CD_F + 5; i++) step(w);
    expect(counterReady(w, p)).toBe(true);
  });
  it('усиленная контратака: за кадр срыва босс теряет бонус и удар по оглушённому (двойной урон ×1,5), а не один обычный удар', () => {
    const plain = mk({ kit: false }); const pb = plain.w.bosses[0]!;
    toLeft(plain.w, plain.p, 'c_stamp', 5); const ph0 = pb.hp; hit(plain.w); for (let i = 0; i < 12; i++) { stand(plain.w, plain.p); step(plain.w); }
    const { w, p } = mk(); const b = w.bosses[0]!;
    toLeft(w, p, 'c_stamp', 5); const h0 = b.hp; hit(w); for (let i = 0; i < 12; i++) { stand(w, p); step(w); }
    expect(PARRY2.COUNTER_DMG).toBeGreaterThan(1);
    expect(h0 - b.hp).toBeGreaterThanOrEqual(COUNTER.BONUS + 2);
    expect(h0 - b.hp).toBeGreaterThan(ph0 - pb.hp + COUNTER.BONUS);
  });
  it('значок HUD: готов, в откате, возврат', () => {
    const { w, p } = mk(); const ic = (): ReturnType<typeof kitHud>[number] => kitHud(w, p).find((k) => k.id === 'counter')!;
    expect(ic().ready).toBe(true);
    toLeft(w, p, 'c_stamp', 5); hit(w);
    expect(ic().ready).toBe(false); expect(ic().frac).toBeGreaterThan(0);
  });
});

describe('Контрудар: детерминизм и журнал', () => {
  it('два мира с одним вводом дают один хэш и одно число срабатываний', () => {
    const run = (): [number, number] => {
      const { w, p } = mk({ seed: 7 });
      for (let k = 0; k < 4; k++) {
        const b = w.bosses[0]!;
        for (let i = 0; i < 400; i++) {
          if (b.state === 'idle' && i % 90 === 0) { forceChain(w, 0, k % 2 ? 'c_stamp' : 'c_sweep'); }
          stand(w, p); const press = tellLeft(b) === 4;
          step(w, {}, press ? { atkP: true } : {});
        }
      }
      return [hashFor(w, 2), (p['cxN'] as number) | 0];
    };
    const a = run(), b = run();
    expect(a).toEqual(b); expect(a[1]).toBeGreaterThan(0);
  });
  it('партия с контрударами воспроизводится по журналу в тот же исход, флаг kit лежит в записи', () => {
    const ses = new Session({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: 't', clock: () => 0, fx: false, kit: true }, { seed: 9, mode: 'bosstest', boss: 'keeper', players: 1, camp: null });
    const rec = new SessionRecorder(ses, { ver: 't', easy: false });
    const p = ses.world.players[0]!;
    for (let i = 0; i < 2600; i++) {
      const f = emptyFrame(), b = ses.world.bosses[0]!;
      const dx = b.x + b.w / 2 - (p.x + p.w / 2);
      f.buttons.right = dx > 60; f.buttons.left = dx < -60;
      if (tellLeft(b) > 0 && tellLeft(b) <= 4 && Math.abs(dx) < 120) f.edges.atkP = true;
      else if (i % 40 === 0) f.edges.atkP = true;
      ses.frame(1000 / 60, [f]);
    }
    expect(rec.journal.segs[0]!.data.kit).toBe(true);
    const r = replayJournal(rec.journal, { loadoutSave: ses.cfg.loadoutSave, progress: null });
    if (!r.ok) throw new Error(r.why);
    expect(JSON.parse(JSON.stringify(outcome(r.world)))).toEqual(JSON.parse(JSON.stringify(outcome(ses.world))));
    expect((r.world.players[0]!['cxN'] as number) | 0).toBe((ses.world.players[0]!['cxN'] as number) | 0);
    expect((ses.world.players[0]!['cxN'] as number) | 0).toBeGreaterThan(0);
  }, 60_000);
  it('мир без флага kit не меняется: хэш мира с закрытым приёмом равен хэшу мира без самого поля', () => {
    const play = (kit: boolean | undefined): number => {
      const w = new World({ seed: 5, mode: 'bosstest', boss: 'keeper', players: 1, ...(kit === undefined ? {} : { kit }), loadoutSave: normalizeSave(null) });
      const p = w.players[0]!;
      for (let i = 0; i < 700; i++) {
        p.hp = p.maxHp = 99; const b = w.bosses[0]!, dx = b.x + b.w / 2 - (p.x + p.w / 2);
        step(w, { right: dx > 60, left: dx < -60 }, i % 30 === 0 ? { atkP: true } : {});
      }
      return hashFor(w, 2);
    };
    expect(play(false)).toBe(play(undefined));
  }, 60_000);
});
