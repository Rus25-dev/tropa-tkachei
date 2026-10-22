// Тренировка босс-теста (legacy/src/training.js): старт с выбранной фазы, сброс босса, счётчик урона за 10 с и DPS, «телеграфы» атак.
// Здоровье героя не убывает (см. damage.hurtPlayerTraining); рекорды не пишутся (qolFight выключен).
import { respawnLocal } from './combat';
import type { Boss } from './types';
import { phaseOf, type World } from './world';
import { currentAttackName, forceChain, frameInfo, resetFight } from './boss/exec';
import { bossDef } from './boss/registry';
import { condOf } from './boss/conductor';

export interface TrainState {
  t: number; log: [number, number][]; total: number; first: number | null; tele: { name: string; win: number; at: number } | null;
  boss: Boss | null; lastHp: number; prev: string; hits: number; resets: number;
  /** фаза старта (1–3) */
  phase: number;
}
export const newTrain = (phase: number): TrainState => ({ t: 0, log: [], total: 0, first: null, tele: null, boss: null, lastHp: 0, prev: '', hits: 0, resets: 0, phase: [1, 2, 3].includes(phase) ? phase : 1 });

/** hp босса под порог фазы: пороги берутся из описания босса (b.thr = доли здоровья фаз 2 и 3) */
export function hpFor(b: Boss, ph: number): number {
  if (ph <= 1) return b.maxHp;
  return Math.max(1, Math.floor(b.maxHp * ((b['thr'] as number[])[Math.min(ph, 3) - 2] ?? 0.3)));
}
/** выставить фазу без рёва и отталкивания: hp и b.phase напрямую, без phaseShift */
export function applyPhase(sc: World): void {
  const b = sc.testBoss(), tr = sc.train; if (!b || !tr) return;
  b.hp = hpFor(b, tr.phase); b.phase = phaseOf(b);
  for (const o of sc.bosses) { // несколько боссов (дирижёр): фаза старта у каждого; общий пул — одно здоровье
    if (o === b) continue;
    o.hp = condOf(sc)?.pool ? Math.min(o.maxHp, b.hp) : hpFor(o, tr.phase);
    o.phase = phaseOf(o);
  }
  tr.boss = b; tr.lastHp = b.hp; tr.prev = b.state;
}
export function resetBoss(sc: World): void {
  const tr = sc.train; if (!tr || sc.won) return;
  for (const pr of sc.projs) pr.dead = true;
  if (sc.bosses.length) resetFight(sc);
  sc.bossBar(false); respawnLocal(sc);
  applyPhase(sc); tr.log = []; tr.total = 0; tr.first = null; tr.tele = null; tr.resets++;
  if (sc.paused) sc.togglePause();
  sc.toast(`Босс сброшен — фаза ${tr.phase}`, 1.8);
}
export function trainTick(sc: World, dt: number): void {
  const tr = sc.train, b = sc.testBoss(); if (!tr || !b) return;
  tr.t += dt;
  if (tr.boss !== b) { tr.boss = b; tr.lastHp = b.hp; tr.prev = b.state; }
  if (b.hp < tr.lastHp) { const n = tr.lastHp - b.hp; tr.log.push([tr.t, n]); tr.total += n; if (tr.first == null) tr.first = tr.t; }
  tr.lastHp = b.hp;
  while (tr.log.length && tr.log[0]![0] < tr.t - 10) tr.log.shift();
  if (b.state !== tr.prev) {
    const nm = b.state === 'tell' ? currentAttackName(b) : null;
    if (nm) tr.tele = { name: nm, win: b.t, at: tr.t };
    tr.prev = b.state;
  }
}
export function dps(tr: TrainState): number {
  if (tr.first == null) return 0;
  const sum = tr.log.reduce((s, e) => s + e[1], 0), win = Math.min(10, Math.max(1, tr.t - tr.first));
  return sum / win;
}
export function teleText(tr: TrainState): string {
  if (!tr.tele) return 'Последний телеграф: пока не было';
  return `Последний телеграф: ${tr.tele.name} (окно ${tr.tele.win.toFixed(1)} с, ${Math.max(0, tr.t - tr.tele.at).toFixed(0)} с назад)`;
}

// ---------- тренировка боссов на данных: запуск связки и кадровые данные ----------
const KIND_NAME: Record<string, string> = { parry: 'можно отбить', dodge: 'только уворот', unblockable: 'не отбивается' };
const PART_NAME: Record<string, string> = { tell: 'замах', active: 'удар', recover: 'восстановление' };
/** Запустить связку босса на данных по номеру (с нуля, по порядку в файле) прямо сейчас; false — не тот босс или не время. */
export function trainChain(sc: World, n: number): boolean {
  const b = sc.bosses[0]; if (!sc.train || !b || !b['d']) return false;
  const def = bossDef((b['d'] as { id: string }).id); if (!def) return false;
  const c = def.chains[((n % def.chains.length) + def.chains.length) % def.chains.length]!;
  sc.toast(`Связка ${c.id}`, 1.2);
  return forceChain(sc, 0, c.id);
}
/** Строка кадровых данных для оверлея тренировки: «Взмах · замах 12/26 · можно отбить, до удара 14 кадров». */
export function frameLine(sc: World): string | null {
  const b = sc.bosses[0]; const f = b ? frameInfo(b) : null; if (!f) return null;
  const kind = f.kind ? KIND_NAME[f.kind] : 'без урона';
  return `${f.attack} · ${PART_NAME[f.part]} ${f.frame}/${f.total} · ${kind}${f.hitIn !== null && f.hitIn > 0 ? `, до удара ${f.hitIn} кадр.` : ''}${f.punish ? ' · ОКНО НАКАЗАНИЯ' : ''}`;
}
