// Подложный снимок комнаты «гонка идёт» для проверки вёрстки обсервера и панели организатора без сети и без живых игроков.
// Содержит подсплиты, лавку, потерянное время, личные рекорды и босса: всё, что рисуют лента кампании и таблица сплитов.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FakeRoom { S: Record<string, any>; tel: Record<number, Record<string, any>>; log: Record<string, any>[] }

export function fakeRoom(disc: 'trail' | 'boss', now = Date.now()): FakeRoom {
  const boss = disc === 'boss';
  const pb = { t: 96000, sp: [22000, 50000, 76000, 96000], sb: { '1:exit': 9000, '1:fight': 12000, '1:ph2': 17000, '1:kill': 22000, '2:fight': 31000 }, bs: [20000, 26000, 24000, 19000] };
  const A = boss
    ? [{ ch: 1, k: 'fight', rta: 3000 }, { ch: 1, k: 'ph2', rta: 11000 }, { ch: 1, k: 'ph3', rta: 18000 }, { ch: 1, k: 'kill', rta: 24000 }, { ch: 2, k: 'fight', rta: 27000 }, { ch: 2, k: 'ph2', rta: 33000 }]
    : [{ ch: 1, k: 'exit', rta: 9500 }, { ch: 1, k: 'bench', rta: 11000 }, { ch: 1, k: 'fight', rta: 13000 }, { ch: 1, k: 'ph2', rta: 18000 }, { ch: 1, k: 'ph3', rta: 21000 }, { ch: 1, k: 'kill', rta: 23500 }, { ch: 2, k: 'exit', rta: 52000 }, { ch: 2, k: 'fight', rta: 58000 }];
  const B = boss
    ? [{ ch: 1, k: 'fight', rta: 3500 }, { ch: 1, k: 'ph2', rta: 12500 }, { ch: 1, k: 'ph3', rta: 19000 }, { ch: 1, k: 'kill', rta: 25000 }, { ch: 2, k: 'fight', rta: 28500 }]
    : [{ ch: 1, k: 'exit', rta: 9000 }, { ch: 1, k: 'fight', rta: 14000 }, { ch: 1, k: 'ph2', rta: 19500 }, { ch: 1, k: 'kill', rta: 25000 }, { ch: 2, k: 'exit', rta: 56000 }];
  const kills = (a: { k: string; rta: number }[]): number[] => a.filter((s) => s.k === 'kill').map((s) => s.rta);
  const fight = (d: number, p: number) => ({ ch: 1, dmg: d, parries: p, taken: 1, stuns: 2, execs: 0, deaths: 0, fight: 21000 });
  const players = [
    { seat: 1, name: 'Ива', ready: true, loaded: true, online: true, rtt: 30, fin: null, dnf: false, sp: kills(A).length, splits: kills(A), restored: 0, subs: A, lost: 7200, deaths: 2, buys: 2, pb, bosses: [fight(41, 3)] },
    { seat: 2, name: 'Ярь', ready: true, loaded: true, online: true, rtt: 41, fin: null, dnf: false, sp: kills(B).length, splits: kills(B), restored: 0, subs: B, lost: 0, deaths: 0, buys: 0, pb: null, bosses: [fight(38, 5)] },
  ];
  const bs = { k: 'm', x: 900, y: 500, w: 56, h: 74, s: 'idle', hp: 18, mh: 30, ph: 2, f: -1, on: 1 };
  const tel = {
    1: { s: 1, el: 62000, ig: 61000, ch: 2, st: 'arena', x: 700, y: 560, f: 1, g: 1, vx: 0, vy: 0, hp: 4, mh: 6, dt: 2, sp: 1, bd: 3, bs },
    2: { s: 2, el: 62000, ig: 61000, ch: 2, st: boss ? 'arena' : 'road', x: 900, y: 560, f: 1, g: 1, vx: 0, vy: 0, hp: 5, mh: 5, dt: 0, sp: 1, bd: 9, sh: boss ? 0 : 1 },
  };
  const t0 = boss ? 'Корнематка' : 'Гл. I';
  const log = [
    { n: 1, t: 12000, k: 'buy', s: 1, x: 'Ива купил(а): Острая игла за 12' }, { n: 2, t: 23500, k: 'split', s: 1, x: `Ива: ${t0} · 0:23.50` },
    { n: 3, t: 52000, k: 'sub', s: 1, x: boss ? 'Ива: Миша · начало боя' : 'Ива: Гл. II · выход из коридора' }, { n: 4, t: 56000, k: 'lost', s: 1, x: 'Ива: потеряно 7.2 с после обрыва нити' },
  ];
  const S = { v: 1, id: 'x', code: 'ZZZZZ', phase: 'run', disc, discName: boss ? 'Босс-раш' : 'Тропа целиком', goAt: now - 62000, ver: 't', now, pause: { on: false, total: 0, since: null }, winner: null, awarded: false, watchers: 1, players, tel: {}, log: [], result: null, stats: {} };
  return { S, tel, log };
}

// ----- «Дуэль ткачей»: подложные снимки комнаты для проверки вёрстки бан/пика, хода раунда и итога без сети и без живых игроков -----
import { applyVeto, newSeries, planRound, recordRound, vetoNow, type Series } from '../../src/core/duel';
export type DuelStage = 'veto' | 'lobby' | 'run' | 'done' | 'over';
export interface FakeDuel extends FakeRoom { chase: Record<number, [number, number][]>; duel: Record<string, any>; phase: string }
/** серия Bo3 «Ива — Ярь»: зерно подобрано так, чтобы первым ходила Ива; stage — на каком этапе снимок */
export function fakeDuel(stage: DuelStage, now = Date.now()): FakeDuel {
  let seed = 1; while (newSeries(3, seed).first !== 0) seed++;
  let s: Series = newSeries(3, seed, { fixed: ['mirror'], random: false });
  const step = (boss: string): void => { const n = vetoNow(s)!; const r = applyVeto(s, n.side, boss); if (!r.ok) throw new Error(r.why); s = r.s; };
  step('korne'); // бан Ивы
  if (stage !== 'veto') { step('misha'); step('vladik'); } // пик Яря, пик Ивы: раунды Миша, Владик, Тима
  if (stage === 'done' || stage === 'over') s = recordRound(s, planRound(s)!, { winner: 'a', why: 'faster', gap: 2400 }).s;
  if (stage === 'over') s = recordRound(s, planRound(s)!, { winner: 'a', why: 'kill', gap: null }).s;
  const plan = planRound(s);
  const names: [string, string] = ['Ива', 'Ярь'];
  const last = stage === 'done' || stage === 'over' ? { n: s.rounds.length, boss: s.rounds[s.rounds.length - 1]!.boss, winner: 'a', why: stage === 'over' ? 'kill' : 'faster', gap: stage === 'over' ? null : 2400, frac: [1, 0.72], times: [stage === 'over' ? 51000 : 47200, null] } : null;
  const duel = { id: 's1', series: s, seats: [1, 2], names, plan, cfg: { fmt: 3, fixed: ['mirror'], random: false }, last };
  const fin = stage === 'done' || stage === 'over';
  const A = [{ ch: 2, k: 'fight', rta: 3200 }, { ch: 2, k: 'ph2', rta: 21000 }, { ch: 2, k: 'ph3', rta: 36000 }, ...(fin ? [{ ch: 2, k: 'kill', rta: 47200 }] : [])];
  const B = [{ ch: 2, k: 'fight', rta: 3600 }, { ch: 2, k: 'ph2', rta: 24500 }];
  const mk = (seat: number, name: string, subs: { ch: number; k: string; rta: number }[], f: unknown) => ({ seat, name, ready: true, loaded: true, online: true, rtt: 30 + seat, fin: f, dnf: false, sp: 0, splits: [], restored: 0, subs, lost: 0, deaths: 0, buys: 0, pb: null, bosses: [] });
  const players = [mk(1, 'Ива', A, fin ? { rta: 47200, igt: 46000, deaths: 0, kill: true, frac: 1 } : null), mk(2, 'Ярь', B, null)];
  const chase: Record<number, [number, number][]> = { 1: [], 2: [] };
  const endA = fin ? 47200 : 52000, endB = fin ? 47200 : 52000;
  for (let t = 0; t <= endA; t += 250) chase[1]!.push([t, Math.round(Math.min(1000, Math.max(0, (t - 3200) / (47200 - 3200)) * 1000))]);
  for (let t = 0; t <= endB; t += 250) chase[2]!.push([t, Math.round(Math.min(720, Math.max(0, (t - 3600) / (62000 - 3600)) * 1000))]);
  const bs = (hp: number) => ({ k: 'm', x: 900, y: 500, w: 56, h: 74, s: 'idle', hp, mh: 100, ph: 2, f: -1, on: 1 });
  const tel = {
    1: { s: 1, el: endA, ig: endA - 1000, ch: 2, st: 'arena', x: 700, y: 560, f: 1, g: 1, vx: 0, vy: 0, hp: 4, mh: 5, dt: 0, sp: 0, bd: 0, bs: bs(fin ? 0 : 41) },
    2: { s: 2, el: endB, ig: endB - 1000, ch: 2, st: 'arena', x: 900, y: 560, f: 1, g: 1, vx: 0, vy: 0, hp: 3, mh: 5, dt: 0, sp: 0, bd: 0, bs: bs(fin ? 28 : 56) },
  };
  if (stage === 'veto' || stage === 'lobby') { delete (tel as any)[1]; delete (tel as any)[2]; } // до раунда телеметрии нет
  const phase = stage === 'veto' ? 'veto' : stage === 'lobby' ? 'lobby' : stage === 'run' ? 'run' : 'done';
  const log = [{ n: 1, t: null, k: 'veto', s: 1, x: 'Ива банит: Корнематка' }, { n: 2, t: 21000, k: 'phase', s: 1, x: 'Ива: босс перешёл в фазу 2' }];
  const S = { v: 1, id: 'x', code: 'ZZZZZ', phase, disc: 'duel', discName: 'Дуэль ткачей', goAt: now - endA, ver: 't', now, pause: { on: false, total: 0, since: null }, winner: null, awarded: false, watchers: 1, players, tel: {}, log: [], result: null, stats: {}, duel };
  return { S, tel, log, chase, duel, phase };
}
