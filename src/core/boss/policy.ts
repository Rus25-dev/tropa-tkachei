// Выбор связки: чистые функции без мира и без своего ГСЧ (число r из [0,1) приходит снаружи — sc.rngFor('boss')).
// «Сухое правило»: связка, чьи условия не выполнены, выбрана быть не может ни при каком r.
import type { BossDef, Chain, Policy, Requires } from './schema';
import { atkUses, framesOf, noteAtk, resolveAnti, shovePriority } from './anti';

export type ArenaSide = 'left' | 'right' | 'center';
export interface PickCtx {
  /** горизонтальная дистанция до ближайшего героя (Infinity, если героев нет) */
  dist: number;
  side: ArenaSide;
  /** hp / maxHp */
  hpFrac: number;
  /** номер фазы, 1-based */
  phase: number;
  /** сколько подряд кадров герой был ближе closeDist приоритета, по id связки приоритета */
  closeF: Record<string, number>;
  /** герой прижат к боковой стене арены (для «отогнать» порог короче) */
  corner?: boolean;
  /** сколько кадров подряд герой рядом с боссом и не получал урона (для «перемещения») */
  calmF?: number;
}
export interface PolicyMem {
  /** недавние связки, новые в конце */
  hist: string[];
  /** осталось кадров до конца перезарядки связки */
  cd: Record<string, number>;
  /** «усталость»: сколько недавних использований связки (дробное, спадает со временем) */
  uses: Record<string, number>;
  /** кадры политики (для запрета спама) */
  clk: number;
  /** когда (clk) начинались атаки: для запрета спама одной атаки */
  au: Record<string, number[]>;
}
export const newMem = (): PolicyMem => ({ hist: [], cd: {}, uses: {}, clk: 0, au: {} });

/** условия выполнены? (withDist=false — дистанцию не проверять: для не первых шагов связки) */
export function meets(req: Requires | undefined, ctx: PickCtx, withDist = true): boolean {
  if (!req) return true;
  if (req.phase && !req.phase.includes(ctx.phase)) return false;
  if (req.hpBelow !== undefined && !(ctx.hpFrac <= req.hpBelow)) return false;
  if (req.arenaSide && req.arenaSide !== ctx.side) return false;
  if (withDist && req.dist && !(ctx.dist >= req.dist[0] && ctx.dist <= req.dist[1])) return false;
  return true;
}

/** связку можно выбрать по условиям: свои + условия первого приёма (дистанцию проверяем только у первого шага) */
export function chainAllowed(def: BossDef, c: Chain, ctx: PickCtx, mem: PolicyMem): boolean {
  if ((mem.cd[c.id] ?? 0) > 0) return false;
  if (!meets(c.requires, ctx)) return false;
  if (spamBlocked(def, c, mem)) return false;
  const first = def.attacks.find((a) => a.id === c.steps[0]!.attack);
  return !first || meets(first.requires, ctx);
}

/** запрет спама: атака связки уже начиналась maxUses раз за окно (защитные связки «отгон» и «перемещение» не ограничиваются) */
function spamBlocked(def: BossDef, c: Chain, mem: PolicyMem): boolean {
  const cfg = resolveAnti(def);
  if (!cfg || c.id === cfg.shoveChain || c.id === cfg.relocateChain) return false;
  const n: Record<string, number> = {};
  for (const s of c.steps) n[s.attack] = (n[s.attack] ?? 0) + 1;
  for (const id in n) if (atkUses(mem.au, id, mem.clk, cfg) + n[id]! > cfg.spam.maxUses) return true;
  return false;
}

export const phaseIdx = (def: BossDef, phase: number): number => Math.max(0, Math.min(def.phases.length - 1, phase - 1));
export const policyOf = (def: BossDef, phase: number): Policy => def.phases[phaseIdx(def, phase)]!.policy;

/** Приоритеты «отогнать» фазы: свои из политики и общий из защиты от читов (shoveChain). */
export function priorities(def: BossDef, phase: number): { chain: string; closeDist: number; closeFrames: number; cornerFrames?: number }[] {
  const list = [...policyOf(def, phase).priority], sh = shovePriority(resolveAnti(def));
  if (sh && !list.some((p) => p.chain === sh.chain)) list.push(sh);
  return list;
}

/** Приоритетная связка, если пора: «отогнать» (герой вплотную достаточно долго; у стены порог короче) или «перемещение» (герой долго рядом и невредим). */
export function priorityChain(def: BossDef, ctx: PickCtx, mem: PolicyMem): string | null {
  for (const p of priorities(def, ctx.phase)) {
    const need = ctx.corner && p.cornerFrames ? p.cornerFrames : p.closeFrames;
    if ((ctx.closeF[p.chain] ?? 0) < need) continue;
    const c = def.chains.find((x) => x.id === p.chain);
    if (c && chainAllowed(def, c, ctx, mem)) return c.id;
  }
  const cfg = resolveAnti(def);
  if (cfg?.relocateChain && (ctx.calmF ?? 0) >= framesOf(cfg.relocate.sec)) {
    const c = def.chains.find((x) => x.id === cfg.relocateChain);
    if (c && chainAllowed(def, c, ctx, mem)) return c.id;
  }
  return null;
}

/** Допустимые для выбора связки (без приоритетов). relax — не учитывать noRepeat, кроме самой последней связки. */
export function eligible(def: BossDef, ctx: PickCtx, mem: PolicyMem, relax = false): Chain[] {
  const pol = policyOf(def, ctx.phase);
  const banned = new Set(relax ? mem.hist.slice(-1) : pol.noRepeat > 0 ? mem.hist.slice(-pol.noRepeat) : []);
  const out: Chain[] = [];
  for (const id of pol.chains) {
    const c = def.chains.find((x) => x.id === id);
    if (c && !banned.has(c.id) && chainAllowed(def, c, ctx, mem)) out.push(c);
  }
  return out;
}

/** Вес связки с учётом усталости. */
export function weightOf(pol: Policy, c: Chain, mem: PolicyMem): number {
  const u = mem.uses[c.id] ?? 0;
  return pol.fatigue && u > 0 ? c.weight * Math.pow(pol.fatigue.factor, u) : c.weight;
}

/** Выбор связки; r — число из [0,1) ровно одним обращением к ГСЧ. null — нечего выбрать (босс подождёт). */
export function pickChain(def: BossDef, ctx: PickCtx, mem: PolicyMem, r: number): string | null {
  const pr = priorityChain(def, ctx, mem);
  if (pr) return pr;
  let list = eligible(def, ctx, mem);
  if (!list.length) list = eligible(def, ctx, mem, true);
  if (!list.length) return null;
  const pol = policyOf(def, ctx.phase);
  const ws = list.map((c) => weightOf(pol, c, mem)), sum = ws.reduce((s, w) => s + w, 0);
  let x = r * sum;
  for (let i = 0; i < list.length; i++) { x -= ws[i]!; if (x < 0) return list[i]!.id; }
  return list[list.length - 1]!.id;
}

/** Запомнить использование связки. */
export function noteUse(def: BossDef, mem: PolicyMem, c: Chain, phase: number): void {
  mem.hist.push(c.id); if (mem.hist.length > 12) mem.hist.shift();
  const cfg = resolveAnti(def);
  if (cfg) for (const st of c.steps) noteAtk(mem.au, st.attack, mem.clk, cfg);
  if (c.cooldown > 0) mem.cd[c.id] = c.cooldown;
  const pol = policyOf(def, phase);
  if (pol.fatigue) mem.uses[c.id] = (mem.uses[c.id] ?? 0) + 1;
}
/** Один кадр: перезарядка и усталость спадают. */
export function tickMem(def: BossDef, mem: PolicyMem, phase: number): void {
  mem.clk++;
  for (const k in mem.cd) if (mem.cd[k]! > 0) mem.cd[k]!--;
  const f = policyOf(def, phase).fatigue;
  if (f) for (const k in mem.uses) mem.uses[k] = Math.max(0, mem.uses[k]! - 1 / f.decay);
}
