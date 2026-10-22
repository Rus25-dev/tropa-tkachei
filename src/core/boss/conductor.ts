// Дирижёр нескольких боссов (волна 0): в бою до трёх боссов (sc.bosses[0] — ведущий, раздел conductor — в его JSON), каждый со своим здоровьем или с общим пулом.
// Расписание — по общему такту (beat): в такт цикла босс (или все) начинает связку и, при желании, запускает сущность арены.
// Эстафета: когда босс A заканчивает связку, босс B через after кадров начинает свою. Победа: общий пул обнулён / убиты все (win: all) / убит любой (win: any).
// Состояние — sc.cond, обычные данные. Часы дирижёра — кадры мира, они идут, когда все участники вышли из вступления; занятый босс пропускает такт (skips).
import { arenaFire } from './arena';
import { dstate, forceChain } from './exec';
import { bossDef } from './registry';
import type { Conductor } from './schema';
import type { World } from '../world';

export interface CondRt {
  clk: number;
  /** отложенные начала связок эстафеты; wait — сколько ещё ждать, пока босс освободится */
  relay: { to: number; chain: string; due: number; wait: number }[];
  /** сколько раз приказ пропущен, потому что босс был занят (диагностика и тесты) */
  skips: number;
  /** бой окончен (победа объявлена) */
  over: boolean;
}

export const condOf = (sc: World): Conductor | null => {
  const lead = sc.bosses[0]; if (!sc.cond || !lead) return null;
  return bossDef(dstate(lead).id)?.conductor ?? null;
};
export function makeCond(sc: World): void {
  const lead = sc.bosses[0], cd = lead && bossDef(dstate(lead).id)?.conductor;
  sc.cond = cd ? { clk: 0, relay: [], skips: 0, over: false } : null;
}

/** босса i ведёт дирижёр (иначе он выбирает связки сам; защитные приоритетные связки — отгон и перемещение — работают в любом случае) */
export function conducted(sc: World, i: number): boolean {
  const cd = condOf(sc); if (!cd) return false;
  return i === 0 ? cd.lead === 'conductor' : cd.members[i - 1]?.policy === 'conductor';
}

/** босс готов принять приказ: стоит в покое, не оглушён */
function ready(sc: World, i: number): boolean {
  const b = sc.bosses[i]; if (!b || b.state === 'dead') return false;
  const d = dstate(b);
  return d.mode === 'idle' && !(b.stagger > 0);
}
function order(sc: World, i: number, chain: string): boolean {
  const b = sc.bosses[i]; if (!b) return false;
  if (!bossDef(dstate(b).id)!.chains.some((c) => c.id === chain)) return false;
  return ready(sc, i) && forceChain(sc, i, chain);
}

/** Кадр дирижёра (до шагов боссов): метроном, расписание, эстафета. */
export function stepCond(sc: World): void {
  const C = sc.cond, cd = condOf(sc); if (!C || !cd || C.over) return;
  if (sc.bosses.some((b) => b.state !== 'dead' && dstate(b).mode === 'intro')) return;
  if (sc.bosses.every((b) => b.state === 'dead')) return;
  for (const r of C.relay.slice()) {
    if (--r.due > 0) continue;
    if (order(sc, r.to, r.chain)) C.relay.splice(C.relay.indexOf(r), 1);
    else if (--r.wait <= 0 || sc.bosses[r.to]?.state === 'dead') { C.relay.splice(C.relay.indexOf(r), 1); C.skips++; }
  }
  if (C.clk % cd.beat === 0) {
    const cb = (C.clk / cd.beat) % cd.cycle;
    for (const e of cd.schedule) {
      if (e.beat !== cb) continue;
      const targets = e.boss === 'all' ? sc.bosses.map((_, i) => i) : [e.boss];
      for (const i of targets) if (sc.bosses[i] && sc.bosses[i]!.state !== 'dead' && !order(sc, i, e.chain)) C.skips++;
      if (e.arena) arenaFire(sc, e.arena, 'w', 0);
    }
  }
  C.clk++;
}

/** Босс i закончил связку chain: эстафета */
export function condOnChainEnd(sc: World, i: number, chain: string): void {
  const C = sc.cond, cd = condOf(sc); if (!C || !cd || C.over) return;
  for (const r of cd.relay) if (r.from === i && r.chain === chain) C.relay.push({ to: r.to, chain: r.next, due: Math.max(1, r.after), wait: 180 });
}

/** Общий пул здоровья: у всех одно значение (меньшее из текущих); обнулился — падают все. */
export function syncPool(sc: World): void {
  const cd = condOf(sc); if (!cd || !cd.pool) return;
  const live = sc.bosses.filter((b) => b.state !== 'dead');
  if (live.length === sc.bosses.length) {
    const hp = Math.min(...sc.bosses.map((b) => b.hp));
    for (const b of sc.bosses) b.hp = hp;
  }
}

/** Доля здоровья для полосы босса: общий пул или сумма по участникам */
export function barFrac(sc: World): number {
  const cd = condOf(sc), live = sc.bosses;
  if (!cd) { const b = live[0]; return b ? Math.max(0, b.hp) / b.maxHp : 0; }
  if (cd.pool) return Math.max(0, live[0]!.hp) / live[0]!.maxHp;
  return live.reduce((s, b) => s + Math.max(0, b.hp), 0) / live.reduce((s, b) => s + b.maxHp, 0);
}

/** Смерть босса i завершает бой? Раздельное здоровье с win: all — только когда убиты все. */
export function deathIsFinal(sc: World, i: number): boolean {
  const cd = condOf(sc); if (!cd) return true;
  if (cd.pool || cd.win === 'any') return true;
  return sc.bosses.every((b, j) => j === i || b.state === 'dead');
}
