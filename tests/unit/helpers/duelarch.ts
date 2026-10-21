// Архив с серией «Дуэли ткачей» для проверки рейтинга, таблиц и картинки: Bo3 «Ива — Ярь» (Миша, Владик, Тима) и обычная гонка «Тропа целиком».
import { computeElo } from '../../../src/core/elo';
import type { DuelBoss } from '../../../src/core/duel';
import type { RaceResult, ResultRow } from '../../../src/net/racecommon';

const row = (seat: number, name: string, kill: boolean, time: number | null, frac: number, extra: Partial<ResultRow> = {}): ResultRow => ({
  seat, name, dnf: !kill, time, finalTime: time, igt: time, deaths: kill ? 0 : 1, stats: null, splits: kill && time != null ? [time] : [], eloBefore: null, eloAfter: null, place: 0,
  duel: { kill, frac, dmg: Math.round(frac * 100) }, ...extra,
});
interface RoundIn { boss: DuelBoss; win: 0 | 1; a: ResultRow; b: ResultRow; score: [number, number]; why: string; final?: boolean; at: string }
function round(i: number, r: RoundIn): RaceResult {
  const a = { ...r.a, place: r.win === 0 ? 1 : 2 }, b = { ...r.b, place: r.win === 1 ? 1 : 2 };
  return {
    id: `d${i}`, date: r.at, version: '2.4.0', discipline: 'duel', settings: { cat: 'duel', easy: false, speed: 100 }, seed: 100 + i, players: [a, b], winner: r.win === 0 ? 'Ива' : 'Ярь', winnerSeat: r.win + 1, awarded: false,
    gap: a.time != null && b.time != null ? Math.abs(a.time - b.time) : null, goAt: 0, pauseMs: 0, events: [], seriesId: 'ser1', round: i,
    duel: { fmt: 3, boss: r.boss, mods: i === 2 ? ['mirror', 'blitz'] : ['mirror'], slot: i - 1, why: r.why as never, score: r.score, ...(r.final ? { final: true, seriesWinner: 'Ива' } : {}) },
  };
}
/** архив: три раунда серии Bo3 (Ива побеждает 2:1) и одна гонка «Тропы» после неё; Эло заполнено так, как это делает организатор */
export function duelArchive(): RaceResult[] {
  const trail: RaceResult = {
    id: 't1', date: '2026-04-01T09:00:00.000Z', version: '2.4.0', discipline: 'trail', settings: { cat: 'trail', easy: false, speed: 100 }, seed: 7,
    players: [{ seat: 1, name: 'Ива', dnf: false, time: 900000, finalTime: 900000, igt: 890000, deaths: 1, stats: null, splits: [200000, 450000, 700000, 900000], eloBefore: null, eloAfter: null, place: 1 },
      { seat: 2, name: 'Ярь', dnf: false, time: 950000, finalTime: 950000, igt: 940000, deaths: 2, stats: null, splits: [210000, 470000, 720000, 950000], eloBefore: null, eloAfter: null, place: 2 }],
    winner: 'Ива', winnerSeat: 1, awarded: false, gap: 50000, goAt: 0, pauseMs: 0, events: [],
  };
  const races: RaceResult[] = [
    round(1, { boss: 'misha', win: 0, a: row(1, 'Ива', true, 47200, 1), b: row(2, 'Ярь', false, null, 0.72), score: [1, 0], why: 'kill', at: '2026-03-01T10:00:00.000Z' }),
    round(2, { boss: 'vladik', win: 1, a: row(1, 'Ива', true, 61000, 1), b: row(2, 'Ярь', true, 58500, 1), score: [1, 1], why: 'faster', at: '2026-03-01T10:05:00.000Z' }),
    round(3, { boss: 'tima', win: 0, a: row(1, 'Ива', false, null, 0.9), b: row(2, 'Ярь', false, null, 0.55), score: [2, 1], why: 'damage', final: true, at: '2026-03-01T10:10:00.000Z' }),
    trail,
  ];
  const t = computeElo(races);
  for (const r of races) { const c = t.perRace[r.id]; if (c) for (const p of r.players) { const e = c.disc[p.name.toLowerCase()]; if (e) { p.eloBefore = e.before; p.eloAfter = e.after; } } }
  return races;
}
