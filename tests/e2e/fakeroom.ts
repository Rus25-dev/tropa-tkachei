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
