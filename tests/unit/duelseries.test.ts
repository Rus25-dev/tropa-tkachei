// «Дуэль ткачей», ядро: бан/пик, порядок раундов, счёт, победитель раунда, модификаторы и их влияние на забег.
// Главное: модификаторы — параметры забега, поэтому журнал с ними воспроизводится бит в бит, а без них ядро не меняется (золотые записи — в golden.test.ts).
import { describe, expect, it } from 'vitest';
import {
  applyVeto, autoVeto, BOSS_INFO, cardStates, DUEL_BOSSES, fracOf, modsFor, newSeries, planRound, recordRound, roundWinner, undoRound, vetoNow, vetoPlan, winsNeeded,
  type DuelBoss, type RoundVerdict, type Series, type SeriesFmt, type Side,
} from '../../src/core/duel';
import { BLITZ_K, cleanMods, duelInputs, duelSpeed, mirrorFrame } from '../../src/core/duelmods';
import { emptyFrame } from '../../src/core/input';
import { outcome, type Journal } from '../../src/core/journal';
import { RACE_EXT, replayJournal } from '../../src/core/replay';
import { Session, type SessionCfg } from '../../src/core/session';
import { normalizeSave } from '../../src/core/loadout';
import { hurtPlayer } from '../../src/core/damage';

/** бан/пик целиком: каждый ход берёт первого из доступных (или заданного) */
function veto(s: Series, pick?: DuelBoss[]): Series {
  let i = 0;
  while (s.stage === 'veto') {
    const now = vetoNow(s)!, boss = pick?.[i++] ?? now.left[0]!, r = applyVeto(s, now.side, boss);
    if (!r.ok) throw new Error(r.why);
    s = r.s;
  }
  return s;
}
const win = (w: 'a' | 'b'): RoundVerdict => ({ winner: w, why: 'faster', gap: 100 });

describe('бан/пик', () => {
  it('план по форматам: Bo1 — три бана, Bo3 — бан и два пика, Bo5 — четыре пика', () => {
    expect(vetoPlan(1).map((x) => x.kind + x.who[0])).toEqual(['banf', 'bans', 'banf']);
    expect(vetoPlan(3).map((x) => x.kind + x.who[0])).toEqual(['banf', 'picks', 'pickf']);
    expect(vetoPlan(5).map((x) => x.kind + x.who[0])).toEqual(['pickf', 'picks', 'pickf', 'picks']);
    for (const f of [1, 3, 5] as SeriesFmt[]) expect(winsNeeded(f)).toBe((f + 1) / 2);
  });

  it('Bo1: после трёх банов остаётся один босс — он единственный раунд', () => {
    const s = veto(newSeries(1, 11));
    expect(s.stage).toBe('play'); expect(s.bans.length).toBe(3); expect(s.pool.length).toBe(1);
    expect(s.order).toEqual([s.pool[0]]); expect(s.decider).toBe(s.pool[0]);
  });

  it('Bo3: A банит, B пикает, A пикает; порядок раундов — пик B, пик A, решающий (остаток)', () => {
    const s0 = newSeries(3, 5), A = s0.first, B: Side = A === 0 ? 1 : 0;
    expect(vetoNow(s0)).toMatchObject({ kind: 'ban', side: A });
    const s = veto(s0, ['korne', 'misha', 'vladik']);
    expect(s.bans).toEqual([{ kind: 'ban', side: A, boss: 'korne' }]);
    expect(s.picks).toEqual([{ kind: 'pick', side: B, boss: 'misha' }, { kind: 'pick', side: A, boss: 'vladik' }]);
    expect(s.decider).toBe('tima'); expect(s.order).toEqual(['misha', 'vladik', 'tima']);
  });

  it('Bo5: четыре пика по очереди, пятый (решающий) босс выпадает жребием из зерна и повторяет одного из боссов', () => {
    const s = veto(newSeries(5, 99));
    expect(s.picks.map((p) => p.side)).toEqual([s.first, 1 - s.first, s.first, 1 - s.first]);
    expect(s.order.length).toBe(5); expect(new Set(s.order.slice(0, 4)).size).toBe(4);
    expect(DUEL_BOSSES).toContain(s.decider);
    expect(veto(newSeries(5, 99)).decider).toBe(s.decider);
  });

  it('чужой ход, занятый босс и ход после конца отклоняются понятным текстом', () => {
    const s0 = newSeries(3, 1), A = s0.first, B: Side = A === 0 ? 1 : 0;
    expect(applyVeto(s0, B, 'misha')).toEqual({ ok: false, why: 'сейчас ходит соперник' });
    expect(applyVeto(s0, A, 'ghost')).toMatchObject({ ok: false });
    const r1 = applyVeto(s0, A, 'misha'); expect(r1.ok).toBe(true);
    if (r1.ok) expect(applyVeto(r1.s, B, 'misha')).toEqual({ ok: false, why: 'этого босса уже нет в списке' });
    const done = veto(s0); expect(applyVeto(done, A, 'korne')).toEqual({ ok: false, why: 'бан/пик уже закончен' });
  });

  it('первого назначает жребий из зерна: встречаются обе стороны, результат повторяем', () => {
    const firsts = new Set<number>(); for (let i = 0; i < 40; i++) firsts.add(newSeries(3, i * 7919).first);
    expect(firsts.size).toBe(2); expect(newSeries(3, 123).first).toBe(newSeries(3, 123).first);
  });

  it('выбор за игрока детерминирован и всегда из списка; карточки показывают баны, пики и решающего', () => {
    const s = newSeries(3, 8), a = autoVeto(s)!; expect(s.pool).toContain(a); expect(autoVeto(s)).toBe(a);
    const done = veto(s, ['tima', 'korne', 'misha']), st = cardStates(done);
    expect(st.tima.st).toBe('ban'); expect(st.korne.st).toBe('pick'); expect(st.misha.st).toBe('pick'); expect(st.vladik.st).toBe('decider');
    expect(done.log.map((x) => x.boss)).toEqual(['tima', 'korne', 'misha']);
  });
});

describe('раунды и счёт серии', () => {
  it('кто быстрее убил — тот победил; убил только один — он; никто — у кого снято больше; ничья в 10 мс', () => {
    const k = (t: number) => ({ kill: true, time: t, frac: 1 }), d = (f: number) => ({ kill: false, time: null, frac: f });
    expect(roundWinner(k(40000), k(41000))).toMatchObject({ winner: 'a', why: 'faster', gap: 1000 });
    expect(roundWinner(k(41000), k(40000))).toMatchObject({ winner: 'b', why: 'faster' });
    expect(roundWinner(k(40000), d(0.9))).toMatchObject({ winner: 'a', why: 'kill' });
    expect(roundWinner(d(0.99), k(70000))).toMatchObject({ winner: 'b', why: 'kill' });
    expect(roundWinner(d(0.4), d(0.7))).toMatchObject({ winner: 'b', why: 'damage' });
    expect(roundWinner(d(0.7), d(0.4))).toMatchObject({ winner: 'a', why: 'damage' });
    expect(roundWinner(d(0.5), d(0.5)).winner).toBe('draw');
    expect(roundWinner(k(40000), k(40005)).winner).toBe('draw');
    expect(roundWinner({ ...d(0.9), quit: true }, d(0.1))).toMatchObject({ winner: 'b', why: 'walkover' });
    expect(roundWinner({ ...d(0.2), quit: true }, { ...d(0.1), quit: true }).winner).toBe('draw');
    expect(fracOf(0, 30)).toBe(1); expect(fracOf(30, 30)).toBe(0); expect(fracOf(15, 30)).toBe(0.5); expect(fracOf(5, 0)).toBe(0);
  });

  it('Bo3: 2:0 заканчивает серию; 1:1 ведёт к решающему; раунды берут босса по порядку', () => {
    let s = veto(newSeries(3, 21), ['korne', 'misha', 'vladik']); // раунды: misha, vladik, tima
    const p1 = planRound(s)!; expect(p1.boss).toBe('misha'); expect(p1.ch).toBe(2); expect(p1.n).toBe(1);
    s = recordRound(s, p1, win('a')).s; expect(s.score).toEqual([1, 0]); expect(s.stage).toBe('play');
    const p2 = planRound(s)!; expect(p2.boss).toBe('vladik'); expect(p2.seed).not.toBe(p1.seed);
    s = recordRound(s, p2, win('b')).s; expect(s.score).toEqual([1, 1]);
    const p3 = planRound(s)!; expect(p3.boss).toBe('tima'); expect(BOSS_INFO[p3.boss].ch).toBe(4);
    s = recordRound(s, p3, win('b')).s; expect(s.stage).toBe('over'); expect(s.winner).toBe(1); expect(planRound(s)).toBeNull();
  });

  it('Bo1 заканчивается первым раундом, Bo5 — на третьей победе', () => {
    let s = veto(newSeries(1, 3)); s = recordRound(s, planRound(s)!, win('b')).s; expect(s).toMatchObject({ stage: 'over', winner: 1 });
    let t = veto(newSeries(5, 3));
    for (const w of ['a', 'b', 'a', 'b'] as const) { t = recordRound(t, planRound(t)!, win(w)).s; expect(t.stage).toBe('play'); }
    expect(planRound(t)!.n).toBe(5); t = recordRound(t, planRound(t)!, win('a')).s; expect(t).toMatchObject({ stage: 'over', winner: 0, score: [3, 2] });
  });

  it('ничья переигрывается тем же боссом и новым зерном; третья ничья подряд решается жребием', () => {
    let s = veto(newSeries(3, 4), ['korne', 'misha', 'vladik']);
    const d: RoundVerdict = { winner: 'draw', why: 'draw', gap: null };
    const p1 = planRound(s)!; s = recordRound(s, p1, d).s;
    const p2 = planRound(s)!; expect(p2.boss).toBe(p1.boss); expect(p2.seed).not.toBe(p1.seed); expect(p2.n).toBe(2); expect(s.score).toEqual([0, 0]);
    s = recordRound(s, p2, d).s;
    const r3 = recordRound(s, planRound(s)!, d);
    expect(r3.rec.why).toBe('coin'); expect(['a', 'b']).toContain(r3.rec.winner); expect(r3.s.score[0] + r3.s.score[1]).toBe(1); expect(r3.s.draws).toBe(0);
    expect(recordRound(s, planRound(s)!, d).rec.winner).toBe(r3.rec.winner); // жребий повторяем
  });

  it('отмена последнего раунда возвращает счёт и стадию', () => {
    let s = veto(newSeries(3, 6)); s = recordRound(s, planRound(s)!, win('a')).s; s = recordRound(s, planRound(s)!, win('a')).s;
    expect(s.stage).toBe('over'); const u = undoRound(s); expect(u).toMatchObject({ stage: 'play', winner: null, score: [1, 0] }); expect(u.rounds.length).toBe(1);
  });
});

describe('модификаторы раундов', () => {
  it('постоянные идут в каждом раунде; случайный выбирается из зерна и из остальных, переигрыш ничьей его не меняет', () => {
    const fixed = veto(newSeries(3, 31, { fixed: ['blitz', 'mirror'], random: false }));
    expect(modsFor(fixed, 0)).toEqual(['mirror', 'blitz']); expect(modsFor(fixed, 2)).toEqual(['mirror', 'blitz']);
    const rnd = veto(newSeries(5, 31, { fixed: ['noheal'], random: true }));
    const m = [0, 1, 2, 3, 4].map((i) => modsFor(rnd, i));
    for (const x of m) { expect(x).toContain('noheal'); expect(x.length).toBe(2); }
    expect(m.map((x) => x.join())).toEqual([0, 1, 2, 3, 4].map((i) => modsFor(rnd, i).join())); // повторяемо
    expect(new Set(m.flat()).size).toBeGreaterThan(2); // за серию выпадают разные
    const all = veto(newSeries(3, 1, { fixed: ['onemask', 'noheal', 'mirror', 'blitz'], random: true }));
    expect(modsFor(all, 0)).toEqual(['onemask', 'noheal', 'mirror', 'blitz']); // остальных нет: случайному неоткуда взяться
    expect(cleanMods(['blitz', 'x', 'onemask', 'blitz'])).toEqual(['onemask', 'blitz']);
  });

  it('зеркало меняет влево и вправо и ничего больше; блиц ускоряет часы на 20 %; без модификаторов — те же объекты и 1', () => {
    const f = emptyFrame(); f.buttons.left = true; f.buttons.atk = true; f.edges.atkP = true;
    const m = mirrorFrame(f);
    expect(m.buttons.right).toBe(true); expect(m.buttons.left).toBe(false); expect(m.buttons.atk).toBe(true); expect(m.edges.atkP).toBe(true); expect(f.buttons.left).toBe(true);
    expect(duelInputs({ ch: 2, mods: ['mirror'] }, [f])[0]!.buttons.right).toBe(true);
    const frames = [f]; expect(duelInputs({ ch: 2, mods: ['noheal'] }, frames)).toBe(frames); expect(duelInputs(null, frames)).toBe(frames);
    expect(duelSpeed({ ch: 1, mods: ['blitz'] })).toBe(BLITZ_K); expect(duelSpeed({ ch: 1, mods: [] })).toBe(1); expect(duelSpeed(null)).toBe(1);
  });
});

// ---------- забег с модификаторами ----------
const cfg = (t: { v: number }): SessionCfg => ({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: 'test', clock: () => t.v, fx: true, wall: () => 1_700_000_000_000 + t.v });
function mk(ch: number, mods: string[], t = { v: 5000 }): Session {
  return new Session(cfg(t), { seed: 4242, mode: 'story', players: 1, camp: null }, { cat: 'boss', opt: { rc: { code: 'DUELX', seat: 1, id: 'r1', name: 'Ива', duel: { ch, mods } } } });
}
function input(i: number) {
  const f = emptyFrame(), k = (i * 2654435761) >>> 0;
  if ((i >> 5) % 3 !== 2) f.buttons.right = true; else f.buttons.left = true;
  if (k % 41 === 0) { f.buttons.jump = true; f.edges.jumpP = true; }
  if (k % 53 === 0) { f.buttons.atk = true; f.edges.atkP = true; }
  if (k % 97 === 0) { f.buttons.dash = true; f.edges.dashP = true; }
  if (k % 131 === 0) { f.buttons.heal = true; f.edges.healP = true; }
  return f;
}
const out = (s: Session): unknown => JSON.parse(JSON.stringify(outcome(s.world)));

describe('дуэльный забег: старт, поражение, победа', () => {
  it('раунд стартует на арене нужного босса; «Одна маска» оставляет одну маску', () => {
    for (const ch of [1, 2, 3, 4]) {
      const s = mk(ch, ['onemask']);
      expect(s.sr!.duel).toEqual({ ch, mods: ['onemask'] }); expect(s.world.camp!.ch).toBe(ch);
      expect(s.world.players[0]!.maxHp).toBe(1); expect(s.world.players[0]!.hp).toBe(1);
    }
    expect(mk(2, []).world.players[0]!.maxHp).toBeGreaterThan(1);
    expect(mk(1, []).world.camp!.st).toBe('level'); expect(mk(3, []).world.camp!.st).toBe('arena');
  });

  it('обрыв нити заканчивает раунд поражением: итог с долей здоровья босса, мир замирает', () => {
    const t = { v: 5000 }, s = mk(2, [], t);
    s.release(); for (let i = 0; i < 90; i++) { t.v += 1000 / 60; s.frame(1000 / 60, [input(i)]); }
    const w = s.world, p = w.players[0]!;
    expect(s.sr!.done).toBe(false);
    hurtPlayer(w, p, 99, null, true);
    expect(s.sr!.done).toBe(true);
    const res = s.sr!.result!;
    expect(res.duel).toMatchObject({ kill: false, ch: 2 }); expect(res.duel!.mh).toBeGreaterThan(0); expect(res.duel!.hp).toBeLessThanOrEqual(res.duel!.mh); expect(res.splits).toEqual([]);
    const tick = w.tickN; s.frame(1000 / 60, [input(1)]); s.frame(1000 / 60, [input(2)]);
    expect(w.tickN).toBe(tick); // после конца раунда мир стоит
  });

  it('убийство босса заканчивает раунд победой: kill, один сплит', () => {
    const t = { v: 5000 }, s = mk(2, [], t);
    s.release(); for (let i = 0; i < 60; i++) { t.v += 1000 / 60; s.frame(1000 / 60, [emptyFrame()]); }
    RACE_EXT[1]!(s.world);
    for (let i = 0; i < 600 && !s.sr!.done; i++) { t.v += 1000 / 60; s.frame(1000 / 60, [emptyFrame()]); }
    expect(s.sr!.done).toBe(true);
    expect(s.sr!.result!.duel).toMatchObject({ kill: true, ch: 2, hp: 0 }); expect(s.sr!.result!.splits.length).toBe(1);
    expect(s.sr!.stats!.bosses[0]).toMatchObject({ ch: 2 });
  });

  it('«Без лечения»: лечение нитью не срабатывает, а без модификатора срабатывает', () => {
    for (const mods of [[], ['noheal']]) {
      const t = { v: 5000 }, s = mk(2, mods, t);
      s.release(); for (let i = 0; i < 30; i++) { t.v += 1000 / 60; s.frame(1000 / 60, [emptyFrame()]); }
      const p = s.world.players[0]!; p.maxHp = 5; p.hp = 3; p.silk = s.world.silkMax;
      const f = emptyFrame(); f.buttons.heal = true; f.edges.healP = true;
      t.v += 1000 / 60; s.frame(1000 / 60, [f]);
      if (mods.length) expect(p.silk).toBe(s.world.silkMax); else expect(p.silk).toBe(0);
    }
  });

  it('«Блиц»: за то же реальное время проходит на 20 % больше тиков; без него — как раньше', () => {
    const run = (mods: string[]): number => { const t = { v: 5000 }, s = mk(2, mods, t); s.world.players[0]!.maxHp = s.world.players[0]!.hp = 999; s.release(); for (let i = 0; i < 600; i++) { t.v += 1000 / 60; s.frame(1000 / 60, [emptyFrame()]); } return s.world.tickN; };
    const base = run([]), fast = run(['blitz']);
    expect(fast / base).toBeGreaterThan(1.15); expect(fast / base).toBeLessThan(1.25);
  });
});

describe('модификаторы не ломают детерминизм: журнал воспроизводится в тот же исход', () => {
  for (const mods of [[], ['onemask'], ['noheal'], ['mirror'], ['blitz'], ['mirror', 'blitz', 'noheal', 'onemask']]) {
    it(`ввод ${mods.join('+') || 'без модификаторов'} → журнал → воспроизведение`, () => {
      const t = { v: 5000 }, s = mk(3, mods, t);
      s.release();
      for (let i = 0; i < 1500 && !s.sr!.done; i++) { t.v += 1000 / 60; s.frame(1000 / 60, [i < 6 ? emptyFrame() : input(i)]); }
      const J = JSON.parse(JSON.stringify(s.rec!.J)) as Journal;
      expect(J.race).toMatchObject({ duel: { ch: 3, mods } });
      const res = replayJournal(J, { ver: 'test', clock: () => t.v });
      if (!res.ok) throw new Error(res.why);
      expect(res.sr!.duel).toEqual({ ch: 3, mods });
      expect(JSON.parse(JSON.stringify(outcome(res.world)))).toEqual(out(s));
    });
  }

  it('падение вкладки посреди дуэльного раунда: восстановление и продолжение дают тот же исход, что игра без падения', () => {
    const t = { v: 5000 }, c = cfg(t), a = mk(2, ['mirror', 'blitz'], t), b = mk(2, ['mirror', 'blitz'], t);
    let i = 0;
    const both = (n: number): void => { for (let k = 0; k < n; k++, i++) { t.v += 1000 / 60; for (const s of [a, b]) { if (i === 10) s.release(); s.frame(1000 / 60, [i < 14 ? emptyFrame() : input(i)]); } } };
    both(700);
    const J = JSON.parse(JSON.stringify(a.rec!.J)) as Journal;
    const res = replayJournal(J, { ver: 'test', clock: () => t.v }); if (!res.ok) throw new Error(res.why);
    const r = new Session(c, null, undefined, { J, world: res.world, sr: res.sr });
    expect(out(r)).toEqual(out(b)); expect(r.sr!.duel).toEqual({ ch: 2, mods: ['mirror', 'blitz'] });
    for (let k = 0; k < 400; k++, i++) { t.v += 1000 / 60; r.frame(1000 / 60, [input(i)]); b.frame(1000 / 60, [input(i)]); }
    expect(out(r)).toEqual(out(b));
  });
});
