// Тренировка босс-теста (legacy/src/training.js): старт с выбранной фазы, сброс босса, счётчик урона за 10 с и DPS, «телеграфы» атак.
// Здоровье героя не убывает (см. damage.hurtPlayerTraining); рекорды не пишутся (qolFight выключен).
import { respawnLocal } from './combat';
import { makeMisha } from './misha';
import { makeTima, setRepo } from './tima';
import { makeVladik } from './vladik';
import type { Boss } from './types';
import { phaseOf, type World } from './world';
import { currentAttackName, makeDataBoss } from './boss/exec';

export interface TrainState {
  t: number; log: [number, number][]; total: number; first: number | null; tele: { name: string; win: number; at: number } | null;
  boss: Boss | null; lastHp: number; prev: string; hits: number; resets: number;
  /** фаза старта (1–3) */
  phase: number;
}
export const newTrain = (phase: number): TrainState => ({ t: 0, log: [], total: 0, first: null, tele: null, boss: null, lastHp: 0, prev: '', hits: 0, resets: 0, phase: [1, 2, 3].includes(phase) ? phase : 1 });

/** как называется атака по состоянию босса (только «телеграфы» — замахи и сама атака) */
export const TELE: Record<string, Record<string, string>> = {
  misha: { word: 'Слово из букв', bigWind: 'Большая буква', chargeWind: 'Разбег', dictWind: 'Диктант', rollWind: 'Печатный валик' },
  vladik: { clefWind: 'Скрипичный ключ', leapWind: 'Прыжок', lungeWind: 'Выпад смычком', staffWind: 'Нотный стан', echoWind: 'Эхо-дуэт', smearGo: 'Слизь на шторы' },
  tima: { beerWind: 'Пиво', pad: 'Геймпад', ringWind: 'Красное кольцо', boxWind: 'Приставка', bankWind: 'Банкротство', collWind: 'Коллекторы', lagWind: 'Лаги', achWind: 'Ачивки', drink: 'Пьёт пиво', dustDraw: 'Волшебная пыль' },
};

/** hp босса под порог фазы (фаза 2 — до 60 %, фаза 3 — до 30 %; у Миши вторая половина боя — с 50 %) */
export function hpFor(b: Boss, kind: string, ph: number): number {
  if (ph <= 1) return b.maxHp;
  if (b['thr']) return Math.max(1, Math.floor(b.maxHp * ((b['thr'] as number[])[Math.min(ph, 3) - 2] ?? 0.3))); // босс на данных: порог фазы из его описания
  if (ph === 2) return Math.max(1, Math.floor(b.maxHp * (kind === 'misha' ? 0.5 : 0.58)));
  return Math.max(1, Math.floor(b.maxHp * 0.28));
}
/** выставить фазу без рёва и отталкивания: hp и b.phase напрямую, без phaseShift */
export function applyPhase(sc: World): void {
  const b = sc.testBoss(), tr = sc.train; if (!b || !tr) return;
  b.hp = hpFor(b, sc.bossKind, tr.phase); b.phase = phaseOf(b);
  if (b['tdMarks']) b['tdUsed'] = (b['tdMarks'] as number[]).filter((m) => b.hp <= m); // «вид сверху» у Миши считаем уже пройденным
  tr.boss = b; tr.lastHp = b.hp; tr.prev = b.state;
}
export function resetBoss(sc: World): void {
  const tr = sc.train; if (!tr || sc.won) return;
  for (const pr of sc.projs) pr.dead = true;
  if (sc.td) { sc.td = null; sc.tdFlip = false; sc.emit('td', { on: false }); }
  if (sc.misha) makeMisha(sc);
  if (sc.vladik) makeVladik(sc);
  if (sc.tima) { sc.repoT = 0; setRepo(sc, false); makeTima(sc); }
  sc.bosses.forEach((b, i) => makeDataBoss(sc, (b['d'] as { id: string }).id, i));
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
    const nm = b['d'] ? (b.state === 'tell' ? currentAttackName(b) : null) : TELE[sc.bossKind]?.[b.state];
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
