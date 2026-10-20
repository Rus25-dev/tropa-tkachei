// Мост «транспорта гонок» между отдельными страницами Playwright (у каждой свой localStorage) для тестов без настоящего WebRTC.
// В страницу подставляется RaceNet.transport с теми же методами, что у PeerJS-транспорта (listen/dial/conn), а сообщения ходят через Node.
// Умеет: задержку, тихий обрыв страницы (cut/heal: пакеты пропадают, закрытий никто не видит), «смерть» страницы (kill: слушатель остаётся
// мёртвым ещё holdMs, как id на сервере-знакомителе).
const fs = require('fs'), path = require('path');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');

const PAGE_STUB = `(() => {
  const cbs = {}, conns = {}; let n = 0;
  const mk = (cid) => { const c = { onData: null, onClose: null, open: true, send(o) { window.__rtx('data', { cid, o }); }, close() { if (c.open) { c.open = false; window.__rtx('close', { cid }); } } }; conns[cid] = c; return c; };
  window.__rcIn = (m) => {
    try {
      if (m.t === 'lopen') cbs[m.lid] && cbs[m.lid].onOpen();
      else if (m.t === 'lerr') cbs[m.lid] && cbs[m.lid].onError({ type: m.type });
      else if (m.t === 'conn') cbs[m.lid] && cbs[m.lid].onConn(mk(m.cid));
      else if (m.t === 'open') cbs[m.did] && cbs[m.did].onOpen(mk(m.cid));
      else if (m.t === 'derr') cbs[m.did] && cbs[m.did].onError({ type: m.type });
      else if (m.t === 'data') { const c = conns[m.cid]; if (c && c.onData) c.onData(m.o); }
      else if (m.t === 'close') { const c = conns[m.cid]; if (c && c.open !== false) { c.open = false; if (c.onClose) c.onClose(); } }
    } catch (e) { console.error('rcIn', e); }
  };
  window.__RC_TRANSPORT = {
    listen(id, h) { const lid = ++n; cbs[lid] = h; window.__rtx('listen', { id, lid }); return { close() { window.__rtx('unlisten', { id, lid }); } }; },
    dial(id, h) { const did = ++n; cbs[did] = h; window.__rtx('dial', { id, did }); return { close() { window.__rtx('undial', { did }); } }; },
  };
  window.__installBridge = () => {};
})();`;

class Bridge {
  constructor(opt) { opt = opt || {}; this.lat = opt.lat || 25; this.listeners = new Map(); this.conns = new Map(); this.cid = 0; this.cut = new Set(); this.zombie = new Set(); this.q = new Map(); this.stat = { frames: 0, dropped: 0 }; }
  // страница → мост
  async attach(page, name) {
    page.__name = name;
    await page.exposeFunction('__rtx', (op, d) => this.route(page, op, d));
    await page.addInitScript(PAGE_STUB);
  }
  send(page, m) { // порядок доставки в одну страницу сохраняется
    const prev = this.q.get(page) || Promise.resolve();
    const p = prev.then(() => page.evaluate((x) => window.__rcIn && window.__rcIn(x), m)).catch(() => { });
    this.q.set(page, p); return p;
  }
  later(fn) { setTimeout(fn, this.lat); }
  blocked(a, b) { return this.cut.has(a) || this.cut.has(b); }
  route(page, op, d) {
    switch (op) {
      case 'listen': {
        const id = d.id;
        if (this.listeners.has(id)) { this.later(() => this.send(page, { t: 'lerr', lid: d.lid, type: 'unavailable-id' })); break; }
        this.listeners.set(id, { page, lid: d.lid }); this.later(() => this.send(page, { t: 'lopen', lid: d.lid })); break;
      }
      case 'unlisten': { const l = this.listeners.get(d.id); if (l && l.lid === d.lid) this.listeners.delete(d.id); break; }
      case 'dial': {
        this.later(() => {
          const l = this.listeners.get(d.id);
          if (!l || this.blocked(page, l.page)) { this.send(page, { t: 'derr', did: d.did, type: 'peer-unavailable' }); return; }
          if (this.zombie.has(l.page)) return; // мёртвый организатор: тишина, клиент ждёт таймаут
          const cid = ++this.cid; this.conns.set(cid, { a: page, b: l.page, closed: false });
          this.send(page, { t: 'open', did: d.did, cid }); this.send(l.page, { t: 'conn', lid: l.lid, cid });
        }); break;
      }
      case 'undial': break;
      case 'data': {
        const c = this.conns.get(d.cid); if (!c || c.closed) break; this.stat.frames++;
        const to = page === c.a ? c.b : c.a;
        this.later(() => { const cc = this.conns.get(d.cid); if (!cc || cc.closed) return; if (this.blocked(c.a, c.b) || this.zombie.has(c.a) || this.zombie.has(c.b)) { this.stat.dropped++; return; } this.send(to, { t: 'data', cid: d.cid, o: d.o }); });
        break;
      }
      case 'close': {
        const c = this.conns.get(d.cid); if (!c || c.closed) break; c.closed = true; const to = page === c.a ? c.b : c.a;
        this.later(() => { if (!this.blocked(c.a, c.b)) this.send(to, { t: 'close', cid: d.cid }); }); break;
      }
    }
    return null;
  }
  cutPage(page) { this.cut.add(page); }
  healPage(page) { this.cut.delete(page); }
  // страница организатора «умерла»: её соединения и слушатель больше не отвечают; слушатель освободится через holdMs
  killPage(page, holdMs) {
    this.zombie.add(page);
    for (const c of this.conns.values()) if (c.a === page || c.b === page) c.closed = true;
    for (const [id, l] of this.listeners) if (l.page === page) setTimeout(() => { if (this.listeners.get(id) === l) this.listeners.delete(id); }, holdMs);
  }
}
module.exports = { Bridge, phaserSrc };
