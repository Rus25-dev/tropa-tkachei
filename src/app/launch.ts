// Запуск партии: собирает сессию ядра из настроек и хранилища и подключает сохранение, рекорды и награды.
import { resumeCamp, freshCamp, type CampState } from '../core/campaign';
import { Session, type SceneData } from '../core/session';
import { attachRecording, recWanted } from './record';
import type { Journal } from '../core/journal';
import type { RunOpts, SrRun, Split } from '../core/speedrun';
import type { World } from '../core/world';
import { journalStore, loadout, progress, records, settings, sr as srStore } from './store';

export type GameKind = 'story' | 'bosstest' | 'trail' | 'boss';
export interface LaunchParams {
  kind: GameKind;
  /** босс-теста */
  boss?: string;
  players?: number;
  /** начать главу заново, а не продолжить */
  fresh?: boolean;
  /** общее зерно (гонка, воспроизведение) */
  seed?: number;
  camp?: CampState | null;
  /** тренировка босс-теста */
  train?: boolean;
  trainPhase?: number;
  /** игра вдвоём по сети: роль этой вкладки */
  online?: 'host' | 'guest';
  /** забег «Гонок Ткачей» (комната, место, номер гонки, имя): герой стоит до команды «пошёл», ведётся журнал для восстановления */
  rc?: RcInfo;
  /** гонка 1×1 по сети: герой стоит до «пошёл», журнал не пишется */
  race?: boolean;
  /** забег продолжается после воспроизведения журнала (восстановление после падения вкладки) */
  resumed?: { J: Journal; world: World; sr: SrRun | null };
}
export interface RcInfo { code: string; seat: number; id: string; name: string }

export const newSeed = (): number => (Math.random() * 4294967296) >>> 0;

export function createSession(p: LaunchParams, version: string): Session {
  const seed = (p.seed ?? newSeed()) >>> 0;
  const players = p.online ? 2 : (p.players ?? 1);
  const cfg = { easy: settings.s.easy && p.kind !== 'trail' && p.kind !== 'boss', loadoutSave: loadout.get(), progress: p.kind === 'story' && !p.fresh && p.online !== 'guest' ? progress.get() : null, online: p.online ?? null, ver: version, clock: () => performance.now(), fx: true, wall: () => Date.now() };
  let first: SceneData;
  let run: { cat: 'trail' | 'boss'; opt?: RunOpts } | undefined;
  if (p.kind === 'bosstest') first = { seed, mode: 'bosstest', boss: p.boss ?? 'misha', players, camp: null, train: !!p.train, trainPhase: p.trainPhase ?? 1 };
  else if (p.kind === 'trail' || p.kind === 'boss') { first = { seed, mode: 'story', players: 1, camp: null }; run = { cat: p.kind, opt: p.rc ? { rc: p.rc } : p.race ? { race: {} } : undefined }; }
  else first = { seed, mode: 'story', players, camp: p.camp ?? (p.fresh ? freshCamp() : resumeCamp(cfg.progress)) };
  const s = p.resumed ? new Session(cfg, null, undefined, p.resumed) : new Session(cfg, first, run);
  // хранилище
  s.on['save'] = [(e) => progress.set(e['progress'] as never)];
  s.on['bossReward'] = [(e, ses) => { const got = loadout.onBoss(e['id'] as string); if (got.length) ses.world.toast('Получено: ' + got.join(', ') + ' — выбрать на скамье', 5); }];
  s.on['fightStart'] = [(e) => { const id = e['id'] as string, r = records.get(id); r.tries++; records.put(id, r); }];
  s.on['fightWin'] = [(e, ses) => {
    const id = e['id'] as string, t = e['t'] as number, r = records.get(id);
    r.wins++; const rec = !r.best || t < r.best; if (rec) r.best = t; records.put(id, r);
    ses.world.toast(`Босс повержен за ${fmtMin(t)}` + (rec ? ' — новый рекорд!' : ` (лучшее ${fmtMin(r.best)})`), 4);
  }];
  // лучшие сегменты (личные рекорды по отрезкам), как в v1.8: onSplit
  s.on['srSplit'] = [(e, ses) => {
    const r = ses.sr; if (!r || r.taint) return;
    const i = e['i'] as number, sp = e['split'] as Split, rec = srStore.rec(r.cat), prev = i ? r.splits[i - 1]!.rta : 0, seg = sp.rta - prev;
    if (!rec.seg[i] || seg < rec.seg[i]!) { rec.seg[i] = seg; srStore.putRec(r.cat, rec); }
  }];
  // одиночный забег стартует с первого движения: от этого настенного времени считается RTA при восстановлении
  s.on['srStart'] = [(_e, ses) => { const J = ses.rec?.J; if (J && J.wallT0 == null) { J.wallT0 = Date.now(); ses.rec!.dirty = true; } }];
  s.on['srFinish'] = [(e, ses) => {
    const res = e['result'] as { cat: string; rta: number; igt: number; deaths: number; splits: { rta: number; igt: number }[]; taint: string | null; newPb: boolean; pbPrev: unknown };
    const rec = srStore.rec(res.cat); res.pbPrev = rec.pb ? JSON.parse(JSON.stringify(rec.pb)) : null;
    if (!res.taint && (!rec.pb || res.rta < rec.pb.rta)) { res.newPb = true; rec.pb = { rta: res.rta, igt: res.igt, deaths: res.deaths, splits: res.splits, ver: version, date: Date.now() }; srStore.putRec(res.cat, rec); }
    journalStore.clear();
    void ses;
  }];
  // «Записывать мои бои» / ?rec=1: после всех обработчиков выше. Сетевая игра и «Гонки Ткачей» ведут свой журнал: их не трогаем
  if (recWanted() && !p.online && !p.race && !p.rc && !p.resumed) attachRecording(s, version);
  return s;
}
const fmtMin = (s: number): string => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
