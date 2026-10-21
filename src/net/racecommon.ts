// «Гонки Ткачей»: общие типы и мелочи для организатора, игрока и обсервера (legacy/src/race-org.js, race-play.js, race-watch.js).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ClientQueue } from './client';
import type { HubState } from './hub';

export type Phase = 'lobby' | 'prep' | 'count' | 'run' | 'done';
export const norm = (n: string): string => String(n || '').toLowerCase().replace(/\s+/g, '');

export interface DiscDef { name: string; ready: boolean; note?: string }
/** дисциплины: пока готова одна — «Тропа целиком» (остальные в версиях 2.3 и 2.4 по docs/V2_PROMPT.md) */
export const DISC: Record<string, DiscDef> = {
  trail: { name: 'Тропа целиком', ready: true },
  boss: { name: 'Босс-раш', ready: false, note: 'в версии 2.3' },
  duel: { name: 'Дуэль ткачей', ready: false, note: 'в версии 2.4' },
};

export interface Fin { rta: number; igt: number; deaths: number; splits: { rta: number; igt: number }[]; stats: Record<string, any> | null; restored: number }
export interface OrgSeat {
  id: number; key: string; role: 'play' | 'watch'; name: string; ready: boolean; loaded: boolean; online: boolean;
  fin: Fin | null; dnf: boolean; dnfAt?: number; splits: number[]; viol: string[]; restored: number; rtt: number | null; tel: Record<string, any> | null;
}
export interface RaceEvent { n: number; t: number | null; k: string; s: number | null; x: string; [extra: string]: any }
export interface ResultRow {
  seat: number; name: string; dnf: boolean; time: number | null; finalTime: number | null; igt: number | null; deaths: number | null; stats: Record<string, any> | null;
  splits: number[]; eloBefore: number | null; eloAfter: number | null; place: number;
}
/** запись архива гонок (формат races.json) */
export interface RaceResult {
  id: string; date: string; version: string; discipline: string; settings: { cat: string; easy: boolean; speed: number }; seed: number; players: ResultRow[];
  winner: string | null; winnerSeat: number | 'draw' | null; awarded: boolean; gap: number | null; goAt: number | null; pauseMs: number; events: RaceEvent[];
}
export type OrgAct = { k: 'pause'; on: boolean } | { k: 'award'; seat: number; from: Phase };
export interface OrgState {
  v: 1; code: string; id: string; created: number; phase: Phase; disc: string; seed: number; seats: Record<number, OrgSeat>; goAt: number | null;
  pause: { on: boolean; since: number | null; total: number }; winner: number | 'draw' | null; awarded: boolean; events: RaceEvent[]; acts: OrgAct[];
  result: RaceResult | null; ver: string; prepAt: number | null; note?: string;
}
/** то, что организатор пишет в хранилище (tt_rc_org): состояние гонки и журнал канала */
export interface OrgStored { S: OrgState; hub: HubState | null; at: number }
export interface RaceStore {
  loadOrg(): OrgStored | null;
  saveOrg(o: OrgStored): void;
  clearOrg(): void;
  archive(): RaceResult[];
  saveArchive(a: RaceResult[]): void;
}

/** сеанс игрока (tt_rc_play): код, имя и очередь событий переживают перезагрузку вкладки */
export interface PlaySess extends ClientQueue { code: string; name: string; id: string | null }
export interface PlayStore { loadSess(): PlaySess | null; saveSess(s: PlaySess): void; clearSess(): void }

/** снимок комнаты, который организатор отдаёт игроку и обсерверу */
export interface RoomPlayer {
  seat: number; name: string; ready: boolean; loaded: boolean; online: boolean; rtt: number | null; fin: { rta: number; igt: number; deaths: number } | null; dnf: boolean;
  sp: number; splits: number[]; restored: number;
}
export interface RoomState {
  v: 1; id: string; code: string; phase: Phase; disc: string; discName: string; goAt: number | null; ver: string; now: number;
  pause: { on: boolean; total: number; since: number | null }; winner: number | 'draw' | null; awarded: boolean; watchers: number; players: RoomPlayer[];
  seat?: number; tel?: Record<number, any>; log?: RaceEvent[]; result?: RaceResult | null; stats?: Record<number, any>;
}

/** формат races.json: архив гонок одним файлом */
export function racesJson(races: RaceResult[], gameVersion: string, exportedIso: string): string {
  return JSON.stringify({ format: 'tropa-tkachei/races', version: 1, game: gameVersion, exported: exportedIso, races }, null, 1);
}
/** слить двух «игроков» архива в одного (имена записаны по-разному); возвращает число изменённых записей */
export function mergeNames(arr: RaceResult[], from: string, to: string): number {
  let n = 0;
  for (const r of arr) for (const p of r.players) if (p.name === from) { p.name = to; n++; }
  for (const r of arr) if (r.winner === from) r.winner = to;
  return n;
}
