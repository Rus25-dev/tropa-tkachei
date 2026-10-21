// Журнал ввода забега в браузере (legacy/src/journal.js): запись в tt_jr раз в ~2 с и при уходе со страницы, сведения о нём (info), восстановление.
// Запись ввода по тикам ведёт Recorder в core/session.ts; здесь он только сохраняется и воспроизводится ядром (core/replay.ts) с продолжением живой игры.
// Формат tt_jr — как в v1.8. Общий модуль для одиночного спидрана и гонок: у забега гонки в журнале лежит комната (race).
import type { Journal } from '../core/journal';
import { replaySteps } from '../core/replay';
import type { Session } from '../core/session';
import type { LaunchParams } from './launch';
import { journalStore } from './store';

export interface JInfo { j: Journal; ok: boolean; why: string; ticks: number; sec: number; cat: Journal['cat']; race: { code: string; id: string } | null; down: number }

/** Можно ли восстановить: есть журнал, версия та же, забег не закончен */
export function info(version: string): JInfo | null {
  const j = journalStore.get<Journal>(); if (!j || j.v !== 1 || !Array.isArray(j.segs)) return null;
  const ticks = j.segs.reduce((s, g) => s + g.n, 0);
  return { j, ok: j.ver === version && ticks > 0, why: j.ver !== version ? `журнал от версии ${j.ver}, у вас ${version}` : '', ticks, sec: Math.round(ticks / 60), cat: j.cat, race: (j.race as { code: string; id: string } | null) ?? null, down: Math.max(0, Date.now() - (j.wallSave || Date.now())) };
}
export const clear = (): void => journalStore.clear();

let lastSave = 0;
/** Сохранить журнал сессии (не чаще раза в 2 с; force — сразу). Не пишет гонку 1×1, запись в памяти и законченный забег. */
export function pulse(ses: Session | null, force = false): void {
  const rec = ses?.rec, r = ses?.sr; if (!rec || !r || r.race || rec.J.mem || r.done) return;
  const now = performance.now(); if (!rec.dirty && !force) return; if (!force && now - lastSave < 2000) return;
  lastSave = now; rec.dirty = false; rec.J.wallSave = Date.now(); journalStore.set(rec.J);
}
/** Подключить сохранение: опрос текущей сессии и запись при сворачивании и закрытии вкладки */
export function install(current: () => Session | null): void {
  setInterval(() => pulse(current()), 500);
  for (const ev of ['pagehide', 'beforeunload']) window.addEventListener(ev, () => pulse(current(), true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pulse(current(), true); });
}

export interface RestoreOpts {
  version: string;
  start(p: LaunchParams): Session;
  /** процент воспроизведения (null — закончили) */
  progress(pct: number | null): void;
  onDone(ses: Session): void;
  onFail(why: string): void;
}
/** Воспроизвести журнал кусками (страница не зависает), затем продолжить игру в том же состоянии. Расхождение контрольных хэшей — отказ. */
export function restore(o: RestoreOpts): boolean {
  const inf = info(o.version); if (!inf || !inf.ok) return false;
  const J = inf.j;
  J.restored = ((J.restored ?? 0) | 0) + 1; J.downMs = ((J.downMs ?? 0) | 0) + inf.down;
  o.progress(0);
  const gen = replaySteps(J, { ver: J.ver, clock: () => performance.now() }, 600), total = Math.max(1, inf.ticks);
  const fail = (why: string): void => { clear(); o.progress(null); o.onFail(why); };
  const step = (): void => {
    try {
      const t0 = performance.now();
      for (;;) {
        const n = gen.next();
        if (n.done) {
          const res = n.value; if (!res.ok) { fail(res.why); return; }
          const ses = o.start({ kind: J.cat ?? 'trail', resumed: { J, world: res.world, sr: res.sr } }), sr = ses.sr;
          if (sr) {
            // часы забега: простой идёт в зачёт, поэтому старт считаем от настенного времени; технические паузы организатора — нет
            const nowP = performance.now(), nowW = Date.now();
            if (J.wallT0 != null) sr.t0 = nowP - (nowW - J.wallT0);
            sr.restored = (J.restored ?? 0) | 0; sr.downMs = (J.downMs ?? 0) | 0;
            sr.pausedMs = 0; sr.tp = null;
            for (const [a, b] of J.pauses || []) { if (b != null) sr.pausedMs += b - a; else sr.tp = nowP - (nowW - a); }
          }
          if (ses.rec) ses.rec.dirty = true;
          pulse(ses, true);
          o.progress(null);
          // одиночный забег игрок продолжает сам: ставим на паузу; в гонке паузы нет — время идёт
          if (!sr?.rc && !ses.world.paused && !ses.world.won) ses.togglePause();
          ses.world.toast(sr?.rc ? 'Забег восстановлен: время простоя идёт в зачёт' : 'Забег восстановлен. Время простоя идёт в зачёт. Продолжить — в меню паузы.', 6);
          o.onDone(ses); return;
        }
        if (performance.now() - t0 > 30) { o.progress(Math.min(99, Math.round(100 * n.value / total))); setTimeout(step, 0); return; }
      }
    } catch (e) { fail(String((e as Error)?.message ?? e)); }
  };
  setTimeout(step, 40);
  return true;
}
