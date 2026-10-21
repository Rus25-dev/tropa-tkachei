// «Гонки Ткачей»: общие типы и мелочи для организатора, игрока и обсервера (legacy/src/race-org.js, race-play.js, race-watch.js).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ClientQueue } from './client';
import type { HubState } from './hub';

export type Phase = 'lobby' | 'prep' | 'count' | 'run' | 'done';
export const norm = (n: string): string => String(n || '').toLowerCase().replace(/\s+/g, '');

export interface DiscDef { name: string; ready: boolean; note?: string; /** правила для организатора и игроков */ rules?: string }
/** дисциплины: готовы «Тропа целиком» и «Босс-раш» (дуэль ткачей — в версии 2.4 по docs/V2_PROMPT.md) */
export const DISC: Record<string, DiscDef> = {
  trail: { name: 'Тропа целиком', ready: true, rules: 'Главы I–IV подряд с нуля. Лавка и бусины разрешены, возрождение на скамье. Сплит — на смерти босса каждой главы.' },
  boss: { name: 'Босс-раш', ready: true, rules: 'Четыре босса подряд: Корнематка, Миша, Владик, Тима. Все способности открыты, лавки нет. Сплит — на смерти каждого босса.' },
  duel: { name: 'Дуэль ткачей', ready: false, note: 'в версии 2.4' },
};

export interface Fin { rta: number; igt: number; deaths: number; splits: { rta: number; igt: number }[]; stats: Record<string, any> | null; restored: number }
/** подсплит игрока: глава, вид (exit / bench / fight / ph2 / ph3 / kill) и время забега (RTA, мс) на его часах */
export interface PSub { ch: number; k: string; rta: number }
/** итог боя с одним боссом (босс-раш и главы «Тропы»): урон боссу, отбивы, полученный урон, оглушения, казни, смерти и время боя (мс) */
export interface BossRow { ch: number; dmg: number; parries: number; taken: number; stuns: number; execs: number; deaths: number; fight: number }
/** личный рекорд игрока в дисциплине по архиву: лучший финиш (t, sp — сплиты, sb — подсплиты «глава:вид» → мс) и лучшие отрезки по главам/боссам (bs) */
export interface Pb { t: number; sp: number[]; sb: Record<string, number>; bs: (number | null)[] }
export interface OrgSeat {
  id: number; key: string; role: 'play' | 'watch'; name: string; ready: boolean; loaded: boolean; online: boolean;
  fin: Fin | null; dnf: boolean; dnfAt?: number; splits: number[]; viol: string[]; restored: number; rtt: number | null; tel: Record<string, any> | null;
  /** подсплиты, смерти с потерянным временем, покупки и личный рекорд (необязательны: состояние комнаты из прежних версий читается) */
  subs?: PSub[]; lost?: number; deathList?: { ch: number; rta: number; lost: number | null }[]; buys?: { id: string; name: string; ch: number; rta: number; price: number }[]; pb?: Pb | null;
  /** бои с боссами по главам (2.3) */
  bosses?: BossRow[];
}
export interface RaceEvent { n: number; t: number | null; k: string; s: number | null; x: string; [extra: string]: any }
export interface ResultRow {
  seat: number; name: string; dnf: boolean; time: number | null; finalTime: number | null; igt: number | null; deaths: number | null; stats: Record<string, any> | null;
  splits: number[]; eloBefore: number | null; eloAfter: number | null; place: number;
  /** необязательные поля 2.2: подсплиты, потерянное время на смертях, покупки, лучшие отрезки на момент гонки */
  subs?: PSub[]; lost?: number; deathList?: { ch: number; rta: number; lost: number | null }[]; buys?: { id: string; name: string; ch: number; rta: number; price: number }[];
  bosses?: BossRow[];
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
  subs?: PSub[]; lost?: number; deaths?: number; buys?: number; pb?: Pb | null; bosses?: BossRow[];
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
