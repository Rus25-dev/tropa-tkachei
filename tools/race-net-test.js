// Проверка сетевого слоя гонок (src/race-net.js) в Node, без браузера: виртуальное время и фальшивая сеть с обрывами.
// Запуск: node tools/race-net-test.js
// Сценарии: обмен и подтверждения; тихий обрыв канала с накопившимися сообщениями; закрытое соединение; перезагрузка организатора
// (тот же код, места и счётчики из dump); дубли кадров; отказ по версии; обсервер в середине гонки и после обрезки журнала;
// «хаос»: случайные обрывы и дубли на 10 минут виртуального времени — каждое надёжное сообщение доходит ровно один раз и по порядку.
const RaceNet = require('../src/race-net.js');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('ПРОВАЛ', m); } else console.log('ок   ', m); };

// ----- виртуальное время -----
class Sim {
  constructor() { this.t = 0; this.q = []; this.id = 0; this.seed = 12345; }
  rand() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  env() {
    return {
      now: () => this.t, rand: () => this.rand(),
      setTimeout: (f, ms) => { const h = { id: ++this.id, at: this.t + Math.max(0, ms), f, every: 0 }; this.q.push(h); return h; },
      clearTimeout: (h) => { if (h) h.dead = true; },
      setInterval: (f, ms) => { const h = { id: ++this.id, at: this.t + ms, f, every: ms }; this.q.push(h); return h; },
      clearInterval: (h) => { if (h) h.dead = true; },
    };
  }
  run(ms) {
    const end = this.t + ms;
    for (;;) {
      this.q = this.q.filter((h) => !h.dead);
      let best = null; for (const h of this.q) if (h.at <= end && (!best || h.at < best.at || (h.at === best.at && h.id < best.id))) best = h;
      if (!best) break;
      this.t = best.at; if (best.every) best.at += best.every; else best.dead = true;
      best.f();
    }
    this.t = end;
  }
}
// ----- фальшивая сеть -----
class FakeNet {
  constructor(sim, latency) { this.sim = sim; this.lat = latency || 30; this.lis = new Map(); this.links = new Set(); this.cutNodes = new Set(); this.dupRate = 0; this.seq = 0; }
  transport(node) {
    const me = this;
    return {
      listen(id, h) {
        if (me.lis.has(id)) { me.sim.env().setTimeout(() => h.onError({ type: 'unavailable-id' }), 50); return { close() { } }; }
        const rec = { h, node }; me.lis.set(id, rec); me.sim.env().setTimeout(() => h.onOpen(), 20);
        return { close() { if (me.lis.get(id) === rec) me.lis.delete(id); } };
      },
      dial(id, h) {
        let dead = false;
        me.sim.env().setTimeout(() => {
          if (dead) return; const rec = me.lis.get(id);
          if (!rec || me.cutNodes.has(node) || me.cutNodes.has(rec.node)) { h.onError({ type: 'peer-unavailable' }); return; }
          if (rec.zombie) return; // организатор умер, id ещё числится у сервера: соединение не устанавливается, клиент ждёт таймаут
          const link = { a: null, b: null, cut: false, nodeA: node, nodeB: rec.node, closed: false };
          const mk = (side) => ({ onData: null, onClose: null, open: true, send(o) { me.deliver(link, side, o); }, close() { me.close(link, side); } });
          link.a = mk('a'); link.b = mk('b'); me.links.add(link);
          h.onOpen(link.a); rec.h.onConn(link.b);
        }, me.lat);
        return { close() { dead = true; } };
      },
    };
  }
  deliver(link, from, o) {
    if (link.closed) return; const to = from === 'a' ? 'b' : 'a', copies = this.sim.rand() < this.dupRate ? 2 : 1;
    for (let i = 0; i < copies; i++) this.sim.env().setTimeout(() => {
      if (link.closed || this.cutNodes.has(link.nodeA) || this.cutNodes.has(link.nodeB)) return; // тихая потеря
      const c = link[to]; if (c && c.onData) c.onData(JSON.parse(JSON.stringify(o)));
    }, this.lat + i * 7);
  }
  close(link, side) {
    if (link.closed) return; link.closed = true; const other = side === 'a' ? 'b' : 'a';
    const own = link[side]; this.sim.env().setTimeout(() => { if (own && own.onClose) own.onClose(); }, 1); // у закрывающего «close» тоже срабатывает
    this.sim.env().setTimeout(() => { if (!this.cutNodes.has(link.nodeA) && !this.cutNodes.has(link.nodeB)) { const c = link[other]; if (c && c.onClose) c.onClose(); } }, this.lat);
  }
  // тихий обрыв: пакеты перестают ходить, закрытия никто не видит (как пропавший Wi‑Fi)
  cut(node) { this.cutNodes.add(node); }
  heal(node) { this.cutNodes.delete(node); }
  // организатор «умер» без прощания: слушатель пропадает не сразу (сервер-знакомитель держит id ещё ~12 с)
  killHub(id, holdMs) { const rec = this.lis.get(id); if (!rec) return; rec.zombie = true; for (const l of this.links) if (l.nodeB === rec.node) { l.closed = true; } this.sim.env().setTimeout(() => { if (this.lis.get(id) === rec) this.lis.delete(id); }, holdMs); }
}

// ----- участники -----
function mkHub(sim, net, code, state, log) {
  const recv = [];
  const hub = new RaceNet.RaceHub({
    code, transport: net.transport('org'), env: sim.env(), state,
    accept: (hello, seat) => (hello.ver !== '1.8' ? { ok: false, why: 'версия' } : seat ? { ok: true } : (hello.role === 'play' && hub.players().length >= 2 ? { ok: false, why: 'комната занята' } : { ok: true, role: hello.role })),
    snap: () => ({ phase: 'run', x: 1 }),
    onMsg: (seat, m) => { hub.recv.push({ seat: seat.id, m }); },
    onTel: (seat, t) => { (hub.tels = hub.tels || []).push(t); },
    onSeat: (seat, kind) => { log.push(`${seat.id}:${kind}`); },
  });
  hub.recv = recv; return hub;
}
function mkClient(sim, net, node, code, role, extra) {
  const got = [], tels = [], c = new RaceNet.RaceClient({
    code, key: 'KEY-' + node, role, name: node, hello: () => ({ ver: '1.8' }), transport: net.transport(node), env: sim.env(),
    onMsg: (m, g) => got.push({ m, g }), onTel: (t) => tels.push(t), onWelcome: (w) => { c.welcomes.push(w); }, ...(extra || {}),
  });
  c.got = got; c.tels = tels; c.welcomes = []; return c;
}
const nums = (arr, key) => arr.map((x) => x.m[key]);
const inOrderOnce = (arr, key, n) => arr.length === n && arr.every((x, i) => x.m[key] === i + 1);

(function run() {
  // ===== 1. обмен и подтверждения =====
  {
    const sim = new Sim(), net = new FakeNet(sim), log = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'), w = mkClient(sim, net, 'w1', 'ABCDE', 'watch');
    sim.run(100); p1.start(); w.start(); sim.run(500);
    ok(p1.status === 'online' && w.status === 'online', '1: игрок и обсервер подключились к организатору');
    ok(p1.welcomes[0].seat === 1 && w.welcomes[0].seat === 101 && p1.welcomes[0].snap.phase === 'run', '1: места выданы (игрок 1, обсервер 101), снимок получен');
    for (let i = 1; i <= 5; i++) p1.send({ n: i });
    for (let i = 1; i <= 4; i++) hub.broadcast({ b: i });
    hub.sendTo(hub.seatById(1), { only: 1 });
    sim.run(1000);
    ok(inOrderOnce(hub.recv.filter((r) => r.m.n), 'n', 5), '1: пять событий игрока дошли по порядку ровно один раз');
    ok(p1.got.filter((x) => x.m.b).length === 4 && p1.got.some((x) => x.m.only) && !w.got.some((x) => x.m.only), '1: общая рассылка дошла всем, адресная — только игроку');
    ok(p1.pending() === 0, '1: исходящая очередь очищена подтверждениями');
    hub.light({ pos: 1 }, ['watch']); sim.run(100);
    ok(w.tels.length === 1 && p1.tels.length === 0 && w.tels[0].pos === 1, '1: лёгкая рассылка только обсерверам и с содержимым');
    p1.tel({ x: 42 }); sim.run(100); ok(hub.tels && hub.tels[0] && hub.tels[0].x === 42, '1: телеметрия игрока доходит организатору с содержимым');
    sim.run(5000); ok(p1.status === 'online' && hub.seatById(1).online, '1: пульс держит канал в простое 5 с');
    ok(p1.rtt != null && p1.rtt >= 50 && p1.rtt <= 120, '1: пинг измеряется пульсом: ' + Math.round(p1.rtt) + ' мс');
  }
  // ===== 1б. перезагрузка клиента =====
  {
    const sim = new Sim(), net = new FakeNet(sim), log = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    let saved = null; const mk = (st) => mkClient(sim, net, 'p1', 'ABCDE', 'play', st ? { sid: st.sid, n: st.n, outbox: st.outbox, gSeen: st.gSeen, resume: true, onQueue: (q) => { saved = JSON.parse(JSON.stringify(q)); } } : { onQueue: (q) => { saved = JSON.parse(JSON.stringify(q)); } });
    let p1 = mk(null); sim.run(100); p1.start(); sim.run(500);
    for (let i = 1; i <= 5; i++) p1.send({ n: i }); sim.run(300);
    net.cut('p1'); p1.send({ n: 6 }); p1.send({ n: 7 }); sim.run(500);
    p1.stop(false); net.heal('p1'); // вкладка закрыта: очередь осталась в «localStorage»
    const p1b = mk(saved); sim.run(100); p1b.start(); sim.run(3000);
    p1b.send({ n: 8 }); sim.run(500);
    ok(hub.recv.map((r) => r.m.n).join() === '1,2,3,4,5,6,7,8', '1б: после перезагрузки клиента с сохранённой очередью события идут дальше без потерь и повторов: ' + hub.recv.map((r) => r.m.n).join());
    p1b.stop(false); const p1c = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1c.start(); sim.run(3000); p1c.send({ n: 9 }); sim.run(500);
    ok(hub.recv[hub.recv.length - 1].m.n === 9, '1б: клиент без сохранённой нумерации (новый sid) не отбрасывается как «дубль»');
  }
  // ===== 2. тихий обрыв =====
  {
    const sim = new Sim(), net = new FakeNet(sim), log = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1.start(); sim.run(500);
    for (let i = 1; i <= 3; i++) p1.send({ n: i });
    sim.run(200);
    net.cut('p1'); // пропал интернет у игрока
    for (let i = 4; i <= 9; i++) { p1.send({ n: i }); sim.run(500); hub.broadcast({ b: i }); }
    sim.run(3000);
    const t0 = sim.t; sim.run(10000);
    ok(log.includes('1:off'), '2: организатор заметил обрыв (место «не в сети»)');
    ok(p1.pending() > 0 && p1.status !== 'online', '2: игрок копит события в очереди, пока связи нет (в очереди ' + p1.pending() + ')');
    net.heal('p1'); sim.run(15000);
    ok(p1.status === 'online' && hub.seatById(1).online, '2: игрок сам вернулся на то же место (' + p1.welcomes.length + ' подключения)');
    ok(inOrderOnce(hub.recv.filter((r) => r.m.n), 'n', 9), '2: все 9 событий дошли ровно один раз и по порядку: ' + nums(hub.recv.filter((r) => r.m.n), 'n').join(','));
    ok(p1.got.filter((x) => x.m.b).length === 6, '2: рассылка организатора за время обрыва догнана после возвращения (' + p1.got.filter((x) => x.m.b).length + ' из 6)');
    ok(log.filter((x) => x === '1:re').length >= 1 && p1.pending() === 0, '2: возвращение помечено как «re», очередь пуста');
    void t0;
  }
  // ===== 3. закрытое соединение и быстрый возврат =====
  {
    const sim = new Sim(), net = new FakeNet(sim), log = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1.start(); sim.run(500);
    for (const l of net.links) l.a.close();  // вкладка закрыла канал
    p1.send({ n: 1 }); sim.run(5000);
    ok(p1.status === 'online' && hub.recv.length === 1, '3: после закрытия канала клиент вернулся за секунды и событие не потеряно');
    p1.bye(); sim.run(200);
    ok(log.includes('1:bye'), '3: bye доходит организатору (место помечено сразу)');
  }
  // ===== 4. перезагрузка организатора =====
  {
    const sim = new Sim(), net = new FakeNet(sim), log = [];
    let hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'), p2 = mkClient(sim, net, 'p2', 'ABCDE', 'play'), w = mkClient(sim, net, 'w1', 'ABCDE', 'watch');
    sim.run(100); p1.start(); p2.start(); w.start(); sim.run(600);
    for (let i = 1; i <= 4; i++) { p1.send({ n: i }); hub.broadcast({ b: i }); } sim.run(500);
    const saved = JSON.parse(JSON.stringify(hub.dump())); // «localStorage»
    // организатор закрыл вкладку без прощания; пока его не было, игрок успел пережить событие
    hub.closed = true; net.killHub('tropa-race-ABCDE', 9000); net.cut('org');
    p1.send({ n: 5 }); p2.send({ n: 1 }); sim.run(2000);
    net.heal('org');
    const log2 = []; hub = mkHub(sim, net, 'ABCDE', saved, log2); hub.open();
    sim.run(30000);
    ok(hub.status === 'open', '4: организатор занял прежний код после ожидания освобождения id (тот же код комнаты)');
    ok(p1.status === 'online' && p2.status === 'online' && w.status === 'online', '4: игроки и обсервер переподключились сами');
    ok(hub.recv.filter((r) => r.seat === 1 && r.m.n).map((r) => r.m.n).join() === '5', '4: событие, отправленное в обрыв, доставлено новому организатору ровно один раз, старые не повторены: ' + hub.recv.filter((r) => r.seat === 1).map((r) => r.m.n).join());
    ok(log2.filter((x) => x.endsWith(':re')).length === 3 && hub.seatById(1).key === 'KEY-p1', '4: места восстановлены по ключам (3 возвращения)');
    const lenBefore = p1.got.length; hub.broadcast({ b: 99 }); sim.run(500);
    ok(p1.got.length === lenBefore + 1 && w.got[w.got.length - 1].m.b === 99, '4: рассылка нового организатора идёт дальше по тому же журналу, без повторов');
  }
  // ===== 5. дубли кадров =====
  {
    const sim = new Sim(), net = new FakeNet(sim), log = []; net.dupRate = 0.5;
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1.start(); sim.run(600);
    for (let i = 1; i <= 30; i++) { p1.send({ n: i }); hub.broadcast({ b: i }); sim.run(40); } sim.run(2000);
    ok(inOrderOnce(hub.recv.filter((r) => r.m.n), 'n', 30), '5: при дублировании половины кадров 30 событий игрока ровно по одному');
    ok(inOrderOnce(p1.got.filter((x) => x.m.b), 'b', 30), '5: и 30 рассылок организатора ровно по одной');
  }
  // ===== 6. отказ =====
  {
    const sim = new Sim(), net = new FakeNet(sim), log = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const bad = new RaceNet.RaceClient({ code: 'ABCDE', key: 'K', role: 'play', name: 'x', hello: () => ({ ver: '1.7' }), transport: net.transport('bad'), env: sim.env() });
    sim.run(100); bad.start(); sim.run(3000);
    ok(bad.status === 'denied' && !bad.stopped === false && hub.seats.size === 0, '6: клиент другой версии получил отказ и не долбится заново');
    const a = mkClient(sim, net, 'a', 'ABCDE', 'play'), b = mkClient(sim, net, 'b', 'ABCDE', 'play'), c = mkClient(sim, net, 'c', 'ABCDE', 'play');
    a.start(); b.start(); c.start(); sim.run(3000);
    ok(a.status === 'online' && b.status === 'online' && c.status === 'denied', '6: третий игрок не помещается (комната на двоих), обсерверов можно сколько угодно');
    const ws = [1, 2, 3, 4, 5].map((i) => mkClient(sim, net, 'w' + i, 'ABCDE', 'watch')); ws.forEach((x) => x.start()); sim.run(3000);
    ok(ws.every((x) => x.status === 'online'), '6: пять обсерверов подключились');
    const none = mkClient(sim, net, 'z', 'ZZZZZ', 'play'); none.start(); sim.run(40000);
    ok(none.status === 'reconnecting' && none.attempt >= 5, '6: нет комнаты — клиент терпеливо пробует снова с растущей паузой (попыток ' + none.attempt + ')');
  }
  // ===== 7. обсервер: снимок и догонка =====
  {
    const sim = new Sim(), net = new FakeNet(sim), log = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open(); sim.run(100);
    for (let i = 1; i <= 2000; i++) hub.broadcast({ b: i });            // журнал длиннее предела
    const w = mkClient(sim, net, 'w1', 'ABCDE', 'watch'); w.start(); sim.run(1000);
    ok(w.status === 'online' && w.welcomes[0].resync && w.got.length === 0, '7: новый обсервер получает снимок, а не весь журнал');
    hub.broadcast({ b: 2001 }); sim.run(300);
    net.cut('w1'); sim.run(9000); for (let i = 0; i < 1800; i++) hub.broadcast({ b: 3000 + i }); net.heal('w1'); sim.run(20000);
    ok(w.status === 'online' && w.welcomes[w.welcomes.length - 1].resync, '7: журнал обрезан за время обрыва — обсервер получает свежий снимок (resync)');
    hub.broadcast({ b: 7777 }); sim.run(300);
    ok(w.got[w.got.length - 1].m.b === 7777, '7: после resync обычные события идут дальше');
  }
  // ===== 8. хаос =====
  {
    const sim = new Sim(), net = new FakeNet(sim, 40), log = []; net.dupRate = process.env.NODUP ? 0 : 0.2;
    let hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'), p2 = mkClient(sim, net, 'p2', 'ABCDE', 'play'), w = mkClient(sim, net, 'w1', 'ABCDE', 'watch');
    sim.run(100); p1.start(); p2.start(); w.start(); sim.run(1000);
    let n1 = 0, n2 = 0, b = 0, cuts = 0, hubReloads = 0; const nodes = ['p1', 'p2', 'w1', 'org'];
    for (let step = 0; step < 6000; step++) { // 6000 × 100 мс = 10 минут
      if (sim.rand() < 0.5) p1.send({ n: ++n1 });
      if (sim.rand() < 0.3) p2.send({ n: ++n2 });
      if (sim.rand() < 0.4) hub.broadcast({ b: ++b });
      if (!process.env.NOCUT && sim.rand() < 0.004) { const node = nodes[Math.floor(sim.rand() * 3)]; net.cut(node); cuts++; sim.env().setTimeout(() => net.heal(node), 1000 + sim.rand() * 14000); }
      if (!process.env.NORELOAD && sim.rand() < 0.0015 && !net.cutNodes.has('org')) { // организатор перезагрузился
        const saved = JSON.parse(JSON.stringify(hub.dump())), prev = hub.recv;
        hub.closed = true; net.killHub('tropa-race-ABCDE', 8000); net.cut('org'); hubReloads++;
        sim.env().setTimeout(() => { net.heal('org'); const nh = mkHub(sim, net, 'ABCDE', saved, log); nh.recv = prev.slice(); nh.open(); hub = nh; }, 2000 + sim.rand() * 3000);
      }
      sim.run(100);
    }
    for (const node of nodes) net.heal(node); sim.run(60000);
    const r1 = hub.recv.filter((r) => r.seat === 1).map((r) => r.m.n), r2 = hub.recv.filter((r) => r.seat === 2).map((r) => r.m.n);
    const seq = (a, n) => a.length === n && a.every((v, i) => v === i + 1);
    if (process.env.DBG) { const diag = (a, n) => { const bad = []; a.forEach((v, i) => { if (v !== i + 1 && bad.length < 5) bad.push(`[${i}]=${v}`); }); return `len ${a.length}/${n} ${bad.join(' ')}`; }; console.log('   p1', diag(r1, n1), '| p2', diag(r2, n2), '| pending', p1.pending(), p2.pending()); }
    ok(p1.status === 'online' && p2.status === 'online' && w.status === 'online', `8: после ${cuts} обрывов и ${hubReloads} перезагрузок организатора все снова в сети`);
    ok(seq(r1, n1) && seq(r2, n2), `8: события игроков (${n1} и ${n2}) дошли ровно один раз и по порядку`);
    const bs = (c) => c.got.filter((x) => x.m.b).map((x) => x.m.b), mono = (a) => a.every((v, i) => !i || v > a[i - 1]);
    ok(mono(bs(p1)) && mono(bs(p2)) && mono(bs(w)), '8: рассылка организатора не повторяется и не идёт назад ни у кого');
    ok(bs(p1)[bs(p1).length - 1] === b || bs(p1).length === 0 || p1.welcomes.some((x) => x.resync), '8: игрок догнал последнюю рассылку (или получил снимок)');
    ok(p1.pending() === 0 && p2.pending() === 0, '8: очереди игроков пусты');
  }
  console.log(`проверок: ${checks}, провалов: ${fails}`);
  process.exit(fails ? 1 : 0);
})();
