// Фаззер: инварианты ловят то, что должны (на искусственно испорченных мирах), минимизатор укорачивает журнал, прогоны детерминированы.
import { describe, expect, it } from 'vitest';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import type { Journal } from '../../src/core/journal';
import { replayJournal, type ReplayOpts } from '../../src/core/replay';
import { SessionRecorder } from '../../src/core/recording';
import { World } from '../../src/core/world';
import { Monitor, type Finding, type InvariantId } from '../../tools/fuzz/invariants';
import { minimizeJournal } from '../../tools/fuzz/minimize';
import { FUZZ_VER, makeSession, runFuzz } from '../../tools/fuzz/run';
import { scanJournal } from '../../tools/fuzz/scan';
import { MODES, makeSpec, type FuzzSpec } from '../../tools/fuzz/spec';
import { emptyButtons, edgesBetween } from '../../src/core/input';

const world = (): World => new World({ seed: 5, mode: 'bosstest', boss: 'vladik' });
const feed = (m: Monitor, w: World, n: number, moved = false): Finding | null => { for (let i = 0; i < n; i++) { const f = m.check(w, moved); if (f) return f; } return null; };

describe('фаззер: инварианты ловят нарушения', () => {
  it('здоровый мир проходит тысячу тиков без замечаний', () => {
    const w = world(), m = new Monitor(), fz = makeFuzzer(w, 3);
    for (let i = 0; i < 1000; i++) { feedInput(w, w.players.map((p) => fz(p.i))); w.tick(); expect(m.check(w, true)).toBeNull(); }
  });
  const kinds: [InvariantId, string, (w: World) => void][] = [
    ['nan', 'NaN в позиции героя', (w) => { w.players[0]!.x = NaN; }],
    ['nan', 'Infinity в скорости босса', (w) => { (w.testBoss() ?? w.boss).vx = Infinity; }],
    ['range', 'здоровье героя выше максимума', (w) => { w.players[0]!.hp = w.players[0]!.maxHp + 3; }],
    ['outside', 'герой упал под уровень', (w) => { w.players[0]!.y = w.L.H * 32 + 900; }],
  ];
  for (const [inv, name, bad] of kinds) {
    it(`${inv}: ${name}`, () => {
      const w = world(), m = new Monitor();
      expect(feed(m, w, 30)).toBeNull();
      bad(w);
      const f = feed(m, w, 32);
      expect(f?.invariant).toBe(inv);
    });
  }
  it('solid: герой, застрявший в стене дольше 30 тиков', () => {
    const w = world(), m = new Monitor();
    const p = w.players[0]!; p.x = 2 * 32 - 8; p.y = 2 * 32 - 8; // угол стены арены
    expect(w.solidRect({ x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 2 })).toBe(true);
    expect(feed(m, w, 20)).toBeNull(); // короткое пересечение допустимо (ворота, отброс)
    expect(feed(m, w, 20)?.invariant).toBe('solid');
  });
  it('stuck: 30 секунд на месте при нажатом движении', () => {
    const w = world(), m = new Monitor();
    const f = feed(m, w, 1805, true);
    expect(f?.invariant).toBe('stuck');
    expect(feed(new Monitor(), world(), 3000, false)).toBeNull(); // стоит без нажатий — не застревание
  });
  it('stuck не срабатывает, пока открыто меню', () => {
    const w = world(), m = new Monitor(); w.paused = true;
    expect(feed(m, w, 3000, true)).toBeNull();
  });
  it('frozen: обрыв нити и хитстоп, которые не кончаются', () => {
    const w = world(), m = new Monitor(); w.wiping = true;
    expect(feed(m, w, 700)?.invariant).toBe('frozen');
    const w2 = world(), m2 = new Monitor(); w2.hitstop = 0.5;
    expect(feed(m2, w2, 200)?.invariant).toBe('frozen');
    const w3 = world(), m3 = new Monitor(); w3.hitstop = 0.5; w3.paused = true; // на паузе хитстоп стоит — это не зависание
    expect(feed(m3, w3, 200)).toBeNull();
  });
  it('transition: сцена не сменилась после выхода', () => {
    const w = world(), m = new Monitor(); w.leaving = true;
    expect(feed(m, w, 400)?.invariant).toBe('transition');
  });
});

describe('фаззер: прогоны', () => {
  it('задания детерминированы и покрывают все режимы', () => {
    expect(makeSpec(7, 3)).toEqual(makeSpec(7, 3));
    expect(makeSpec(7, 3)).not.toEqual(makeSpec(7, 4));
    const seen = new Set(Array.from({ length: 800 }, (_, i) => makeSpec(1, i).mode));
    expect([...seen].sort()).toEqual([...MODES].sort());
    expect(Array.from({ length: 400 }, (_, i) => makeSpec(1, i)).some((s) => s.players === 2)).toBe(true);
    expect(makeSpec(1, 5, ['road2']).mode).toBe('road2');
  });

  const short = (mode: FuzzSpec['mode'], over: Partial<FuzzSpec> = {}): FuzzSpec => ({ ...makeSpec(11, 1, [mode]), ticks: 2400, ...over });
  for (const mode of ['ch1', 'road3', 'korne', 'arena-tima', 'camp-arena2', 'train-misha', 'chain', 'sr-boss'] as const) {
    it(`режим ${mode}: чисто и воспроизводимо`, () => {
      const spec = short(mode, { ui: true });
      const a = runFuzz(spec), b = runFuzz(spec);
      expect(a.finding).toBeNull();
      expect(b.stats).toEqual(a.stats);
    }, 60_000);
  }
  it('вдвоём у одного компьютера: чисто, журнал воспроизводится', () => {
    for (const mode of ['ch1', 'arena-vladik', 'chain'] as const) expect(runFuzz(short(mode, { players: 2, ui: true })).finding).toBeNull();
  }, 60_000);
});

describe('фаззер: минимизатор', () => {
  // запись с 3000 тиками случайного ввода
  const record = (): { J: Journal; replay: ReplayOpts } => {
    const spec = short0();
    const ses = makeSession(spec, { ms: 0 });
    const rec = new SessionRecorder(ses, { ver: FUZZ_VER, easy: spec.easy });
    const fz = makeFuzzer(ses.world, 4);
    let prev = emptyButtons();
    for (let t = 0; t < 3000; t++) { const b = { ...emptyButtons(), ...fz(0) } as typeof prev; ses.frame(1000 / 60, [{ buttons: b, edges: edgesBetween(prev, b) }]); prev = b; ses.fxq.length = 0; }
    return { J: rec.journal, replay: { loadoutSave: spec.loadout, easy: spec.easy, ver: FUZZ_VER } };
  };
  const short0 = (): FuzzSpec => ({ ...makeSpec(2, 0, ['arena-misha']), players: 1, easy: false });

  it('укорачивает журнал, пока «ошибка» воспроизводится', () => {
    const { J, replay } = record();
    expect(replayJournal(J, replay).ok).toBe(true);
    // искусственная «ошибка»: герой оказался правее 450 пикселей от старта
    const x0 = (() => { const w = new World({ seed: J.segs[0]!.seed, mode: 'bosstest', boss: 'misha' }); return w.players[0]!.x; })();
    class Stop extends Error {}
    const scan = (j: Journal, opt: ReplayOpts): Finding | null => {
      let n = 0, f: Finding | null = null;
      try { replayJournal(j, { ...opt, onTick: (w) => { n++; if (w.players[0]!.x > x0 + 450) { f = { invariant: 'range', message: 'x', tick: n }; throw new Stop(); } } }); } catch (e) { if (!(e instanceof Stop)) throw e; }
      return f;
    };
    const target = scan(J, replay);
    expect(target).not.toBeNull();
    const m = minimizeJournal(J, target!, { replay, scan, budgetMs: 20_000 });
    expect(m.reproduced).toBe(true);
    expect(m.after).toBeLessThan(m.before);
    expect(m.after).toBeLessThan(400);
    // результат — полноценный журнал: проигрывается, воспроизводит ту же «ошибку» и не длиннее исходного
    expect(replayJournal(m.journal, replay).ok).toBe(true);
    expect(scan(m.journal, replay)?.invariant).toBe('range');
    expect(m.journal.segs[0]!.n).toBe(m.after);
  }, 60_000);

  it('если ошибка не воспроизводится, журнал не трогает', () => {
    const { J, replay } = record();
    const m = minimizeJournal(J, { invariant: 'nan', message: 'нет такого', tick: 10 }, { replay, budgetMs: 5000 });
    expect(m.reproduced).toBe(false);
    expect(m.journal).toBe(J);
  }, 60_000);

  it('scanJournal на чистой записи ничего не находит', () => {
    const { J, replay } = record();
    expect(scanJournal(J, replay)).toBeNull();
  }, 60_000);
});
