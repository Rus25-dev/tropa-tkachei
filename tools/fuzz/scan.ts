// Воспроизведение журнала под наблюдением инвариантов: так проверяется запись (находка фаззера, регрессионный тест, минимизатор).
import type { Journal } from '../../src/core/journal';
import { replayJournal, type ReplayOpts } from '../../src/core/replay';
import type { World } from '../../src/core/world';
import { Monitor, type Finding } from './invariants';

/** ввод двигал героя в этом тике (по raw первого игрока и второго) */
export const movedNow = (w: World): boolean => w.players.some((p) => { const r = p.raw; return !!(r.left || r.right || r.jump); });

/** первая строка сообщения об ошибке (без номеров), для сравнения «тот же сбой» */
export const errKey = (e: unknown): string => String((e as Error)?.message ?? e).split('\n')[0]!.replace(/[-\d.]+/g, '#').slice(0, 160);

/** Проигрывает журнал и возвращает первое нарушение (или null). Проверка совпадения контрольных хэшей — внутри replayJournal. */
export function scanJournal(J: Journal, opt: ReplayOpts = {}, stopAt?: number): Finding | null {
  const mon = new Monitor();
  let found: Finding | null = null, n = 0;
  class Stop extends Error {}
  try {
    const r = replayJournal(J, { ...opt, onTick: (w) => {
      n++;
      const f = mon.check(w, movedNow(w));
      if (f) { found = f; throw new Stop(); }
      if (stopAt != null && n >= stopAt) throw new Stop();
    } });
    if (!r.ok) return { invariant: 'replay', message: r.why, tick: n };
  } catch (e) {
    if (e instanceof Stop) return found;
    return { invariant: 'exception', message: errKey(e), tick: n };
  }
  return found;
}
