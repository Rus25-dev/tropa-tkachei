// «Записывать мои бои»: по окончании боя или забега скачивается файл .ttrec (формат — docs/TTREC.md).
// Включается настройкой «Записывать мои бои» (Настройки → Игра) или параметром ?rec=1. Файл только скачивается на устройство:
// ничего не отправляется в сеть. Запись ведёт core/recording.ts поверх обычной сессии, игровое поведение она не меняет.
import { CHAPTERS, SR_CATS } from '../core/balance';
import type { Journal } from '../core/journal';
import { outcome } from '../core/journal';
import { SessionRecorder, type RecordedRun } from '../core/recording';
import type { Session } from '../core/session';
import { makeTtrec, stringifyTtrec } from '../core/ttrec';
import type { World } from '../core/world';
import { settings } from './store';

/** короче этого запись не сохраняем (случайный вход и выход) — 5 секунд */
const MIN_TICKS = 300;

export const recWanted = (): boolean => settings.s.rec || new URLSearchParams(location.search).get('rec') === '1';

interface Handle { flush(): void }
const handles = new WeakMap<Session, Handle>();

const BOSS_NAMES: Record<string, string> = { misha: 'Миша', vladik: 'Владик', tima: 'Тима', korne: 'Корнематка' };
function describe(w: World, ses: Session): { label: string; slug: string; boss: string | null } {
  if (ses.sr) { const c = SR_CATS[ses.sr.cat]; return { label: c.name, slug: 'zabeg-' + ses.sr.cat, boss: null }; }
  if (w.mode === 'bosstest') return { label: `Босс-тест · ${BOSS_NAMES[w.bossKind] ?? w.bossKind}`, slug: w.bossKind, boss: w.bossKind };
  const ch = CHAPTERS[w.camp ? w.camp.ch : 1];
  return { label: `Глава ${ch?.roman ?? 'I'} · ${w.camp?.st === 'road' ? 'коридор' : w.camp?.st === 'arena' ? 'арена' : 'уровень'}`, slug: 'glava' + (w.camp ? w.camp.ch : 1), boss: ch?.boss ?? null };
}

/** Скачивает текст как файл. Блокировка скачивания или приватный режим не должны ронять игру. */
export function downloadText(name: string, text: string): void {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch { /* скачивание недоступно */ }
}

const stamp = (): string => { const d = new Date(), p = (n: number): string => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

/** Подключает запись к сессии. Вызывать после того, как приложение повесило свои обработчики событий. */
export function attachRecording(ses: Session, version: string): void {
  if (ses.world.train) return; // тренировка в журнал не входит
  const saved = new WeakSet<Journal>();
  const fought = new WeakSet<Journal>();

  const save = (run: RecordedRun, w: World): void => {
    if (saved.has(run.journal) || run.journal.segs.reduce((n, g) => n + g.n, 0) < MIN_TICKS) return;
    saved.add(run.journal);
    const d = describe(w, ses);
    const t = makeTtrec(run.journal, {
      ver: version,
      meta: { kind: 'player', label: d.label + (w.nPlayers === 2 ? ' · вдвоём' : ''), boss: d.boss, created: new Date().toISOString() },
      setup: { easy: ses.cfg.easy, loadout: ses.cfg.loadoutSave, progress: run.progress },
      expect: JSON.parse(JSON.stringify(outcome(w))) as Record<string, unknown>,
    });
    downloadText(`tt-${d.slug}-${stamp()}.ttrec`, stringifyTtrec(t));
  };

  const recorder = new SessionRecorder(ses, {
    ver: version, easy: ses.cfg.easy,
    // сцена закончилась («Дальше», «Заново», переход): бой, который в ней был, сохраняем
    onRotate: (run) => { if (fought.has(run.journal)) save(run, ses.world); },
  });
  const cur = (): RecordedRun => ({ journal: recorder.journal, progress: recorder.progress });
  const on = (k: string, f: () => void): void => { (ses.on[k] ??= []).push(f); };
  on('fightStart', () => fought.add(recorder.journal));
  on('fightWin', () => { fought.add(recorder.journal); save(cur(), ses.world); });
  on('srFinish', () => { fought.add(recorder.journal); save(cur(), ses.world); });
  handles.set(ses, { flush: () => { if (fought.has(recorder.journal)) save(cur(), ses.world); } });
}

/** Выход из партии (меню): сохраняет незавершённый бой, если запись включена */
export function flushRecording(ses: Session | null): void { if (ses) handles.get(ses)?.flush(); }
