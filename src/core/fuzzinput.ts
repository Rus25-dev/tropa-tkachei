// Генератор случайного (с зерном) ввода для фаззинга и симуляций: у каждой кнопки своя «плотность» и средняя длина нажатия
// (двухсостоянная марковская цепь), направление чаще к боссу. Тот же алгоритм, что в legacy/tools/golden.js (записи fuzz-*).
import { mulberry32 } from './rng';
import type { Inp } from './types';
import type { World } from './world';

const BTN: Record<string, [duty: number, hold: number]> = { jump: [0.3, 28], atk: [0.4, 14], dash: [0.06, 6], heal: [0.12, 24], bomb: [0.05, 6], tool: [0.1, 8], up: [0.16, 18], down: [0.1, 18] };

export function makeFuzzer(w: World, seed: number): (i: number) => Inp { return makeFuzzerOf(() => w, seed, w.players.length); }

/** То же для сессии, где мир меняется (главы, «Заново»): мир берётся из getW при каждом вызове; n — число игроков */
export function makeFuzzerOf(getW: () => World, seed: number, n: number): (i: number) => Inp {
  const R = mulberry32((seed * 2654435761) >>> 0);
  const st = Array.from({ length: n }, () => ({ dir: 0, dirT: 0, on: {} as Record<string, boolean> }));
  return (i: number): Inp => {
    const w = getW();
    const s = st[i]!, p = w.players[i]!, b = w.testBoss() ?? w.boss;
    if (--s.dirT <= 0) {
      s.dirT = 6 + Math.floor(R() * 40);
      const toward = b && b.state !== 'gone' && R() < 0.65 ? Math.sign(b.x + b.w / 2 - (p.x + 7)) : (R() < 0.5 ? -1 : 1);
      s.dir = R() < 0.12 ? 0 : toward;
    }
    const out: Record<string, boolean> = { left: s.dir < 0, right: s.dir > 0, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false };
    for (const k in BTN) {
      const [duty, hold] = BTN[k]!, was = !!s.on[k], pOff = 1 / hold, pOn = (duty * pOff) / (1 - duty);
      const on = was ? !(R() < pOff) : R() < pOn; s.on[k] = on; out[k] = on;
    }
    return out as Inp;
  };
}

/** Ввод кадра: фронты нажатий (pend) выводятся из смены удержания, как в GameScene.update v1.8 */
export function feedInput(w: World, raws: Inp[]): void {
  for (const p of w.players) {
    const r = raws[p.i] ?? {}, pr = p.prev, pd = p.pend;
    pd.jumpP ||= !!r.jump && !pr.jump; pd.atkP ||= !!r.atk && !pr.atk; pd.dashP ||= !!r.dash && !pr.dash; pd.healP ||= !!r.heal && !pr.heal;
    pd.upP ||= !!r.up && !pr.up; pd.bombP ||= !!r.bomb && !pr.bomb; pd.toolP ||= !!r.tool && !pr.tool;
    p.raw = r; p.prev = r;
  }
}

/**
 * Полуслучайный «ходок»: движется к цели по x (goalX вернёт пиксель или null), у стены и случайно прыгает, чаще бьёт и жмёт рывок,
 * лечится при малом здоровье, иногда блуждает. Годится, чтобы фаззер доходил до скамей, ворот, боссов и выходов, а не топтался у старта.
 */
export function makeWalker(getW: () => World, seed: number, n: number, goalX: (w: World, i: number) => number | null): (i: number) => Inp {
  const R = mulberry32((seed * 2246822519 + 7) >>> 0);
  const st = Array.from({ length: n }, () => ({ dir: 1, dirT: 0, jump: 0, atk: 0, dash: 0, heal: 0, up: 0, down: 0, bomb: 0, tool: 0 }));
  return (i: number): Inp => {
    const w = getW(), s = st[i]!, p = w.players[i]!;
    if (--s.dirT <= 0) {
      s.dirT = 8 + Math.floor(R() * 30);
      const g = goalX(w, i);
      if (R() < 0.12) { s.dir = R() < 0.5 ? -1 : 1; s.dirT += 20 + Math.floor(R() * 40); } // блуждание
      else if (R() < 0.04) s.dir = 0;
      else s.dir = g == null ? (R() < 0.5 ? -1 : 1) : (Math.sign(g - (p.x + 7)) || 1);
    }
    if (s.jump > 0) s.jump--;
    else if (((p.hitL && s.dir < 0) || (p.hitR && s.dir > 0)) && R() < 0.5) s.jump = 8 + Math.floor(R() * 26);
    else if (R() < 0.018) s.jump = 6 + Math.floor(R() * 30);
    if (s.atk > 0) s.atk--; else if (R() < 0.05) s.atk = 4 + Math.floor(R() * 14);
    if (s.dash > 0) s.dash--; else if (R() < 0.008) s.dash = 3 + Math.floor(R() * 4);
    if (s.heal > 0) s.heal--; else if ((p.hp < p.maxHp && p.silk >= 9 && R() < 0.1) || R() < 0.003) s.heal = 6 + Math.floor(R() * 70);
    if (s.up > 0) s.up--; else if (R() < 0.01) s.up = 2 + Math.floor(R() * 12);
    if (s.down > 0) s.down--; else if (R() < 0.006) s.down = 2 + Math.floor(R() * 10);
    if (s.bomb > 0) s.bomb--; else if (R() < 0.004) s.bomb = 2 + Math.floor(R() * 4);
    if (s.tool > 0) s.tool--; else if (R() < 0.006) s.tool = 2 + Math.floor(R() * 5);
    return { left: s.dir < 0, right: s.dir > 0, up: s.up > 0, down: s.down > 0, jump: s.jump > 0, atk: s.atk > 0, dash: s.dash > 0, heal: s.heal > 0, bomb: s.bomb > 0, tool: s.tool > 0 };
  };
}
