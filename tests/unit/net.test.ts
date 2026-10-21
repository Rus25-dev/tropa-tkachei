// Надёжный канал (src/net) в Node на виртуальном времени с фальшивой сетью: обмен, обрывы, перезагрузки, дубли, отказы, потери, «хаос».
// Это порт tools/race-net-test.js из v1.8: те же сценарии, те же проверки.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { Client, type ClientOpts } from '../../src/net/client';
import { Hub, type HubState } from '../../src/net/hub';
import { FakeNet, Sim } from './helpers/fakenet';

type TestHub = Hub & { recv: { seat: number; m: any }[]; tels?: any[] };
type TestClient = Client & { got: { m: any; g: number }[]; tels: any[]; welcomes: any[] };

function mkHub(sim: Sim, net: FakeNet, code: string, state: HubState | null, log: string[]): TestHub {
  const hub = new Hub({
    code, transport: net.transport('org'), env: sim.env(), state,
    accept: (hello, seat) => (hello['ver'] !== '1.8' ? { ok: false, why: 'версия' } : seat ? { ok: true } : (hello['role'] === 'play' && hub.players().length >= 2 ? { ok: false, why: 'комната занята' } : { ok: true, role: hello['role'] })),
    snap: () => ({ phase: 'run', x: 1 }),
    onMsg: (seat, m) => { hub.recv.push({ seat: seat.id, m }); },
    onTel: (_seat, t) => { (hub.tels = hub.tels || []).push(t); },
    onSeat: (seat, kind) => { log.push(`${seat.id}:${kind}`); },
  }) as TestHub;
  hub.recv = [];
  return hub;
}
function mkClient(sim: Sim, net: FakeNet, node: string, code: string, role: 'play' | 'watch', extra?: Partial<ClientOpts>): TestClient {
  const got: { m: any; g: number }[] = [], tels: any[] = [];
  const c = new Client({ code, key: 'KEY-' + node, role, name: node, hello: () => ({ ver: '1.8' }), transport: net.transport(node), env: sim.env(),
    onMsg: (m, g) => got.push({ m, g }), onTel: (t) => tels.push(t), onWelcome: (w) => { c.welcomes.push(w); }, ...extra }) as TestClient;
  c.got = got; c.tels = tels; c.welcomes = [];
  return c;
}
const nums = (arr: { m: any }[], key: string): number[] => arr.map((x) => x.m[key]);
const inOrderOnce = (arr: { m: any }[], key: string, n: number): boolean => arr.length === n && arr.every((x, i) => x.m[key] === i + 1);

describe('надёжный канал', () => {
  it('1: обмен и подтверждения, лёгкая рассылка, пульс и пинг', () => {
    const sim = new Sim(), net = new FakeNet(sim), log: string[] = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'), w = mkClient(sim, net, 'w1', 'ABCDE', 'watch');
    sim.run(100); p1.start(); w.start(); sim.run(500);
    expect(p1.status).toBe('online'); expect(w.status).toBe('online');
    expect(p1.welcomes[0].seat).toBe(1); expect(w.welcomes[0].seat).toBe(101); expect(p1.welcomes[0].snap.phase).toBe('run');
    for (let i = 1; i <= 5; i++) p1.send({ n: i });
    for (let i = 1; i <= 4; i++) hub.broadcast({ b: i });
    hub.sendTo(hub.seatById(1)!, { only: 1 });
    sim.run(1000);
    expect(inOrderOnce(hub.recv.filter((r) => r.m.n), 'n', 5)).toBe(true);
    expect(p1.got.filter((x) => x.m.b).length).toBe(4);
    expect(p1.got.some((x) => x.m.only)).toBe(true); expect(w.got.some((x) => x.m.only)).toBe(false);
    expect(p1.pending()).toBe(0);
    hub.light({ pos: 1 }, ['watch']); sim.run(100);
    expect(w.tels.length).toBe(1); expect(p1.tels.length).toBe(0); expect(w.tels[0].pos).toBe(1);
    p1.tel({ x: 42 }); sim.run(100); expect(hub.tels?.[0]?.x).toBe(42);
    sim.run(5000); expect(p1.status).toBe('online'); expect(hub.seatById(1)!.online).toBe(true);
    expect(p1.rtt).not.toBeNull(); expect(p1.rtt!).toBeGreaterThanOrEqual(50); expect(p1.rtt!).toBeLessThanOrEqual(120);
  });

  it('1б: перезагрузка клиента с сохранённой очередью и без неё', () => {
    const sim = new Sim(), net = new FakeNet(sim), log: string[] = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    let saved: any = null;
    const mk = (st: any): TestClient => mkClient(sim, net, 'p1', 'ABCDE', 'play', st ? { sid: st.sid, n: st.n, outbox: st.outbox, gSeen: st.gSeen, resume: true, onQueue: (q) => { saved = JSON.parse(JSON.stringify(q)); } } : { onQueue: (q) => { saved = JSON.parse(JSON.stringify(q)); } });
    const p1 = mk(null); sim.run(100); p1.start(); sim.run(500);
    for (let i = 1; i <= 5; i++) p1.send({ n: i });
    sim.run(300);
    net.cut('p1'); p1.send({ n: 6 }); p1.send({ n: 7 }); sim.run(500);
    p1.stop(false); net.heal('p1'); // вкладка закрыта: очередь осталась в «localStorage»
    const p1b = mk(saved); sim.run(100); p1b.start(); sim.run(3000);
    p1b.send({ n: 8 }); sim.run(500);
    expect(hub.recv.map((r) => r.m.n).join()).toBe('1,2,3,4,5,6,7,8');
    p1b.stop(false);
    const p1c = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1c.start(); sim.run(3000); p1c.send({ n: 9 }); sim.run(500);
    expect(hub.recv[hub.recv.length - 1]!.m.n).toBe(9); // новый sid не отбрасывается как «дубль»
  });

  it('2: тихий обрыв — события копятся, клиент возвращается, всё доходит ровно один раз', () => {
    const sim = new Sim(), net = new FakeNet(sim), log: string[] = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1.start(); sim.run(500);
    for (let i = 1; i <= 3; i++) p1.send({ n: i });
    sim.run(200);
    net.cut('p1'); // пропал интернет у игрока
    for (let i = 4; i <= 9; i++) { p1.send({ n: i }); sim.run(500); hub.broadcast({ b: i }); }
    sim.run(3000); sim.run(10000);
    expect(log).toContain('1:off');
    expect(p1.pending()).toBeGreaterThan(0); expect(p1.status).not.toBe('online');
    net.heal('p1'); sim.run(15000);
    expect(p1.status).toBe('online'); expect(hub.seatById(1)!.online).toBe(true);
    expect(inOrderOnce(hub.recv.filter((r) => r.m.n), 'n', 9)).toBe(true);
    expect(p1.got.filter((x) => x.m.b).length).toBe(6);
    expect(log.filter((x) => x === '1:re').length).toBeGreaterThanOrEqual(1); expect(p1.pending()).toBe(0);
  });

  it('3: закрытое соединение, быстрый возврат и прощание', () => {
    const sim = new Sim(), net = new FakeNet(sim), log: string[] = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1.start(); sim.run(500);
    for (const l of net.links) l.a.close(); // вкладка закрыла канал
    p1.send({ n: 1 }); sim.run(5000);
    expect(p1.status).toBe('online'); expect(hub.recv.length).toBe(1);
    p1.bye(); sim.run(200);
    expect(log).toContain('1:bye');
  });

  it('4: перезагрузка организатора — комната, места и журнал восстанавливаются', () => {
    const sim = new Sim(), net = new FakeNet(sim), log: string[] = [];
    let hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'), p2 = mkClient(sim, net, 'p2', 'ABCDE', 'play'), w = mkClient(sim, net, 'w1', 'ABCDE', 'watch');
    sim.run(100); p1.start(); p2.start(); w.start(); sim.run(600);
    for (let i = 1; i <= 4; i++) { p1.send({ n: i }); hub.broadcast({ b: i }); }
    sim.run(500);
    const saved: HubState = JSON.parse(JSON.stringify(hub.dump())); // «localStorage»
    hub.closed = true; net.killHub('tropa-race-ABCDE', 9000); net.cut('org'); // закрыл вкладку без прощания
    p1.send({ n: 5 }); p2.send({ n: 1 }); sim.run(2000);
    net.heal('org');
    const log2: string[] = []; hub = mkHub(sim, net, 'ABCDE', saved, log2); hub.open();
    sim.run(30000);
    expect(hub.status).toBe('open');
    expect(p1.status).toBe('online'); expect(p2.status).toBe('online'); expect(w.status).toBe('online');
    expect(hub.recv.filter((r) => r.seat === 1 && r.m.n).map((r) => r.m.n).join()).toBe('5');
    expect(log2.filter((x) => x.endsWith(':re')).length).toBe(3); expect(hub.seatById(1)!.key).toBe('KEY-p1');
    const lenBefore = p1.got.length; hub.broadcast({ b: 99 }); sim.run(500);
    expect(p1.got.length).toBe(lenBefore + 1); expect(w.got[w.got.length - 1]!.m.b).toBe(99);
  });

  it('5: дубли кадров не создают повторов', () => {
    const sim = new Sim(), net = new FakeNet(sim), log: string[] = []; net.dupRate = 0.5;
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1.start(); sim.run(600);
    for (let i = 1; i <= 30; i++) { p1.send({ n: i }); hub.broadcast({ b: i }); sim.run(40); }
    sim.run(2000);
    expect(inOrderOnce(hub.recv.filter((r) => r.m.n), 'n', 30)).toBe(true);
    expect(inOrderOnce(p1.got.filter((x) => x.m.b), 'b', 30)).toBe(true);
  });

  it('6: отказ по версии, комната на двоих, обсерверов сколько угодно, нет комнаты — терпеливые попытки', () => {
    const sim = new Sim(), net = new FakeNet(sim), log: string[] = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const bad = new Client({ code: 'ABCDE', key: 'K', role: 'play', name: 'x', hello: () => ({ ver: '1.7' }), transport: net.transport('bad'), env: sim.env() });
    sim.run(100); bad.start(); sim.run(3000);
    expect(bad.status).toBe('denied'); expect(hub.seats.size).toBe(0);
    const a = mkClient(sim, net, 'a', 'ABCDE', 'play'), b = mkClient(sim, net, 'b', 'ABCDE', 'play'), c = mkClient(sim, net, 'c', 'ABCDE', 'play');
    a.start(); b.start(); c.start(); sim.run(3000);
    expect(a.status).toBe('online'); expect(b.status).toBe('online'); expect(c.status).toBe('denied');
    const ws = [1, 2, 3, 4, 5].map((i) => mkClient(sim, net, 'w' + i, 'ABCDE', 'watch')); ws.forEach((x) => x.start()); sim.run(3000);
    expect(ws.every((x) => x.status === 'online')).toBe(true);
    const none = mkClient(sim, net, 'z', 'ZZZZZ', 'play'); none.start(); sim.run(40000);
    expect(none.status).toBe('reconnecting'); expect(none.attempt).toBeGreaterThanOrEqual(5);
  });

  it('7: обсервер получает снимок вместо длинного журнала и после обрезки журнала', () => {
    const sim = new Sim(), net = new FakeNet(sim), log: string[] = [];
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open(); sim.run(100);
    for (let i = 1; i <= 2000; i++) hub.broadcast({ b: i }); // журнал длиннее предела
    const w = mkClient(sim, net, 'w1', 'ABCDE', 'watch'); w.start(); sim.run(1000);
    expect(w.status).toBe('online'); expect(w.welcomes[0].resync).toBe(true); expect(w.got.length).toBe(0);
    hub.broadcast({ b: 2001 }); sim.run(300);
    net.cut('w1'); sim.run(9000); for (let i = 0; i < 1800; i++) hub.broadcast({ b: 3000 + i }); net.heal('w1'); sim.run(20000);
    expect(w.status).toBe('online'); expect(w.welcomes[w.welcomes.length - 1].resync).toBe(true);
    hub.broadcast({ b: 7777 }); sim.run(300);
    expect(w.got[w.got.length - 1]!.m.b).toBe(7777);
  });

  it('8: хаос — 10 минут случайных обрывов, дублей и перезагрузок организатора, каждое событие ровно один раз', () => {
    const sim = new Sim(), net = new FakeNet(sim, 40), log: string[] = []; net.dupRate = 0.2;
    let hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'), p2 = mkClient(sim, net, 'p2', 'ABCDE', 'play'), w = mkClient(sim, net, 'w1', 'ABCDE', 'watch');
    sim.run(100); p1.start(); p2.start(); w.start(); sim.run(1000);
    let n1 = 0, n2 = 0, b = 0, cuts = 0, reloads = 0; const nodes = ['p1', 'p2', 'w1', 'org'];
    for (let step = 0; step < 6000; step++) { // 6000 × 100 мс = 10 минут
      if (sim.rand() < 0.5) p1.send({ n: ++n1 });
      if (sim.rand() < 0.3) p2.send({ n: ++n2 });
      if (sim.rand() < 0.4) hub.broadcast({ b: ++b });
      if (sim.rand() < 0.004) { const node = nodes[Math.floor(sim.rand() * 3)]!; net.cut(node); cuts++; sim.env().setTimeout(() => net.heal(node), 1000 + sim.rand() * 14000); }
      if (sim.rand() < 0.0015 && !net.cutNodes.has('org')) { // организатор перезагрузился
        const saved: HubState = JSON.parse(JSON.stringify(hub.dump())), prev = hub.recv;
        hub.closed = true; net.killHub('tropa-race-ABCDE', 8000); net.cut('org'); reloads++;
        sim.env().setTimeout(() => { net.heal('org'); const nh = mkHub(sim, net, 'ABCDE', saved, log); nh.recv = prev.slice(); nh.open(); hub = nh; }, 2000 + sim.rand() * 3000);
      }
      sim.run(100);
    }
    for (const node of nodes) net.heal(node);
    sim.run(60000);
    const r1 = hub.recv.filter((r) => r.seat === 1).map((r) => r.m.n), r2 = hub.recv.filter((r) => r.seat === 2).map((r) => r.m.n);
    const seq = (a: number[], n: number): boolean => a.length === n && a.every((v, i) => v === i + 1);
    expect(cuts).toBeGreaterThan(0); expect(reloads).toBeGreaterThanOrEqual(0);
    expect([p1.status, p2.status, w.status]).toEqual(['online', 'online', 'online']);
    expect(seq(r1, n1) && seq(r2, n2)).toBe(true);
    const bs = (c: TestClient): number[] => nums(c.got.filter((x) => x.m.b), 'b'), mono = (a: number[]): boolean => a.every((v, i) => !i || v > a[i - 1]!);
    expect(mono(bs(p1)) && mono(bs(p2)) && mono(bs(w))).toBe(true);
    expect(bs(p1)[bs(p1).length - 1] === b || bs(p1).length === 0 || p1.welcomes.some((x) => x.resync)).toBe(true);
    expect(p1.pending() === 0 && p2.pending() === 0).toBe(true);
  });

  it('9: потери 5 % и разброс задержки 50–300 мс — всё доходит ровно один раз и по порядку', () => {
    const sim = new Sim(), net = new FakeNet(sim, 50), log: string[] = []; net.lossRate = 0.05; net.jitter = 250; net.dupRate = 0.05;
    const hub = mkHub(sim, net, 'ABCDE', null, log); hub.open();
    const p1 = mkClient(sim, net, 'p1', 'ABCDE', 'play'); sim.run(100); p1.start(); sim.run(3000);
    let n = 0, b = 0;
    for (let i = 0; i < 1500; i++) { if (sim.rand() < 0.3) p1.send({ n: ++n }); if (sim.rand() < 0.3) hub.broadcast({ b: ++b }); sim.run(100); }
    net.lossRate = 0; net.jitter = 0; sim.run(60000);
    expect(p1.status).toBe('online');
    expect(inOrderOnce(hub.recv.filter((r) => r.m.n), 'n', n)).toBe(true);
    expect(inOrderOnce(p1.got.filter((x) => x.m.b), 'b', b)).toBe(true);
  });
});
