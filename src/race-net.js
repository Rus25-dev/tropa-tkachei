// ===== СЕТЬ «ГОНОК ТКАЧЕЙ»: надёжный канал организатор ⇄ игроки и обсерверы =====
// Организатор (RaceHub) — центр звезды: PeerJS-пир с id «tropa-race-КОД», принимает двух игроков и любое число обсерверов.
// Сообщения идут в обёртке { t:'rc', k:вид, … } и не мешают коопу и гонке 1×1 (там t:'race' и t:'ev'/'snap').
//
// Надёжность:
//  · пульс (hb) каждые 2 с; тишина 7 с = связь потеряна (клиент переподключается, хаб помечает место «не в сети»);
//  · клиент сам переподключается с растущей паузой (0,3 → 8 с) и возвращается на то же место по личному ключу (key);
//  · «надёжные» сообщения нумеруются: клиент → хаб по номеру n (хаб подтверждает ack в каждом кадре), хаб → клиенты по общему журналу g;
//    после обрыва недоставленное досылается с нужного места, дубли отбрасываются по номеру;
//  · лёгкие данные (телеметрия) идут без нумерации: важна только последняя;
//  · состояние хаба (журнал, места, счётчики) выгружается dump() и восстанавливается после перезагрузки страницы организатора;
//  · bye при закрытии вкладки, чтобы обрыв заметили сразу, а не через 7 с.
// Модуль не знает про игру: транспорт, часы и таймеры подменяются (tools/race-net-test.js гоняет его в Node с виртуальным временем).
const RaceNet = (() => {
  const HB = 2000, DEAD = 7000, HELLO_WAIT = 6000, LOG_MAX = 1500, BACKOFF = [300, 700, 1500, 3000, 5000, 8000];
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const defEnv = () => ({
    now: () => performance.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t),
    setInterval: (f, ms) => setInterval(f, ms), clearInterval: (t) => clearInterval(t), rand: () => Math.random(),
  });
  const peerId = (code) => 'tropa-race-' + String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const makeCode = (rand) => { let s = ''; const r = rand || Math.random; for (let i = 0; i < 5; i++) s += A[Math.floor(r() * A.length)]; return s; };
  const makeKey = (rand) => { const r = rand || Math.random; let s = ''; for (let i = 0; i < 16; i++) s += A[Math.floor(r() * A.length)]; return s; };

  // ---------- хаб (организатор) ----------
  class RaceHub {
    // o: { code, transport, env?, state?, accept(hello, seat|null) → {ok, role, why}, snap(seat) → объект, onMsg(seat, m), onSeat(seat, kind: 'on'|'re'|'off'|'bye'), onStatus(s, info) }
    constructor(o) {
      this.o = o; this.env = o.env || defEnv(); this.code = String(o.code).toUpperCase();
      this.g = 0; this.log = []; this.seats = new Map(); this.nextId = { play: 1, watch: 101 }; this.status = 'idle'; this.tries = 0; this.closed = false;
      if (o.state) this.load(o.state);
    }
    open() {
      this.closed = false; this.status = 'opening'; this._status('opening');
      const t = this.o.transport;
      this.lis = t.listen(peerId(this.code), {
        onOpen: () => { this.tries = 0; this.status = 'open'; this._status('open'); },
        onConn: (c) => this._conn(c),
        onError: (e) => {
          const type = e && e.type;
          if (type === 'unavailable-id') { // прошлая сессия организатора ещё числится у сервера: ждём и пробуем снова
            this.tries++; this._status('busy', { tries: this.tries });
            this.lis && this.lis.close(); this.lis = null;
            this.env.setTimeout(() => { if (!this.closed) this.open(); }, Math.min(1500 + this.tries * 500, 5000));
          } else this._status('error', e);
        },
      });
      this.hbT = this.hbT || this.env.setInterval(() => this._tick(), 1000);
    }
    close() {
      this.closed = true; if (this.hbT) this.env.clearInterval(this.hbT); this.hbT = null;
      for (const s of this.seats.values()) { if (s.conn) { this._tx(s, { k: 'bye' }); try { s.conn.close(); } catch (_) { } s.conn = null; s.online = false; } }
      try { this.lis && this.lis.close(); } catch (_) { } this.lis = null; this._status('closed');
    }
    _status(s, info) { this.status = s; if (this.o.onStatus) this.o.onStatus(s, info); }
    dump() { return { g: this.g, log: this.log.slice(-400), nextId: { ...this.nextId }, seats: [...this.seats.values()].map((s) => ({ id: s.id, key: s.key, role: s.role, name: s.name, sid: s.sid, inN: s.inN, gAck: s.gAck, info: s.info })) }; }
    load(st) {
      this.g = st.g | 0; this.log = (st.log || []).slice(); this.nextId = { play: 1, watch: 101, ...(st.nextId || {}) };
      for (const s of st.seats || []) this.seats.set(s.key, { id: s.id, key: s.key, role: s.role, name: s.name, sid: s.sid || null, conn: null, online: false, lastRecv: 0, lastSend: 0, inN: s.inN | 0, gAck: s.gAck | 0, info: s.info || {}, rtt: null });
    }
    seatById(id) { for (const s of this.seats.values()) if (s.id === id) return s; return null; }
    players() { return [...this.seats.values()].filter((s) => s.role === 'play'); }
    // надёжная рассылка: to — id места (иначе всем), roles — ограничить роли
    broadcast(m, to, roles) {
      const e = { g: ++this.g, m, to: to == null ? null : to, roles: roles || null };
      this.log.push(e); if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
      for (const s of this.seats.values()) if (s.online && this._for(e, s)) this._sendE(s, e);
      return e.g;
    }
    sendTo(seat, m) { return this.broadcast(m, seat.id); }
    // pg — предыдущий номер, отправленный этому месту: по нему клиент замечает пропуск и просит досылку
    _sendE(s, e) { this._tx(s, { k: 'e', g: e.g, pg: s.lastG | 0, m: e.m }); s.lastG = e.g; }
    _replay(s, from) { s.lastG = from; for (const e of this.log) if (e.g > from && this._for(e, s)) this._sendE(s, e); }
    // лёгкое сообщение без нумерации (телеметрия)
    light(m, roles, exceptId) { for (const s of this.seats.values()) if (s.online && (!roles || roles.includes(s.role)) && s.id !== exceptId) this._tx(s, { k: 'tl', tv: m }); }
    lightTo(seat, m) { if (seat.online) this._tx(seat, { k: 'tl', tv: m }); }
    _for(e, s) { return (e.to == null || e.to === s.id) && (!e.roles || e.roles.includes(s.role)); }
    _tx(s, o) { if (!s.conn) return; o.t = 'rc'; o.a = s.inN; s.lastSend = this.env.now(); try { s.conn.send(o); } catch (_) { } }
    _conn(c) {
      const st = { seat: null }; let done = false;
      const timer = this.env.setTimeout(() => { if (!done) { try { c.close(); } catch (_) { } } }, HELLO_WAIT);
      c.onData = (d) => {
        if (!d || d.t !== 'rc') return;
        if (!st.seat) { if (d.k === 'hello') { done = true; this.env.clearTimeout(timer); st.seat = this._hello(c, d); } return; }
        if (st.seat.conn !== c) return; // устаревшее соединение этого места
        this._data(st.seat, d);
      };
      c.onClose = () => { this.env.clearTimeout(timer); const s = st.seat; if (s && s.conn === c) this._off(s, 'off'); };
    }
    _hello(c, d) {
      const key = String(d.key || ''); let seat = this.seats.get(key) || null;
      const dec = this.o.accept(d, seat) || { ok: false, why: 'отказ' };
      if (!dec.ok) { try { c.send({ t: 'rc', k: 'deny', why: dec.why || 'отказ' }); } catch (_) { } this.env.setTimeout(() => { try { c.close(); } catch (_) { } }, 200); return null; }
      const re = !!seat;
      if (!seat) {
        const role = dec.role === 'watch' ? 'watch' : 'play';
        seat = { id: this.nextId[role]++, key, role, name: String(d.name || '').slice(0, 24), conn: null, online: false, lastRecv: 0, lastSend: 0, inN: 0, gAck: 0, info: {}, rtt: null };
        this.seats.set(key, seat);
      } else if (d.name) seat.name = String(d.name).slice(0, 24);
      // новый экземпляр клиента (перезагрузка без сохранённой очереди): его нумерация начинается заново, счётчик приёма сбрасываем
      if (seat.sid !== (d.sid || null)) { seat.inN = 0; seat.sid = d.sid || null; }
      if (seat.conn && seat.conn !== c) { const old = seat.conn; seat.conn = null; try { old.close(); } catch (_) { } }
      seat.conn = c; seat.online = true; seat.lastRecv = this.env.now();
      const fresh = !!d.fresh; // клиент у нас впервые: ему нужен снимок, а не весь журнал
      const missed = fresh ? null : this.log.filter((e) => e.g > d.ack && this._for(e, seat));
      const gap = !fresh && this.log.length && this.log[0].g > d.ack + 1 && this.log[0].g > 1; // журнал уже обрезан: нужен снимок
      this._tx(seat, { k: 'welcome', seat: seat.id, role: seat.role, re, g: this.g, wall: this.env.wall ? this.env.wall() : Date.now(), ack: seat.inN, resync: fresh || gap || d.ack > this.g, snap: this.o.snap(seat) });
      seat.lastG = fresh || gap || d.ack > this.g ? this.g : d.ack;
      if (!fresh && !gap && d.ack <= this.g) this._replay(seat, d.ack);
      void missed;
      seat.gAck = Math.max(seat.gAck, fresh || gap ? this.g : d.ack);
      this.o.onSeat(seat, re ? 're' : 'on');
      return seat;
    }
    _data(s, d) {
      s.lastRecv = this.env.now();
      if (typeof d.ag === 'number' && d.ag > s.gAck) s.gAck = d.ag;
      switch (d.k) {
        case 'e': {
          if (d.n === s.inN + 1) { s.inN = d.n; this.o.onMsg(s, d.m); this._tx(s, { k: 'ack' }); }
          else if (d.n > s.inN + 1) this._tx(s, { k: 'nack' }); // пропуск: просим досылать с места inN (оно в поле a)
          else this._tx(s, { k: 'ack' });               // дубль (n ≤ inN) после повторной отправки
          break;
        }
        case 'nackg': this._replay(s, d.ag | 0); break; // клиент заметил пропуск в рассылке
        case 'tl': if (this.o.onTel) this.o.onTel(s, d.tv); break;
        case 'hb': this._tx(s, { k: 'hbr', ts: d.ts }); break;
        case 'hbr': if (d.ts != null) { const r = this.env.now() - d.ts; s.rtt = s.rtt == null ? r : s.rtt * 0.7 + r * 0.3; } break;
        case 'bye': this._off(s, 'bye'); try { s.conn && s.conn.close(); } catch (_) { } s.conn = null; break;
      }
    }
    _off(s, kind) { if (!s.online && kind === 'off') return; s.online = false; s.conn = null; this.o.onSeat(s, kind); }
    _tick() {
      const now = this.env.now();
      for (const s of this.seats.values()) {
        if (!s.online) continue;
        if (now - s.lastRecv > DEAD) { const c = s.conn; this._off(s, 'off'); try { c && c.close(); } catch (_) { } continue; }
        if (now - (s.lastPing || 0) >= HB) { s.lastPing = now; this._tx(s, { k: 'hb', ts: now }); }
      }
    }
  }

  // ---------- клиент (игрок или обсервер) ----------
  class RaceClient {
    // o: { code, key, role: 'play'|'watch', name, hello?: {…}, transport, env?, onWelcome(w), onMsg(m), onTel(t), onStatus(s, info) }
    constructor(o) {
      this.o = o; this.env = o.env || defEnv(); this.code = String(o.code).toUpperCase(); this.key = o.key;
      this.sid = o.sid || makeKey(); this.n = o.n | 0; this.outbox = Array.isArray(o.outbox) ? o.outbox.slice() : []; this.gSeen = o.gSeen | 0; this.status = 'idle'; this.conn = null; this.attempt = 0; this.stopped = false;
      this.lastRecv = 0; this.lastSend = 0; this.lastPing = 0; this.rtt = null; this.ackOut = 0; this.seen = !!o.resume; // resume: клиент уже бывал в этой комнате (перезагрузка страницы игрока)
    }
    start() { this.stopped = false; this._connect(); this.tickT = this.tickT || this.env.setInterval(() => this._tick(), 1000); }
    stop(bye) {
      this.stopped = true; if (this.tickT) this.env.clearInterval(this.tickT); this.tickT = null; if (this.retryT) this.env.clearTimeout(this.retryT); this.retryT = null;
      if (bye && this.conn) this._tx({ k: 'bye' });
      this._drop(); this._status('stopped');
    }
    bye() { if (this.conn && this.status === 'online') { try { this.conn.send({ t: 'rc', k: 'bye' }); } catch (_) { } } }
    _status(s, info) { if (this.status === s && !info) return; this.status = s; if (this.o.onStatus) this.o.onStatus(s, info); }
    _drop() { const c = this.conn, d = this.dial; this.conn = null; this.dial = null; try { c && c.close(); } catch (_) { } try { d && d.close(); } catch (_) { } }
    _connect() {
      if (this.stopped) return; this._drop(); this._status(this.attempt ? 'reconnecting' : 'connecting', { attempt: this.attempt });
      let opened = false; const myAttempt = ++this.attemptId || (this.attemptId = 1);
      const fail = () => { if (this.attemptId !== myAttempt || this.stopped) return; this._drop(); this._retry(); };
      this.connT = this.env.setTimeout(() => { if (!opened) fail(); }, 10000);
      this.dial = this.o.transport.dial(peerId(this.code), {
        onOpen: (c) => {
          if (this.attemptId !== myAttempt || this.stopped) { try { c.close(); } catch (_) { } return; }
          opened = true; this.env.clearTimeout(this.connT); this.conn = c; this.lastRecv = this.env.now();
          c.onData = (d) => this._data(c, d); c.onClose = () => { if (this.conn === c) { this.conn = null; this._lost(); } };
          this.helloAt = this.env.now();
          this._tx({ k: 'hello', key: this.key, role: this.o.role, name: this.o.name, ack: this.gSeen, fresh: !this.seen, sid: this.sid, room: this.code, ...(this.o.hello ? this.o.hello() : {}) });
        },
        onError: () => { if (!opened) { this.env.clearTimeout(this.connT); fail(); } },
      });
    }
    _retry() {
      if (this.stopped) return;
      const base = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)], d = base * (0.85 + this.env.rand() * 0.3); this.attempt++;
      this._status('reconnecting', { attempt: this.attempt, in: Math.round(d) });
      this.retryT = this.env.setTimeout(() => { this.retryT = null; this._connect(); }, d);
    }
    _lost() { if (this.stopped) return; if (this.status === 'online') this._status('offline'); this._drop(); this._retry(); }
    _tx(o) { if (!this.conn) return false; o.t = 'rc'; o.a = this.ackOut; o.ag = this.gSeen; this.lastSend = this.env.now(); try { this.conn.send(o); return true; } catch (_) { return false; } }
    // надёжное сообщение игрока/обсервера → организатору
    send(m) { const n = ++this.n; this.outbox.push({ n, m }); if (this.status === 'online') this._tx({ k: 'e', n, m }); this._q(); return n; }
    // очередь изменилась: владелец может сохранить sid/n/outbox (RacePlay кладёт их в localStorage), чтобы события пережили перезагрузку вкладки
    _q() { if (this.o.onQueue) this.o.onQueue({ sid: this.sid, n: this.n, outbox: this.outbox, gSeen: this.gSeen }); }
    // лёгкое (теряться можно)
    tel(t) { if (this.status === 'online') this._tx({ k: 'tl', tv: t }); }
    pending() { return this.outbox.length; }
    _data(c, d) {
      if (this.conn !== c || !d || d.t !== 'rc') return;
      this.lastRecv = this.env.now();
      if (typeof d.a === 'number') this._acked(d.a);
      switch (d.k) {
        case 'welcome': {
          this.attempt = 0; this.ackOut = 0;
          if (d.g < this.gSeen) this.gSeen = d.g;   // хаб начал заново (меньший номер): сверяемся с ним
          if (d.resync) this.gSeen = d.g;           // снимок заменяет пропущенное
          this.seen = true;
          // разница настенных часов организатора и этого клиента (половина времени «туда-обратно» поправкой): нужна, чтобы опоздавший «go» не сдвигал время
          if (d.wall != null) this.skew = d.wall + (this.env.now() - (this.helloAt || this.env.now())) / 2 - (this.env.wall ? this.env.wall() : Date.now());
          this._status('online', { re: d.re });
          this._acked(d.ack);
          for (const e of this.outbox) if (e.n > d.ack) this._tx({ k: 'e', n: e.n, m: e.m }); // досылаем непринятое
          if (this.o.onWelcome) this.o.onWelcome(d);
          break;
        }
        case 'deny': this.stopped = true; this._drop(); this._status('denied', { why: d.why }); break;
        case 'e':
          if (d.g <= this.gSeen) { this._tx({ k: 'ack' }); break; }  // дубль
          if (d.pg != null && d.pg > this.gSeen) { // между принятым и этим кадром что-то потерялось: просим досылку с gSeen
            if (this.env.now() - (this.lastNack || -1e9) > 300) { this.lastNack = this.env.now(); this._tx({ k: 'nackg' }); }
            break;
          }
          this.gSeen = d.g; if (this.o.onMsg) this.o.onMsg(d.m, d.g); this._tx({ k: 'ack' }); break;
        case 'nack': this._resend(); break;
        case 'tl': if (this.o.onTel) this.o.onTel(d.tv); break;
        case 'hb': this._tx({ k: 'hbr', ts: d.ts }); break;
        case 'hbr': if (d.ts != null) { const r = this.env.now() - d.ts; this.rtt = this.rtt == null ? r : this.rtt * 0.7 + r * 0.3; } break;
        case 'bye': this._lost(); break;
      }
    }
    _resend() { if (this.env.now() - (this.lastRe || -1e9) < 300) return; this.lastRe = this.env.now(); for (const e of this.outbox) this._tx({ k: 'e', n: e.n, m: e.m }); }
    _acked(a) { if (a > 0 && this.outbox.length && this.outbox[0].n <= a) { while (this.outbox.length && this.outbox[0].n <= a) this.outbox.shift(); this._q(); } }
    _tick() {
      if (this.stopped) return; const now = this.env.now();
      if (this.status === 'online') {
        if (now - this.lastRecv > DEAD) { this._lost(); return; }
        if (now - this.lastPing >= HB) { this.lastPing = now; this._tx({ k: 'hb', ts: now }); }
      }
    }
  }

  // ---------- транспорт PeerJS ----------
  const peerTransport = {
    wrap(c) {
      const w = { onData: null, onClose: null, raw: c, send: (o) => { if (c.open) c.send(o); }, close: () => { try { c.close(); } catch (_) { } }, get open() { return c.open; } };
      c.on('data', (d) => { if (w.onData) w.onData(d); });
      c.on('close', () => { if (w.onClose) w.onClose(); });
      c.on('error', () => { });
      return w;
    },
    listen(id, h) {
      if (typeof Peer === 'undefined') { setTimeout(() => h.onError({ type: 'no-lib' }), 0); return { close() { } }; }
      const peer = new Peer(id, Net.opts());
      peer.on('open', () => h.onOpen());
      peer.on('connection', (c) => h.onConn(this.wrap(c)));
      peer.on('error', (e) => h.onError(e));
      peer.on('disconnected', () => { if (!peer.destroyed) try { peer.reconnect(); } catch (_) { } });
      return { close() { try { peer.destroy(); } catch (_) { } }, peer };
    },
    dial(id, h) {
      if (typeof Peer === 'undefined') { setTimeout(() => h.onError({ type: 'no-lib' }), 0); return { close() { } }; }
      const peer = new Peer(Net.opts());
      let done = false;
      peer.on('open', () => {
        const c = peer.connect(id, { reliable: true, serialization: 'json' });
        c.on('open', () => { done = true; h.onOpen(this.wrap(c)); });
        c.on('error', (e) => { if (!done) h.onError(e); });
        c.on('close', () => { if (!done) h.onError({ type: 'closed' }); });
      });
      peer.on('error', (e) => { if (!done) h.onError(e); });
      return { close() { try { peer.destroy(); } catch (_) { } } };
    },
  };

  // какой транспорт использовать: тесты подставляют свой (window.__RC_TRANSPORT или RaceNet.transport), иначе PeerJS
  const use = () => (RaceNet_ref.transport || (typeof window !== 'undefined' && window.__RC_TRANSPORT) || peerTransport);
  const RaceNet_ref = { HB, DEAD, peerId, makeCode, makeKey, RaceHub, RaceClient, peerTransport, transport: null, use };
  return RaceNet_ref;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RaceNet;
