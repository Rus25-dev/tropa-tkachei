// Таблица исходов бота: задания, свёртка по ячейкам (босс × мастерство) и вывод с доверительными интервалами.
import { BOSSES, BOSS_NAMES, type BossId, type FightJob, type FightResult } from './fight';
import { bootstrapCI, mean, median, num, pct, wilson } from './stats';

export interface TableSpec { bosses: BossId[]; skills: number[]; fights: number; players: number; maxSec: number; seed: number; ver?: string }

export const DEFAULT_SKILLS = [0.3, 0.6, 0.95];

/** Задания таблицы. Зерно боя — как в legacy/tools/bot.js: seed + r*13 + round(мастерство*100); один и тот же spec даёт те же бои. */
export function tableJobs(s: TableSpec): FightJob[] {
  const jobs: FightJob[] = [];
  for (const boss of s.bosses) for (const skill of s.skills) for (let r = 0; r < s.fights; r++) jobs.push({ boss, skill, players: s.players, seed: s.seed + r * 13 + Math.round(skill * 100), maxSec: s.maxSec, ver: s.ver });
  return jobs;
}

export interface Cell {
  boss: BossId; skill: number; n: number; wins: number; winRate: number; winCI: [number, number];
  /** время боя победных боёв, с */
  winTime: { mean: number; ci: [number, number]; median: number };
  /** время боя всех боёв (поражения — до обрыва нити) */
  allTime: { mean: number; ci: [number, number] };
  wipes: number; wipeRate: number; wipeCI: [number, number]; timeouts: number; errors: number;
  dmg: number; stag: number; exec: number; parry: number; pdodge: number;
  /** средний остаток здоровья босса при поражении, доля */
  lostBossFrac: number | null;
  hurt: Record<string, number>;
}

export function summarize(jobs: FightJob[], results: FightResult[]): Cell[] {
  const cells: Cell[] = [], keys = new Map<string, number[]>();
  jobs.forEach((j, i) => { const k = j.boss + '|' + j.skill; (keys.get(k) ?? keys.set(k, []).get(k)!).push(i); });
  for (const [, idx] of keys) {
    const j0 = jobs[idx[0]!]!, rs = idx.map((i) => results[i]!).filter((r) => !r.error), errors = idx.length - rs.length;
    const win = rs.filter((r) => r.won), lost = rs.filter((r) => !r.won), n = rs.length;
    const wipes = rs.filter((r) => r.died).length;
    const winT = win.map((r) => r.sec), allT = rs.map((r) => r.sec);
    const hurt: Record<string, number> = {};
    for (const r of rs) for (const k in r.hurt) hurt[k] = (hurt[k] ?? 0) + r.hurt[k]!;
    const seed = 1000 + Math.round(j0.skill * 100) + BOSSES.indexOf(j0.boss) * 7;
    cells.push({
      boss: j0.boss, skill: j0.skill, n, wins: win.length, winRate: n ? win.length / n : NaN, winCI: wilson(win.length, n),
      winTime: { mean: mean(winT), ci: bootstrapCI(winT, { seed }), median: median(winT) },
      allTime: { mean: mean(allT), ci: bootstrapCI(allT, { seed: seed + 1 }) },
      wipes, wipeRate: n ? wipes / n : NaN, wipeCI: wilson(wipes, n), timeouts: rs.filter((r) => r.timeout).length, errors,
      dmg: mean(rs.map((r) => r.dmg)), stag: mean(rs.map((r) => r.stag)), exec: mean(rs.map((r) => r.exec)), parry: mean(rs.map((r) => r.parry)), pdodge: mean(rs.map((r) => r.pdodge)),
      lostBossFrac: lost.length ? mean(lost.map((r) => r.bossFrac)) : null, hurt,
    });
  }
  return cells;
}

const ci = (c: [number, number], f: (x: number) => string): string => (Number.isFinite(c[0]) ? `${f(c[0])}–${f(c[1])}` : '-');
const sec = (x: number): string => num(x, 0);

/** Таблица в Markdown (читается и в терминале) */
export function renderTable(cells: Cell[], head: string): string {
  const out = [head, '',
    '| Босс | Мастерство | Победы | Побед % [95% Уилсон] | Время победы, с: ср. [95% бутстрэп] | медиана | Обрывы нити % [95% Уилсон] | Таймауты | Урон | Оглушений | Казней | Отбивов | Идеальных уворотов | HP босса при поражении |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const c of cells) {
    out.push(`| ${BOSS_NAMES[c.boss]} | ${c.skill} | ${c.wins}/${c.n} | ${pct(c.winRate)} [${ci(c.winCI, pct)}] | ${sec(c.winTime.mean)} [${ci(c.winTime.ci, sec)}] | ${sec(c.winTime.median)} | ${pct(c.wipeRate)} [${ci(c.wipeCI, pct)}] | ${c.timeouts} | ${num(c.dmg, 1)} | ${num(c.stag, 1)} | ${num(c.exec, 1)} | ${num(c.parry, 1)} | ${num(c.pdodge, 1)} | ${c.lostBossFrac == null ? '-' : pct(c.lostBossFrac)} |`);
  }
  if (cells.some((c) => c.errors)) out.push('', `Боёв с ошибкой в ядре: ${cells.reduce((a, c) => a + c.errors, 0)} (см. --verbose)`);
  return out.join('\n');
}

export function hurtLine(c: Cell): string {
  return Object.entries(c.hurt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ');
}
