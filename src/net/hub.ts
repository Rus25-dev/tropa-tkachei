// Центр звезды: организатор гонки или хост коопа. Принимает игроков и обсерверов по личным ключам, нумерует надёжные сообщения,
// досылает пропущенное после обрыва и выгружает своё состояние (dump), чтобы пережить перезагрузку вкладки.
// Порт «надёжного канала» RaceHub из v1.8 (legacy/src/race-net.js): пульс 2 с, тишина 7 с = связь потеряна, номер журнала g у каждой
// рассылки, ack/nack, «лёгкие» сообщения без нумерации для телеметрии.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { cleanCode, defaultEnv, peerId, type Closable, type Conn, type Env, type Msg, type Ns, type Transport } from './types';

export const HB = 2000, DEAD = 7000, HELLO_WAIT = 6000, LOG_MAX = 1500;
export type Role = 'play' | 'watch';
export interface Seat {
  id: number; key: string; role: Role; name: string; sid: string | null; conn: Conn | null; online: boolean;
  lastRecv: number; lastSend: number; inN: number; gAck: number; info: Msg; rtt: number | null; lastG?: number; lastPing?: number;
}
interface LogEntry { g: number; m: unknown; to: number | null; roles: Role[] | null }
export interface HubState { g: number; log: LogEntry[]; nextId: { play: number; watch: number }; seats: { id: number; key: string; role: Role; name: string; sid: string | null; inN: number; gAck: number; info: Msg }[] }
export type SeatEvent = 'on' | 're' | 'off' | 'bye';
export interface HubOpts {
  code: string; ns?: Ns; transport: Transport; env?: Env; state?: HubState | null;
  /** принять или отказать гостю: seat — прежнее место по ключу (возвращение) или null */
  accept(hello: Msg, seat: Seat | null): { ok: boolean; role?: Role; why?: string };
  /** снимок состояния для нового или отставшего клиента */
  snap(seat: Seat): unknown;
  onMsg(seat: Seat, m: any): void;
  onSeat(seat: Seat, kind: SeatEvent): void;
  onStatus?(s: string, info?: unknown): void;
  onTel?(seat: Seat, t: any): void;
}

export class Hub {
  readonly code: string; readonly ns: Ns;
  g = 0; log: LogEntry[] = []; seats = new Map<string, Seat>(); nextId = { play: 1, watch: 101 }; status = 'idle'; tries = 0; closed = false;
  private env: Env; private lis: Closable | null = null; private hbT: unknown = null;
  constructor(private o: HubOpts) {
    this.env = o.env ?? defaultEnv(); this.code = cleanCode(o.code); this.ns = o.ns ?? 'race';
    if (o.state) this.load(o.state);
  }
  open(): void {
    this.closed = false; this._status('opening');
    this.lis = this.o.transport.listen(peerId(this.code, this.ns), {
      onOpen: () => { this.tries = 0; this._status('open'); },
      onConn: (c) => this._conn(c),
      onError: (e) => {
        if (e && e.type === 'unavailable-id') { // прошлая сессия организатора ещё числится у сервера: ждём и пробуем снова
          this.tries++; this._status('busy', { tries: this.tries });
          this.lis?.close(); this.lis = null;
          this.env.setTimeout(() => { if (!this.closed) this.open(); }, Math.min(1500 + this.tries * 500, 5000));
        } else this._status('error', e);
      },
    });
    this.hbT = this.hbT ?? this.env.setInterval(() => this._tick(), 1000);
  }
  close(): void {
    this.closed = true; if (this.hbT) this.env.clearInterval(this.hbT); this.hbT = null;
    for (const s of this.seats.values()) if (s.conn) { this._tx(s, { k: 'bye' }); try { s.conn.close(); } catch { /* уже закрыто */ } s.conn = null; s.online = false; }
    try { this.lis?.close(); } catch { /* уже закрыто */ } this.lis = null; this._status('closed');
  }
  private _status(s: string, info?: unknown): void { this.status = s; this.o.onStatus?.(s, info); }
  dump(): HubState {
    return { g: this.g, log: this.log.slice(-400), nextId: { ...this.nextId }, seats: [...this.seats.values()].map((s) => ({ id: s.id, key: s.key, role: s.role, name: s.name, sid: s.sid, inN: s.inN, gAck: s.gAck, info: s.info })) };
  }
  load(st: HubState): void {
    this.g = st.g | 0; this.log = (st.log || []).slice(); this.nextId = { ...{ play: 1, watch: 101 }, ...(st.nextId || {}) };
    for (const s of st.seats || []) this.seats.set(s.key, { id: s.id, key: s.key, role: s.role, name: s.name, sid: s.sid || null, conn: null, online: false, lastRecv: 0, lastSend: 0, inN: s.inN | 0, gAck: s.gAck | 0, info: s.info || {}, rtt: null });
  }
  seatById(id: number): Seat | null { for (const s of this.seats.values()) if (s.id === id) return s; return null; }
  players(): Seat[] { return [...this.seats.values()].filter((s) => s.role === 'play'); }
  /** надёжная рассылка: to — id места (иначе всем), roles — ограничить роли */
  broadcast(m: unknown, to?: number | null, roles?: Role[] | null): number {
    const e: LogEntry = { g: ++this.g, m, to: to == null ? null : to, roles: roles || null };
    this.log.push(e); if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
    for (const s of this.seats.values()) if (s.online && this._for(e, s)) this._sendE(s, e);
    return e.g;
  }
  sendTo(seat: Seat, m: unknown): number { return this.broadcast(m, seat.id); }
  /** pg — предыдущий номер, отправленный этому месту: по нему клиент замечает пропуск и просит досылку */
  private _sendE(s: Seat, e: LogEntry): void { this._tx(s, { k: 'e', g: e.g, pg: (s.lastG ?? 0) | 0, m: e.m }); s.lastG = e.g; }
  private _replay(s: Seat, from: number): void { s.lastG = from; for (const e of this.log) if (e.g > from && this._for(e, s)) this._sendE(s, e); }
  /** лёгкое сообщение без нумерации (телеметрия): важна только последняя */
  light(m: unknown, roles?: Role[] | null, exceptId?: number): void { for (const s of this.seats.values()) if (s.online && (!roles || roles.includes(s.role)) && s.id !== exceptId) this._tx(s, { k: 'tl', tv: m }); }
  lightTo(seat: Seat, m: unknown): void { if (seat.online) this._tx(seat, { k: 'tl', tv: m }); }
  private _for(e: LogEntry, s: Seat): boolean { return (e.to == null || e.to === s.id) && (!e.roles || e.roles.includes(s.role)); }
  private _tx(s: Seat, o: Msg): void { if (!s.conn) return; o['t'] = 'rc'; o['a'] = s.inN; s.lastSend = this.env.now(); try { s.conn.send(o); } catch { /* канал закрыт */ } }
  private _conn(c: Conn): void {
    const st: { seat: Seat | null } = { seat: null }; let done = false;
    const timer = this.env.setTimeout(() => { if (!done) { try { c.close(); } catch { /* уже закрыто */ } } }, HELLO_WAIT);
    c.onData = (d) => {
      if (!d || d.t !== 'rc') return;
      if (!st.seat) { if (d.k === 'hello') { done = true; this.env.clearTimeout(timer); st.seat = this._hello(c, d); } return; }
      if (st.seat.conn !== c) return; // устаревшее соединение этого места
      this._data(st.seat, d);
    };
    c.onClose = () => { this.env.clearTimeout(timer); const s = st.seat; if (s && s.conn === c) this._off(s, 'off'); };
  }
  private _hello(c: Conn, d: Msg): Seat | null {
    const key = String(d['key'] || ''); const prev = this.seats.get(key) ?? null; let seat: Seat;
    const dec = this.o.accept(d, prev) || { ok: false, why: 'отказ' };
    if (!dec.ok) { try { c.send({ t: 'rc', k: 'deny', why: dec.why || 'отказ' }); } catch { /* канал закрыт */ } this.env.setTimeout(() => { try { c.close(); } catch { /* уже закрыто */ } }, 200); return null; }
    const re = !!prev;
    if (!prev) {
      const role: Role = dec.role === 'watch' ? 'watch' : 'play';
      seat = { id: this.nextId[role]++, key, role, name: String(d['name'] || '').slice(0, 24), sid: null, conn: null, online: false, lastRecv: 0, lastSend: 0, inN: 0, gAck: 0, info: {}, rtt: null };
      this.seats.set(key, seat);
    } else { seat = prev; if (d['name']) seat.name = String(d['name']).slice(0, 24); }
    // новый экземпляр клиента (перезагрузка без сохранённой очереди): его нумерация начинается заново, счётчик приёма сбрасываем
    if (seat.sid !== (d['sid'] || null)) { seat.inN = 0; seat.sid = d['sid'] || null; }
    if (seat.conn && seat.conn !== c) { const old = seat.conn; seat.conn = null; try { old.close(); } catch { /* уже закрыто */ } }
    seat.conn = c; seat.online = true; seat.lastRecv = this.env.now();
    const fresh = !!d['fresh']; // клиент у нас впервые: ему нужен снимок, а не весь журнал
    const gap = !fresh && this.log.length > 0 && this.log[0]!.g > d['ack'] + 1 && this.log[0]!.g > 1; // журнал уже обрезан: нужен снимок
    const resync = fresh || gap || d['ack'] > this.g;
    this._tx(seat, { k: 'welcome', seat: seat.id, role: seat.role, re, g: this.g, wall: this.env.wall ? this.env.wall() : Date.now(), ack: seat.inN, resync, snap: this.o.snap(seat) });
    seat.lastG = resync ? this.g : d['ack'];
    if (!fresh && !gap && d['ack'] <= this.g) this._replay(seat, d['ack']);
    seat.gAck = Math.max(seat.gAck, fresh || gap ? this.g : d['ack']);
    this.o.onSeat(seat, re ? 're' : 'on');
    return seat;
  }
  private _data(s: Seat, d: Msg): void {
    s.lastRecv = this.env.now();
    if (typeof d['ag'] === 'number' && d['ag'] > s.gAck) s.gAck = d['ag'];
    switch (d['k']) {
      case 'e':
        if (d['n'] === s.inN + 1) { s.inN = d['n']; this.o.onMsg(s, d['m']); this._tx(s, { k: 'ack' }); }
        else if (d['n'] > s.inN + 1) this._tx(s, { k: 'nack' }); // пропуск: просим досылать с места inN (оно в поле a)
        else this._tx(s, { k: 'ack' });                           // дубль (n ≤ inN) после повторной отправки
        break;
      case 'nackg': this._replay(s, d['ag'] | 0); break; // клиент заметил пропуск в рассылке
      case 'tl': this.o.onTel?.(s, d['tv']); break;
      case 'hb': this._tx(s, { k: 'hbr', ts: d['ts'] }); break;
      case 'hbr': if (d['ts'] != null) { const r = this.env.now() - d['ts']; s.rtt = s.rtt == null ? r : s.rtt * 0.7 + r * 0.3; } break;
      case 'bye': this._off(s, 'bye'); try { s.conn?.close(); } catch { /* уже закрыто */ } s.conn = null; break;
    }
  }
  private _off(s: Seat, kind: SeatEvent): void { if (!s.online && kind === 'off') return; s.online = false; s.conn = null; this.o.onSeat(s, kind); }
  private _tick(): void {
    const now = this.env.now();
    for (const s of this.seats.values()) {
      if (!s.online) continue;
      if (now - s.lastRecv > DEAD) { const c = s.conn; this._off(s, 'off'); try { c?.close(); } catch { /* уже закрыто */ } continue; }
      if (now - (s.lastPing || 0) >= HB) { s.lastPing = now; this._tx(s, { k: 'hb', ts: now }); }
    }
  }
}
