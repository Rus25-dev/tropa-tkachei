// Падение вкладки: журнал ввода → воспроизведение ядром → продолжение живой игры даёт то же состояние, что игра без падения.
import { describe, expect, it } from 'vitest';
import { emptyFrame, type InputFrame } from '../../src/core/input';
import { outcome, type Journal } from '../../src/core/journal';
import { normalizeSave } from '../../src/core/loadout';
import { replayJournal } from '../../src/core/replay';
import { Session, type SessionCfg } from '../../src/core/session';

const cfg = (t: { v: number }): SessionCfg => ({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: 'test', clock: () => t.v, fx: true, wall: () => 1_700_000_000_000 + t.v });
/** псевдослучайный, но повторяемый ввод по номеру кадра */
function input(i: number): InputFrame {
  const f = emptyFrame(), k = (i * 2654435761) >>> 0;
  if ((i >> 5) % 3 !== 2) f.buttons.right = true; else f.buttons.left = true;
  if (k % 41 === 0) { f.buttons.jump = true; f.edges.jumpP = true; }
  if (k % 53 === 0) { f.buttons.atk = true; f.edges.atkP = true; }
  if (k % 97 === 0) { f.buttons.dash = true; f.edges.dashP = true; }
  return f;
}
const out = (s: Session): unknown => JSON.parse(JSON.stringify(outcome(s.world)));

describe('восстановление забега по журналу', () => {
  for (const race of [false, true]) {
    it(race ? 'забег гонки: герой ждёт «пошёл», затем «упала вкладка» — тот же исход' : 'одиночный забег: «упала вкладка» — тот же исход', () => {
      const t = { v: 5000 }, c = cfg(t);
      const mk = (): Session => new Session(c, { seed: 31337, mode: 'story', players: 1, camp: null }, { cat: 'trail', opt: race ? { rc: { code: 'ABCDE', seat: 1, id: 'r1', name: 'Ива' } } : undefined });
      const a = mk(), b = mk(); // b — «контрольная» партия без падения
      let i = 0;
      const stepBoth = (n: number, only?: Session[]): void => {
        for (let k = 0; k < n; k++, i++) { t.v += 1000 / 60; for (const s of only ?? [a, b]) { if (race && i === 30) s.release(); s.frame(1000 / 60, [i < 8 && race ? emptyFrame() : input(i)]); } }
      };
      stepBoth(900);
      expect(a.rec!.J.segs[0]!.n).toBeGreaterThan(800);
      // сохранение в «localStorage» и падение: от a остаётся только JSON
      const J = JSON.parse(JSON.stringify(a.rec!.J)) as Journal;
      if (race) { expect(J.race).toMatchObject({ code: 'ABCDE' }); expect(J.wallT0).not.toBeNull(); }
      const res = replayJournal(J, { ver: 'test', clock: () => t.v });
      if (!res.ok) throw new Error(res.why);
      const r = new Session(c, null, undefined, { J, world: res.world, sr: res.sr });
      expect(out(r)).toEqual(out(b));
      expect(r.sr!.hold).toBe(false);
      stepBoth(600, [b, r]);
      expect(out(r)).toEqual(out(b)); // жизнь продолжилась так же, как без падения
      // а журнал восстановленной сессии продолжает расти и снова воспроизводится
      const J2 = JSON.parse(JSON.stringify(r.rec!.J)) as Journal, res2 = replayJournal(J2);
      if (!res2.ok) throw new Error(res2.why);
      expect(JSON.parse(JSON.stringify(outcome(res2.world)))).toEqual(out(b));
    });
  }
});
