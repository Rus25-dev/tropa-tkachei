// «Гонки Ткачей»: обсервер (legacy/src/race-watch.js), сетевая часть. Подключается как зритель (роль watch) к тому же надёжному каналу:
// получает состояние комнаты, ленту событий и телеметрию игроков пачками. В игре обсервера нет — картинка рисуется по телеметрии
// (view/scenes/WatchScene.ts), табло — HTML (ui/races.tsx). Обсервер не засыпает в скрытом окне: состояние обновляется сообщениями, а не кадрами.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { SR_CATS } from '../core/balance';
import { Client } from './client';
import type { RaceEvent, RaceResult, RoomPlayer, RoomState } from './racecommon';
import { cleanCode, defaultEnv, type Env, type Msg, type Transport } from './types';

export interface TelPoint { at: number; [k: string]: any }
export interface WatchOpts { transport: Transport; env?: Env; version: string; key: string }
const TAGS = SR_CATS.trail.tags;

export class RaceWatch {
  code = ''; S: RoomState | null = null; client: Client | null = null; connStatus = 'idle'; denied: string | undefined;
  feed: RaceEvent[] = []; tel: Record<number, TelPoint> = {}; hist: Record<number, TelPoint[]> = {}; stats: Record<number, any> = {};
  result: RaceResult | null = null; resultLite: any = null; cd: { n: number; at: number } | null = null; recvAt = 0;
  private env: Env; private subs = new Set<() => void>();
  constructor(private o: WatchOpts) { this.env = o.env ?? defaultEnv(); }
  subscribe(f: () => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
  changed(): void { for (const f of [...this.subs]) f(); }

  /** вернуть текст ошибки или null, если подключение началось */
  join(codeIn: string): string | null {
    const code = cleanCode(codeIn); if (code.length < 4) return 'Введите код комнаты.';
    if (this.client) this.client.stop(true);
    this.feed = []; this.tel = {}; this.hist = {}; this.S = null; this.stats = {}; this.result = null; this.resultLite = null; this.denied = undefined; this.code = code; this.connStatus = 'connecting';
    this.client = new Client({
      code, ns: 'race', key: this.o.key, role: 'watch', name: 'Обсервер', transport: this.o.transport, env: this.env, hello: () => ({ ver: this.o.version, room: code }),
      onWelcome: (w) => this.onWelcome(w), onMsg: (m) => this.onMsg(m), onTel: (t) => this.onTel(t), onStatus: (s, i) => this.onStatus(s, i),
    });
    this.client.start(); this.changed();
    return null;
  }
  leave(): void { if (this.client) this.client.stop(true); this.client = null; this.S = null; this.connStatus = 'idle'; this.changed(); }
  bye(): void { this.client?.bye(); }

  private onStatus(s: string, info: unknown): void {
    this.connStatus = s; if (s === 'denied') this.denied = (info as { why?: string } | undefined)?.why;
    this.changed();
  }
  private onWelcome(w: Msg): void {
    const S = this.S = w['snap'] as RoomState; this.recvAt = this.env.now();
    this.tel = {}; for (const id in (S.tel || {})) this.tel[Number(id)] = { ...S.tel![Number(id)], at: this.env.now() };
    if (w['resync'] || !this.feed.length) this.feed = (S.log || []).slice(-60);
    this.stats = S.stats || {}; this.result = S.result || null; this.changed();
  }
  private onMsg(m: any): void {
    if (!m || !this.S) return;
    switch (m.k) {
      case 'state': {
        const p = this.S; this.S = { ...p, ...m.s, tel: p.tel, log: p.log, result: p.result }; this.recvAt = this.env.now();
        if (m.s.phase === 'lobby') { this.result = null; this.stats = {}; this.tel = {}; this.hist = {}; }
        break;
      }
      case 'ev': this.addEv(m.e); break;
      case 'cd': this.cd = { n: m.n, at: this.env.now() }; break;
      case 'go': this.cd = { n: 0, at: this.env.now() }; break;
      case 'res': this.resultLite = m.r; break;
      case 'reset': this.result = null; this.stats = {}; this.resultLite = null; break;
    }
    this.changed();
  }
  private onTel(t: any): void {
    const now = this.env.now();
    for (const o of (t && t.tl) || []) {
      this.tel[o.s] = { ...o, at: now };
      const h = this.hist[o.s] || (this.hist[o.s] = []); h.push({ ...o, at: now }); while (h.length && now - h[0]!.at > 10000) h.shift();
    }
  }
  private addEv(e: RaceEvent): void { if (!e || (this.feed.length && this.feed[this.feed.length - 1]!.n >= e.n && e.n)) return; this.feed.push(e); if (this.feed.length > 200) this.feed.shift(); }

  // ----- вычисления для табло -----
  /** время на табло: по часам организатора (не зависит от кадров и скрытого окна) */
  clockMs(): number {
    const S = this.S; if (!S || !S.goAt) return 0;
    if (S.phase === 'done') { const rs = (S.result || this.resultLite || {}).players as { dnf: boolean; time: number }[] | undefined; const best = rs && rs.filter((p) => !p.dnf).map((p) => p.time); if (best && best.length) return Math.max(...best); }
    const orgNow = S.now + (this.env.now() - (this.recvAt || this.env.now())), pausedNow = S.pause.on && S.pause.since ? orgNow - S.pause.since : 0;
    return Math.max(0, orgNow - S.goAt - ((S.pause && S.pause.total) || 0) - pausedNow);
  }
  /** разница: пока оба в одном отрезке — по сплитам; иначе лидер по отрезкам */
  lead(): { ms: number; txt: string } | null {
    const S = this.S, ps = (S && S.players) || [], p1: RoomPlayer | undefined = ps[0], p2: RoomPlayer | undefined = ps[1];
    if (!S || !p1 || !p2 || !p1.splits || !p2.splits || S.phase === 'lobby') return null;
    const t1 = this.tel[p1.seat], t2 = this.tel[p2.seat], now = this.env.now();
    const a = p1.splits.filter((x) => x != null), b = p2.splits.filter((x) => x != null), n = Math.min(a.length, b.length);
    if (a.length === b.length && n > 0) return { ms: a[n - 1]! - b[n - 1]!, txt: `${TAGS[n - 1]}: ${a[n - 1]! < b[n - 1]! ? p1.name : p2.name} впереди` };
    if (a.length > b.length) { const el = t2 ? t2['el'] + (now - t2.at) : null; return el == null ? null : { ms: a[b.length] != null ? a[b.length]! - el : 0, txt: `${p1.name} прошёл ${TAGS[b.length]}` }; }
    if (b.length > a.length) { const el = t1 ? t1['el'] + (now - t1.at) : null; return el == null ? null : { ms: el - b[a.length]!, txt: `${p2.name} прошёл ${TAGS[a.length]}` }; }
    return null;
  }
}
