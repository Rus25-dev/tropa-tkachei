// Клиент надёжного канала (игрок или обсервер): сам переподключается с растущей паузой, возвращается на то же место по личному ключу,
// держит нумерованную очередь исходящих (переживает перезагрузку вкладки через onQueue) и просит досылку пропущенных рассылок.
// Порт RaceClient из v1.8 (legacy/src/race-net.js).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DEAD, HB, type Role } from './hub';
import { cleanCode, defaultEnv, makeKey, peerId, type Closable, type Conn, type Env, type Msg, type Ns, type Transport } from './types';

export const BACKOFF = [300, 700, 1500, 3000, 5000, 8000];
export interface ClientQueue { sid: string; n: number; outbox: { n: number; m: unknown }[]; gSeen: number }
export interface ClientOpts {
  code: string; ns?: Ns; key: string; role: Role; name: string; transport: Transport; env?: Env;
  /** дополнительные поля приветствия (версия и т. п.) */
  hello?(): Msg;
  onWelcome?(w: Msg): void;
  onMsg?(m: any, g: number): void;
  onTel?(t: any): void;
  onStatus?(s: string, info?: unknown): void;
  /** очередь изменилась: владелец может сохранить её, чтобы события пережили перезагрузку вкладки */
  onQueue?(q: ClientQueue): void;
  sid?: string; n?: number; outbox?: { n: number; m: unknown }[]; gSeen?: number;
  /** клиент уже бывал в этой комнате (перезагрузка страницы игрока): снимок не нужен, нужна докачка */
  resume?: boolean;
}

export class Client {
  readonly code: string; readonly ns: Ns; readonly key: string;
  sid: string; n: number; outbox: { n: number; m: unknown }[]; gSeen: number; status = 'idle'; attempt = 0; stopped = false; rtt: number | null = null; skew = 0;
  private env: Env; private conn: Conn | null = null; private dial: Closable | null = null; private attemptId = 0;
  private lastRecv = 0; private lastPing = 0; private ackOut = 0; private seen: boolean; private helloAt = 0; private lastNack = -1e9; private lastRe = -1e9;
  private welcomed: Conn | null = null; private tickT: unknown = null; private retryT: unknown = null; private connT: unknown = null;
  constructor(private o: ClientOpts) {
    this.env = o.env ?? defaultEnv(); this.code = cleanCode(o.code); this.ns = o.ns ?? 'race'; this.key = o.key;
    this.sid = o.sid || makeKey(this.env.rand); this.n = (o.n ?? 0) | 0; this.outbox = Array.isArray(o.outbox) ? o.outbox.slice() : []; this.gSeen = (o.gSeen ?? 0) | 0; this.seen = !!o.resume;
  }
  start(): void { this.stopped = false; this._connect(); this.tickT = this.tickT ?? this.env.setInterval(() => this._tick(), 1000); }
  stop(bye?: boolean): void {
    this.stopped = true; if (this.tickT) this.env.clearInterval(this.tickT); this.tickT = null; if (this.retryT) this.env.clearTimeout(this.retryT); this.retryT = null;
    if (bye && this.conn) this._tx({ k: 'bye' });
    this._drop(); this._status('stopped');
  }
  /** прощание при закрытии вкладки: организатор узнаёт об уходе сразу, а не через 7 с тишины */
  bye(): void { if (this.conn && this.status === 'online') { try { this.conn.send({ t: 'rc', k: 'bye' }); } catch { /* канал закрыт */ } } }
  private _status(s: string, info?: unknown): void { if (this.status === s && !info) return; this.status = s; this.o.onStatus?.(s, info); }
  private _drop(): void { const c = this.conn, d = this.dial; this.conn = null; this.dial = null; try { c?.close(); } catch { /* уже закрыто */ } try { d?.close(); } catch { /* уже закрыто */ } }
  private _connect(): void {
    if (this.stopped) return; this._drop(); this._status(this.attempt ? 'reconnecting' : 'connecting', { attempt: this.attempt });
    let opened = false; const myAttempt = ++this.attemptId;
    const fail = (): void => { if (this.attemptId !== myAttempt || this.stopped) return; this._drop(); this._retry(); };
    this.connT = this.env.setTimeout(() => { if (!opened) fail(); }, 10000);
    this.dial = this.o.transport.dial(peerId(this.code, this.ns), {
      onOpen: (c) => {
        if (this.attemptId !== myAttempt || this.stopped) { try { c.close(); } catch { /* уже закрыто */ } return; }
        opened = true; this.env.clearTimeout(this.connT); this.conn = c; this.lastRecv = this.env.now();
        c.onData = (d) => this._data(c, d); c.onClose = () => { if (this.conn === c) { this.conn = null; this._lost(); } };
        this.helloAt = this.env.now();
        this._tx({ k: 'hello', key: this.key, role: this.o.role, name: this.o.name, ack: this.gSeen, fresh: !this.seen, sid: this.sid, room: this.code, ...(this.o.hello ? this.o.hello() : {}) });
      },
      onError: () => { if (!opened) { this.env.clearTimeout(this.connT); fail(); } },
    });
  }
  private _retry(): void {
    if (this.stopped) return;
    const base = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)]!, d = base * (0.85 + this.env.rand() * 0.3); this.attempt++;
    this._status('reconnecting', { attempt: this.attempt, in: Math.round(d) });
    this.retryT = this.env.setTimeout(() => { this.retryT = null; this._connect(); }, d);
  }
  private _lost(): void { if (this.stopped) return; if (this.status === 'online') this._status('offline'); this._drop(); this._retry(); }
  private _tx(o: Msg): boolean { if (!this.conn) return false; o['t'] = 'rc'; o['a'] = this.ackOut; o['ag'] = this.gSeen; try { this.conn.send(o); return true; } catch { return false; } }
  /** надёжное сообщение игрока или обсервера → организатору */
  send(m: unknown): number { const n = ++this.n; this.outbox.push({ n, m }); if (this.status === 'online') this._tx({ k: 'e', n, m }); this._q(); return n; }
  private _q(): void { this.o.onQueue?.({ sid: this.sid, n: this.n, outbox: this.outbox, gSeen: this.gSeen }); }
  /** лёгкое сообщение (теряться можно) */
  tel(t: unknown): void { if (this.status === 'online') this._tx({ k: 'tl', tv: t }); }
  pending(): number { return this.outbox.length; }
  private _data(c: Conn, d: Msg): void {
    if (this.conn !== c || !d || d['t'] !== 'rc') return;
    this.lastRecv = this.env.now();
    if (typeof d['a'] === 'number') this._acked(d['a']);
    switch (d['k']) {
      case 'welcome': {
        if (this.welcomed === c) break; // сеть продублировала приветствие: повтор не должен откатывать номер принятой рассылки
        this.welcomed = c;
        this.attempt = 0; this.ackOut = 0;
        if (d['g'] < this.gSeen) this.gSeen = d['g']; // хаб начал заново (меньший номер): сверяемся с ним
        if (d['resync']) this.gSeen = d['g'];          // снимок заменяет пропущенное
        this.seen = true;
        // разница настенных часов организатора и этого клиента (половина времени «туда-обратно» поправкой)
        if (d['wall'] != null) this.skew = d['wall'] + (this.env.now() - (this.helloAt || this.env.now())) / 2 - (this.env.wall ? this.env.wall() : Date.now());
        this._status('online', { re: d['re'] });
        this._acked(d['ack']);
        for (const e of this.outbox) if (e.n > d['ack']) this._tx({ k: 'e', n: e.n, m: e.m }); // досылаем непринятое
        this.o.onWelcome?.(d);
        break;
      }
      case 'deny': this.stopped = true; this._drop(); this._status('denied', { why: d['why'] }); break;
      case 'e':
        if (d['g'] <= this.gSeen) { this._tx({ k: 'ack' }); break; } // дубль
        if (d['pg'] != null && d['pg'] > this.gSeen) { // между принятым и этим кадром что-то потерялось: просим досылку с gSeen
          if (this.env.now() - this.lastNack > 300) { this.lastNack = this.env.now(); this._tx({ k: 'nackg' }); }
          break;
        }
        this.gSeen = d['g']; this.o.onMsg?.(d['m'], d['g']); this._tx({ k: 'ack' }); break;
      case 'nack': this._resend(); break;
      case 'tl': this.o.onTel?.(d['tv']); break;
      case 'hb': this._tx({ k: 'hbr', ts: d['ts'] }); break;
      case 'hbr': if (d['ts'] != null) { const r = this.env.now() - d['ts']; this.rtt = this.rtt == null ? r : this.rtt * 0.7 + r * 0.3; } break;
      case 'bye': this._lost(); break;
    }
  }
  private _resend(): void { if (this.env.now() - this.lastRe < 300) return; this.lastRe = this.env.now(); for (const e of this.outbox) this._tx({ k: 'e', n: e.n, m: e.m }); }
  private _acked(a: number): void { if (a > 0 && this.outbox.length && this.outbox[0]!.n <= a) { while (this.outbox.length && this.outbox[0]!.n <= a) this.outbox.shift(); this._q(); } }
  private _tick(): void {
    if (this.stopped) return; const now = this.env.now();
    if (this.status === 'online') {
      if (now - this.lastRecv > DEAD) { this._lost(); return; }
      if (now - this.lastPing >= HB) { this.lastPing = now; this._tx({ k: 'hb', ts: now }); }
    }
  }
}
