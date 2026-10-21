// Запуск партии: собирает сессию ядра из настроек и хранилища и подключает сохранение, рекорды и награды.
import { resumeCamp, freshCamp, type CampState } from '../core/campaign';
import { Session, type SceneData } from '../core/session';
import { attachRecording, recWanted } from './record';
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
}

export const newSeed = (): number => (Math.random() * 4294967296) >>> 0;

export function createSession(p: LaunchParams, version: string): Session {
  const seed = (p.seed ?? newSeed()) >>> 0;
  const players = p.players ?? 1;
  const cfg = { easy: settings.s.easy && p.kind !== 'trail' && p.kind !== 'boss', loadoutSave: loadout.get(), progress: p.kind === 'story' && !p.fresh ? progress.get() : null, ver: version, clock: () => performance.now(), fx: true };
  let first: SceneData;
  let run: { cat: 'trail' | 'boss' } | undefined;
  if (p.kind === 'bosstest') first = { seed, mode: 'bosstest', boss: p.boss ?? 'misha', players, camp: null, train: !!p.train, trainPhase: p.trainPhase ?? 1 };
  else if (p.kind === 'trail' || p.kind === 'boss') { first = { seed, mode: 'story', players: 1, camp: null }; run = { cat: p.kind }; }
  else first = { seed, mode: 'story', players, camp: p.camp ?? (p.fresh ? freshCamp() : resumeCamp(cfg.progress)) };
  const s = new Session(cfg, first, run);
  // хранилище
  s.on['save'] = [(e) => progress.set(e['progress'] as never)];
  s.on['bossReward'] = [(e, ses) => { const got = loadout.onBoss(e['id'] as string); if (got.length) ses.world.toast('Получено: ' + got.join(', ') + ' — выбрать на скамье', 5); }];
  s.on['fightStart'] = [(e) => { const id = e['id'] as string, r = records.get(id); r.tries++; records.put(id, r); }];
  s.on['fightWin'] = [(e, ses) => {
    const id = e['id'] as string, t = e['t'] as number, r = records.get(id);
    r.wins++; const rec = !r.best || t < r.best; if (rec) r.best = t; records.put(id, r);
    ses.world.toast(`Босс повержен за ${fmtMin(t)}` + (rec ? ' — новый рекорд!' : ` (лучшее ${fmtMin(r.best)})`), 4);
  }];
  s.on['srFinish'] = [(e, ses) => {
    const res = e['result'] as { cat: string; rta: number; igt: number; deaths: number; splits: { rta: number; igt: number }[]; taint: string | null; newPb: boolean; pbPrev: unknown };
    const rec = srStore.rec(res.cat); res.pbPrev = rec.pb ? JSON.parse(JSON.stringify(rec.pb)) : null;
    if (!res.taint && (!rec.pb || res.rta < rec.pb.rta)) { res.newPb = true; rec.pb = { rta: res.rta, igt: res.igt, deaths: res.deaths, splits: res.splits, ver: version, date: Date.now() }; srStore.putRec(res.cat, rec); }
    journalStore.clear();
    void ses;
  }];
  if (recWanted()) attachRecording(s, version); // «Записывать мои бои» / ?rec=1: после всех обработчиков выше
  return s;
}
const fmtMin = (s: number): string => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
