// «Дуэль ткачей»: модификаторы раунда. Это параметры забега (SrRun.duel), а не изменения ядра: без модификаторов механика не меняется,
// а золотые записи v1.8 идут бит в бит. Каждый модификатор применяется в одном известном месте:
//   onemask — у героя одна маска (maxHp = hp = 1), ставится при создании сцены (duelSetup);
//   noheal  — лечение нитью выключено (player.ts спрашивает duelNoHeal), нажатие уходит в отбив, как при полной шкале;
//   mirror  — ввод зеркален по горизонтали до записи в журнал (mirrorFrames, Session.frame), поэтому журнал и восстановление честны; экран зеркалит вид;
//   blitz   — время идёт на 20 % быстрее: сессия кормит часы тиков множителем (duelSpeed), сами тики остаются по 1/60 с.
// Без Math.random, Date, таймеров и DOM: случайный модификатор выбирается из зерна комнаты (duel.ts).
import { emptyFrame, type InputFrame } from './input';
import type { World } from './world';

export type DuelMod = 'onemask' | 'noheal' | 'mirror' | 'blitz';
export const DUEL_MODS: readonly DuelMod[] = ['onemask', 'noheal', 'mirror', 'blitz'];
export const MOD_INFO: Record<DuelMod, { name: string; note: string }> = {
  onemask: { name: 'Одна маска', note: 'у героя всего одна маска: любой удар обрывает нить' },
  noheal: { name: 'Без лечения', note: 'лечиться нитью нельзя' },
  mirror: { name: 'Зеркало', note: 'управление и экран зеркальны по горизонтали' },
  blitz: { name: 'Блиц +20 %', note: 'игра идёт на 20 % быстрее' },
};
/** во сколько раз блиц ускоряет часы игры */
export const BLITZ_K = 1.2;

/** параметры дуэльного раунда в забеге: какой босс (номер главы 1–4) и какие модификаторы */
export interface DuelRun { ch: number; mods: DuelMod[] }
export const isMod = (x: unknown): x is DuelMod => typeof x === 'string' && (DUEL_MODS as readonly string[]).includes(x);
/** порядок модификаторов всегда один (для записи, сравнения и показа) */
export function cleanMods(mods: readonly unknown[] | null | undefined): DuelMod[] {
  const set = new Set((mods ?? []).filter(isMod));
  return DUEL_MODS.filter((m) => set.has(m));
}
export const modsText = (mods: readonly DuelMod[]): string => (mods.length ? mods.map((m) => MOD_INFO[m].name).join(' + ') : 'без модификаторов');

/** ввод, зеркальный по горизонтали (влево ↔ вправо); остальное не меняется. Возвращает новый кадр */
export function mirrorFrame(f: InputFrame): InputFrame {
  const o = emptyFrame();
  Object.assign(o.buttons, f.buttons); Object.assign(o.edges, f.edges);
  o.buttons.left = f.buttons.right; o.buttons.right = f.buttons.left;
  return o;
}
/** кадры ввода под модификаторы раунда: без «зеркала» возвращаются те же объекты */
export function duelInputs(d: DuelRun | null | undefined, frames: InputFrame[]): InputFrame[] {
  return d && d.mods.includes('mirror') ? frames.map((f) => (f ? mirrorFrame(f) : f)) : frames;
}
/** множитель скорости часов игры (1 — обычная) */
export const duelSpeed = (d: DuelRun | null | undefined): number => (d && d.mods.includes('blitz') ? BLITZ_K : 1);
/** лечение запрещено? (player.ts) */
export const duelNoHeal = (sc: World): boolean => !!sc.sr?.duel && sc.sr.duel.mods.includes('noheal');
/** конец создания сцены: «Одна маска» */
export function duelSetup(sc: World): void {
  const d = sc.sr?.duel; if (!d) return;
  if (d.mods.includes('onemask')) for (const p of sc.players) { p.maxHp = 1; p.hp = 1; }
}
