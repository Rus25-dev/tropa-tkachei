// «Гонки Ткачей» в Node на виртуальном времени: организатор + два игрока + два обсервера, обрывы каждого участника, перезагрузка
// организатора и игрока, дубли и потери. Это порт tools/race-test.js из v1.8 без браузера (игра игрока — заглушка FakeGame).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { computeElo, ratingOf } from '../../src/core/elo';
import { mergeNames, racesJson } from '../../src/net/racecommon';
import { bestBoss, bossRows, personalBest, stageText, sumOfBest } from '../../src/net/raceprog';
import { peerId } from '../../src/net/types';
import { mkRoom, type Room, VER } from './helpers/racekit';

type P = ReturnType<Room['player']>;
/** комната с двумя игроками и двумя обсерверами; игроки ещё не готовы */
function lobby(opts: { lat?: number } = {}): { room: Room; p1: P; p2: P; w1: ReturnType<Room['watcher']>; w2: ReturnType<Room['watcher']>; code: string } {
  const room = mkRoom(opts), { sim, org } = room;
  org.create(); sim.run(200);
  const code = org.S!.code, p1 = room.player('Ива', 'p1'), p2 = room.player('Ярь', 'p2'), w1 = room.watcher('w1'), w2 = room.watcher('w2');
  expect(p1.play.join(code, 'Ива')).toBeNull(); expect(p2.play.join(code, 'Ярь')).toBeNull(); w1.join(code); w2.join(code);
  sim.run(2000);
  return { room, p1, p2, w1, w2, code };
}
/** оба готовы, старт, загрузка, отсчёт, «пошёл» */
function startRace(l: ReturnType<typeof lobby>): void {
  const { room, p1, p2 } = l;
  p1.play.toggleReady(); p2.play.toggleReady(); room.sim.run(500);
  expect(room.org.canStart()).toBe(true);
  room.org.start(); room.sim.run(5000);
}
const seat = (room: Room, name: string) => room.org.seatList().find((p) => p.name === name)!;

describe('комната: вход, отказы, готовность', () => {
  it('создание, вход двух игроков и двух обсерверов, снимок комнаты', () => {
    const { room, p1, p2, w1, w2, code } = lobby();
    expect(code).toMatch(/^[A-Z0-9]{5}$/); expect(room.org.status).toBe('open');
    expect(room.org.seatList().map((p) => [p.id, p.name, p.online])).toEqual([[1, 'Ива', true], [2, 'Ярь', true]]);
    expect(p1.play.status).toBe('online'); expect(p2.play.status).toBe('online'); expect(w1.connStatus).toBe('online'); expect(w2.connStatus).toBe('online');
    expect(w1.S!.players.length).toBe(2); expect(w1.S!.phase).toBe('lobby'); expect(room.org.watchers()).toBe(2);
    expect(p1.play.seat).toBe(1); expect(p2.play.seat).toBe(2);
    expect(room.store.loadOrg()!.S.code).toBe(code); // состояние комнаты записано
  });

  it('третий игрок, двойник имени и чужая версия отклоняются; обсервер входит всегда', () => {
    const { room, code } = lobby(), { sim, net } = room;
    const p3 = room.player('x', 'p3'); p3.play.join(code, 'Другой'); sim.run(3000);
    expect(p3.play.status).toBe('denied'); expect(p3.play.denied).toMatch(/два игрока/);
    // с двумя игроками «двойник» уже не проверить — освободим место: новая комната
    const r2 = mkRoom(); r2.org.create(); r2.sim.run(200);
    const a = r2.player('a', 'a'), b = r2.player('b', 'b'); a.play.join(r2.org.S!.code, 'Ива'); r2.sim.run(1500); b.play.join(r2.org.S!.code, ' ива '); r2.sim.run(3000);
    expect(b.play.status).toBe('denied'); expect(b.play.denied).toMatch(/занято/);
    // чужая версия
    const old = mkRoom(); old.org.create(); old.sim.run(200);
    const o = new (old.player('o', 'o').play.constructor as any)({ transport: old.net.transport('o'), env: old.sim.env(), version: '1.8', store: { loadSess: () => null, saveSess() { /* */ }, clearSess() { /* */ } }, key: 'K', bridge: old.player('o2', 'o2').game });
    o.join(old.org.S!.code, 'Старый'); old.sim.run(3000);
    expect(o.status).toBe('denied'); expect(o.denied).toMatch(/версия/);
    void net;
  });

  it('готовность: запрещённые настройки мешают, обрыв в комнате сбрасывает «готов», старт только когда оба готовы', () => {
    const { room, p1, p2 } = lobby(), { sim, net, org } = room;
    p1.game.viol = ['Лёгкий режим']; p1.play.toggleReady(); sim.run(300);
    expect(seat(room, 'Ива').ready).toBe(false); expect(org.canStart()).toBe(false);
    p1.game.viol = []; p1.play.toggleReady(); sim.run(300); // второе нажатие = «не готов», третье — готов
    p1.play.toggleReady(); sim.run(300); p2.play.toggleReady(); sim.run(300);
    expect(seat(room, 'Ива').ready && seat(room, 'Ярь').ready).toBe(true); expect(org.canStart()).toBe(true);
    net.cut('p2'); sim.run(9000);
    expect(seat(room, 'Ярь').online).toBe(false); expect(seat(room, 'Ярь').ready).toBe(false); expect(org.canStart()).toBe(false);
    net.heal('p2'); sim.run(15000);
    expect(seat(room, 'Ярь').online).toBe(true); expect(org.S!.events.some((e) => e.k === 'off')).toBe(true); expect(org.S!.events.some((e) => e.k === 're')).toBe(true);
  });
});

describe('ход гонки', () => {
  it('старт: общее зерно, загрузка, отсчёт 3-2-1, «пошёл» у обоих; обсервер видит отсчёт', () => {
    const l = lobby(), { room, p1, p2, w1 } = l, { org } = room;
    p1.play.toggleReady(); p2.play.toggleReady(); room.sim.run(500);
    org.start(); room.sim.run(800);
    expect(org.S!.phase === 'prep' || org.S!.phase === 'count').toBe(true);
    expect(p1.game.run!.seed).toBe(4242); expect(p2.game.run!.seed).toBe(4242); expect(p1.game.run!.held).toBe(true);
    expect(w1.S!.phase === 'prep' || w1.S!.phase === 'count').toBe(true);
    room.sim.run(5000);
    expect(org.S!.phase).toBe('run'); expect(org.S!.goAt).not.toBeNull();
    expect(p1.game.run!.held).toBe(false); expect(p2.game.run!.held).toBe(false);
    expect(Math.abs(p1.game.rta() - p2.game.rta())).toBeLessThan(200);
    expect(Math.abs(p1.game.rta() - org.elapsed())).toBeLessThan(250);
    expect(org.S!.events.filter((e) => e.k === 'cd').map((e) => e.x)).toEqual(['3', '2', '1']);
    expect(w1.cd).not.toBeNull();
  });

  it('«Начать без ожидания»: отсчёт идёт, даже если один игрок не загрузился', () => {
    const l = lobby(); l.p2.game.autoLoad = false;
    l.p1.play.toggleReady(); l.p2.play.toggleReady(); l.room.sim.run(500); l.room.org.start(); l.room.sim.run(3000);
    expect(l.room.org.S!.phase).toBe('prep');
    l.room.org.maybeCount(true); l.room.sim.run(4500);
    expect(l.room.org.S!.phase).toBe('run');
  });

  it('телеметрия: игроки → организатор → обсерверы пачкой; сопернику — коротко', () => {
    const l = lobby(); startRace(l); const { room, p1, p2, w1, w2 } = l;
    for (let i = 0; i < 40; i++) { p1.play.tel({ s: 1, el: Math.round(p1.game.rta()), x: 100 + i, y: 50, hp: 5, mh: 5, dt: 0, ch: 1, st: 'level', f: 1, sp: 0, dn: 0 }); p2.play.tel({ s: 2, el: Math.round(p2.game.rta()), x: 300, y: 50, hp: 4, mh: 5, dt: 1, ch: 1, st: 'level', f: -1, sp: 0, dn: 0 }); room.sim.run(66); }
    expect(Object.keys(w1.tel).sort()).toEqual(['1', '2']); expect(Object.keys(w2.tel).length).toBe(2);
    expect(w1.tel[1]!['x']).toBeGreaterThan(110); expect(seat(room, 'Ива').tel!['x']).toBeGreaterThan(110);
    const h = w1.hist[1]!; const rate = h.length / ((h[h.length - 1]!.at - h[0]!.at) / 1000);
    expect(rate).toBeGreaterThan(8); expect(rate).toBeLessThan(25);
    expect(p1.play.rv?.['s']).toBe(2); expect(p2.play.rv?.['s']).toBe(1); // у каждого — данные соперника
    expect(room.store.loadOrg()!.S.seats[1]!.tel).toBeUndefined(); // телеметрия в хранилище не пишется
  });

  it('события и обрыв связи игрока: копятся и доходят ровно один раз; организатор видит обрыв и возврат', () => {
    const l = lobby(); startRace(l); const { room, p1, w1 } = l, { sim, net, org } = room;
    p1.game.split(0); sim.run(300);
    expect(seat(room, 'Ива').splits.length).toBe(1); expect(w1.feed.some((e) => e.k === 'split' && /Ива/.test(e.x))).toBe(true);
    net.cut('p1'); p1.game.split(1); p1.play.event('death'); sim.run(9000);
    expect(seat(room, 'Ива').online).toBe(false); expect(org.S!.events.some((e) => e.k === 'off')).toBe(true);
    expect(seat(room, 'Ива').splits.length).toBe(1); expect(p1.play.client!.pending()).toBeGreaterThanOrEqual(2);
    expect(p1.play.rival().text).toMatch(/потеряна/);
    net.heal('p1'); sim.run(20000);
    expect(seat(room, 'Ива').online).toBe(true); expect(seat(room, 'Ива').splits.length).toBe(2);
    expect(org.S!.events.filter((e) => e.k === 'split' && e.i === 1).length).toBe(1);
    expect(p1.play.client!.pending()).toBe(0); expect(w1.feed.some((e) => e.k === 're' && /Ива/.test(e.x))).toBe(true);
  });

  it('техническая пауза и «Отменить действие»: время игроков не идёт, пауза учитывается', () => {
    const l = lobby(); startRace(l); const { room, p1, p2, w1 } = l, { sim, org } = room;
    org.techPause(); sim.run(400);
    expect(p1.game.techOn() && p2.game.techOn()).toBe(true); expect(w1.S!.pause.on).toBe(true);
    const a = p2.game.rta(); sim.run(1500); expect(Math.abs(p2.game.rta() - a)).toBeLessThan(5);
    org.undo(); sim.run(400);
    expect(p1.game.techOn()).toBe(false); const b = p2.game.rta(); sim.run(800); expect(p2.game.rta() - b).toBeGreaterThan(700);
    expect(org.S!.pause.total).toBeGreaterThan(1500); expect(Math.abs(org.elapsed() - p2.game.rta())).toBeLessThan(250);
  });

  it('финиш обоих: результат, победитель, архив, баннеры игроков, разбор у обсервера', () => {
    const l = lobby(); startRace(l); const { room, p1, p2, w1 } = l, { sim, org } = room;
    sim.run(2000); p1.game.finish(); sim.run(1500); p2.game.finish(); sim.run(1000);
    expect(org.S!.phase).toBe('done');
    const r = org.S!.result!;
    expect(r.players.length).toBe(2); expect(r.players.every((p) => !p.dnf && p.splits.length === 4 && p.stats)).toBe(true);
    expect(r.winner).toBe('Ива'); expect(r.players[0]!.place).toBe(1); expect(r.gap).toBeGreaterThan(1000); expect(r.discipline).toBe('trail'); expect(r.version).toBe(VER); expect(r.seed).toBe(4242);
    expect(org.archive().map((x) => x.id)).toEqual([r.id]);
    expect(w1.S!.phase).toBe('done'); expect(w1.resultLite.winner).toBe(1);
    expect(p1.play.banner(p1.game.run!.splits[3]?.rta ?? 1)!.text).toBe('ПОБЕДА'); expect(p2.play.banner(10)!.text).toBe('ПОРАЖЕНИЕ');
    const json = JSON.parse(racesJson(org.archive(), VER, '2026-01-01T00:00:00.000Z'));
    expect(json.format).toBe('tropa-tkachei/races'); expect(json.races.length).toBe(1);
    expect(w1.clockMs()).toBe(Math.max(...r.players.map((p) => p.time!)));
  });

  it('присуждение победы, «Отменить действие», отмена гонки, «Переиграть»', () => {
    const l = lobby(); startRace(l); const { room, p1, p2 } = l, { sim, org } = room;
    org.award(2); sim.run(500);
    expect(org.S!.phase).toBe('done'); expect(org.S!.result!.awarded).toBe(true); expect(org.S!.result!.winnerSeat).toBe(2); expect(org.archive().length).toBe(1);
    expect(p1.play.res.awarded).toBe(true); expect(p1.game.hasRun()).toBe(true); // забеги не оборваны
    org.undo(); sim.run(500);
    expect(org.S!.phase).toBe('run'); expect(org.S!.result).toBeNull(); expect(org.archive().length).toBe(0);
    org.cancel(); sim.run(800);
    expect(org.S!.phase).toBe('lobby'); expect(p1.game.hasRun()).toBe(false); expect(p2.game.hasRun()).toBe(false); expect(org.archive().length).toBe(0);
    expect(org.S!.seats[1]!.ready).toBe(false);
    // второй раунд и «Переиграть» после финиша
    p1.play.toggleReady(); p2.play.toggleReady(); sim.run(500); const seed1 = org.S!.id; org.start(); sim.run(5000);
    expect(org.S!.phase).toBe('run'); p1.game.finish(); p2.game.finish(); sim.run(500);
    expect(org.S!.phase).toBe('done'); expect(org.archive().length).toBe(1);
    org.restart(); sim.run(600);
    expect(org.S!.phase).toBe('lobby'); expect(org.S!.id).not.toBe(seed1); expect(p1.game.hasRun()).toBe(false);
  });

  it('уход игрока из забега (DNF) завершает гонку без него', () => {
    const l = lobby(); startRace(l); const { room, p1, p2 } = l, { sim, org } = room;
    p2.play.dnf(); sim.run(300); p1.game.finish(); sim.run(500);
    expect(org.S!.phase).toBe('done'); const r = org.S!.result!;
    expect(r.winner).toBe('Ива'); expect(r.players.find((p) => p.name === 'Ярь')!.dnf).toBe(true);
  });
});

describe('перезагрузки', () => {
  it('перезагрузка организатора посреди гонки: тот же код, ход гонки, места; все возвращаются сами', () => {
    const l = lobby(); startRace(l); const { room, p1, p2, w1, code } = l, { sim, net } = room;
    p1.game.split(0); sim.run(300);
    const goAt = room.org.S!.goAt, id = room.org.S!.id;
    (room.org.hub as any).closed = true; net.killHub(peerId(code, 'race'), 6000); net.cut('org'); // вкладка закрыта без прощания
    sim.run(1500);
    net.heal('org');
    const org2 = room.newOrg(); expect(org2.resume()).toBe(true); sim.run(30000);
    expect(org2.status).toBe('open'); expect(org2.S!.code).toBe(code); expect(org2.S!.phase).toBe('run'); expect(org2.S!.goAt).toBe(goAt); expect(org2.S!.id).toBe(id);
    expect(org2.seatList().length).toBe(2); expect(org2.seatList().every((p) => p.online)).toBe(true);
    expect(w1.connStatus).toBe('online'); expect(org2.watchers()).toBe(2);
    expect(org2.seatList()[0]!.splits.length).toBe(1);
    // гонка идёт дальше: финиши доходят до нового организатора
    p1.game.finish(); p2.game.finish(); sim.run(1500);
    expect(org2.S!.phase).toBe('done'); expect(org2.archive().length).toBe(1);
  });

  it('перезагрузка посреди отсчёта: отсчёт начинается заново, «пошёл» — только по команде', () => {
    const l = lobby(), { room, p1, p2, code } = l, { sim, net } = room;
    p1.play.toggleReady(); p2.play.toggleReady(); sim.run(500); room.org.start(); sim.run(1800);
    expect(room.org.S!.phase).toBe('count');
    (room.org.hub as any).closed = true; net.killHub(peerId(code, 'race'), 5000); net.cut('org'); sim.run(1000); net.heal('org');
    const org2 = room.newOrg(); org2.resume(); sim.run(40000);
    expect(org2.S!.phase).toBe('run'); expect(p1.game.runHeld()).toBe(false); expect(p2.game.runHeld()).toBe(false);
  });

  it('игрок: тихий обрыв прямо перед «пошёл» — подхватывает старт по состоянию, время считается от настоящего старта', () => {
    const l = lobby(), { room, p1, p2 } = l, { sim, net, org } = room;
    p1.play.toggleReady(); p2.play.toggleReady(); sim.run(500); org.start(); sim.run(1500);
    net.cut('p1'); sim.run(10000); // «пошёл» прошёл мимо, обрыв длиннее 7 с
    expect(org.S!.phase).toBe('run'); expect(p1.game.runHeld()).toBe(true);
    net.heal('p1'); sim.run(20000);
    expect(p1.game.runHeld()).toBe(false);
    expect(Math.abs(p1.game.rta() - org.elapsed())).toBeLessThan(400);
    expect(p1.game.toasts.some((t) => /Связь вернулась/.test(t))).toBe(true);
  });

  it('игрок: короткая тихая потеря (меньше 7 с, связь не рвётся) — пульс замечает пропуск, «пошёл» не теряется', () => {
    const l = lobby(), { room, p1, p2 } = l, { sim, net, org } = room;
    p1.play.toggleReady(); p2.play.toggleReady(); sim.run(500); org.start(); sim.run(1500);
    net.cut('p1'); sim.run(4000); net.heal('p1'); sim.run(5000);
    expect(p1.game.runHeld()).toBe(false); expect(Math.abs(p1.game.rta() - org.elapsed())).toBeLessThan(400);
  });

  it('игрок: перезагрузка вкладки — очередь событий и место сохранились; забег восстанавливается по журналу', () => {
    const l = lobby(); startRace(l); const { room, p1, code } = l, { sim, net, org } = room;
    p1.game.split(0); sim.run(300);
    net.cut('p1'); p1.game.split(1); sim.run(500); // событие не ушло, лежит в очереди
    const sess = JSON.parse(p1.store.s!);
    expect(sess.outbox.length).toBeGreaterThan(0);
    p1.play.client!.stop(false); net.killHub('x', 1); // вкладка пропала
    net.heal('p1');
    const re = room.player('Ива', 'p1', 'KEY-p1'); re.store.s = p1.store.s;
    re.game.journal = { ok: true, race: { code, id: org.S!.id } };
    re.play.join(code, 'Ива'); sim.run(8000);
    expect(re.play.status).toBe('online'); expect(re.game.log).toContain('restore'); expect(re.game.hasRun()).toBe(true); expect(re.game.runHeld()).toBe(false);
    expect(org.S!.events.some((e) => e.k === 'restored')).toBe(true); expect(seat(room, 'Ива').restored).toBe(1);
    expect(seat(room, 'Ива').splits.length).toBe(2); // событие из сохранённой очереди дошло
    expect(org.seatList().length).toBe(2); expect(seat(room, 'Ива').online).toBe(true);
  });

  it('игрок: журнал чужой гонки не используется', () => {
    const l = lobby(); startRace(l); const { room, code } = l, { sim, org } = room;
    const re = room.player('Новый', 'p9', 'KEY-p1'); re.game.journal = { ok: true, race: { code, id: 'старая-гонка' } };
    re.play.join(code, 'Ива'); sim.run(5000);
    expect(re.game.log).not.toContain('restore'); expect(re.game.journal).toBeNull(); expect(org.S!.events.some((e) => e.k === 'restored')).toBe(false);
  });

  it('обсервер: отвал и возврат — снимок и лента на месте; лента не дублируется', () => {
    const l = lobby(); startRace(l); const { room, p1, w1 } = l, { sim, net } = room;
    p1.game.split(0); sim.run(300); const n0 = w1.feed.length;
    net.cut('w1'); sim.run(500); p1.game.split(1); sim.run(9000); net.heal('w1'); sim.run(15000);
    expect(w1.connStatus).toBe('online'); expect(w1.feed.length).toBeGreaterThan(n0);
    const ns = w1.feed.map((e) => e.n); expect(new Set(ns).size).toBe(ns.length);
    expect(w1.S!.players[0]!.splits.length).toBe(2);
  });
});

describe('плохая сеть', () => {
  it('потери 5 %, дубли и разброс задержки: гонка проходится до архива', () => {
    const l = lobby({ lat: 60 }); const { room, p1, p2, w1 } = l, { sim, net, org } = room;
    net.lossRate = 0.05; net.dupRate = 0.05; net.jitter = 240;
    p1.play.toggleReady(); p2.play.toggleReady(); sim.run(4000); org.start(); sim.run(15000);
    expect(org.S!.phase).toBe('run');
    for (let i = 0; i < 4; i++) { p1.game.split(i === 3 ? 2 : i); p2.game.split(i === 3 ? 2 : i); sim.run(2000); }
    p1.game.finish(); p2.game.finish(); net.lossRate = 0; net.jitter = 0; sim.run(30000);
    expect(org.S!.phase).toBe('done'); expect(org.archive().length).toBe(1);
    for (const p of [p1, p2]) expect(p.play.client!.pending()).toBe(0);
    expect(org.S!.events.filter((e) => e.k === 'fin').length).toBe(2); expect(w1.S!.phase).toBe('done');
  });

  it('хаос: обрывы каждого участника и перезагрузки организатора — гонка не ломается', () => {
    const l = lobby({ lat: 40 }); const { room, p1, p2, w1, w2, code } = l, { sim, net } = room; let org = room.org;
    p1.play.toggleReady(); p2.play.toggleReady(); sim.run(500); org.start(); sim.run(5000);
    const nodes = ['p1', 'p2', 'w1', 'w2'];
    for (let step = 0; step < 1500; step++) {
      if (sim.rand() < 0.01) { const node = nodes[Math.floor(sim.rand() * nodes.length)]!; net.cut(node); sim.env().setTimeout(() => net.heal(node), 1000 + sim.rand() * 12000); }
      if (sim.rand() < 0.002 && !net.cutNodes.has('org')) {
        (org.hub as any).closed = true; net.killHub(peerId(code, 'race'), 6000); net.cut('org');
        sim.env().setTimeout(() => { net.heal('org'); const o2 = room.newOrg(); o2.resume(); org = o2; }, 2500);
      }
      if (sim.rand() < 0.05) p1.play.tel({ s: 1, el: 1, x: 1, y: 1 });
      sim.run(100);
    }
    for (const n of [...nodes, 'org']) net.heal(n);
    sim.run(60000);
    p1.game.finish(); p2.game.finish(); sim.run(60000);
    expect(org.S!.phase).toBe('done'); expect(org.archive().length).toBe(1);
    expect(org.S!.events.filter((e) => e.k === 'fin').length).toBe(2);
    expect([p1.play.status, p2.play.status, w1.connStatus, w2.connStatus]).toEqual(['online', 'online', 'online', 'online']);
  });
});

describe('архив', () => {
  it('объединение имён игроков и формат races.json', () => {
    const l = lobby(); startRace(l); const { room, p1, p2 } = l, { sim, org } = room;
    p1.game.finish(); p2.game.finish(); sim.run(500);
    const arr = org.archive(); expect(mergeNames(arr, 'Ярь', 'Ива')).toBe(1); expect(arr[0]!.players.map((p) => p.name)).toEqual(['Ива', 'Ива']);
    const j = JSON.parse(racesJson(arr, VER, 'x')); expect(Object.keys(j)).toEqual(['format', 'version', 'game', 'exported', 'races']);
    expect(Object.keys(j.races[0])).toEqual(expect.arrayContaining(['id', 'date', 'version', 'discipline', 'settings', 'seed', 'players', 'winner', 'winnerSeat', 'awarded', 'gap', 'goAt', 'pauseMs', 'events']));
  });
});

describe('2.2 «Тропа целиком»: подсплиты, лавка, смерти, полоска соперника', () => {
  /** показания героя для телеметрии: глава, этап, время забега */
  const tel = (p: P, s: number, extra: Record<string, unknown> = {}) => p.play.tel({ s, el: Math.round(p.game.rta()), x: 100, y: 50, hp: 5, mh: 5, dt: 0, ch: 1, st: 'level', f: 1, sp: 0, dn: 0, ...extra });
  const ev = (p: P, k: string, d: Record<string, unknown> = {}) => p.play.event(k, d);

  it('подсплиты, покупки и смерти с потерянным временем: организатор, лента, обсервер', () => {
    const l = lobby(); startRace(l); const { room, p1, p2, w1 } = l, { sim, org } = room;
    sim.run(3000);
    ev(p1, 'sub', { ch: 1, sk: 'exit' }); sim.run(2500); ev(p2, 'sub', { ch: 1, sk: 'exit' }); sim.run(300);
    ev(p1, 'sub', { ch: 1, sk: 'exit' }); // повтор того же подсплита не засчитывается
    ev(p1, 'sub', { ch: 1, sk: 'fight' }); ev(p1, 'buy', { id: 'dmg', name: 'Острая игла', ch: 1, price: 12 }); ev(p1, 'death', { ch: 1 }); sim.run(500); ev(p1, 'lost', { ms: 4200 }); sim.run(500);
    const a = seat(room, 'Ива'), b = seat(room, 'Ярь');
    expect(a.subs!.map((s) => s.k)).toEqual(['exit', 'fight']); expect(b.subs!.map((s) => s.k)).toEqual(['exit']);
    expect(b.subs![0]!.rta - a.subs![0]!.rta).toBeGreaterThan(2000); expect(b.subs![0]!.rta - a.subs![0]!.rta).toBeLessThan(3500);
    expect(a.lost).toBe(4200); expect(a.deathList).toEqual([expect.objectContaining({ ch: 1, lost: 4200 })]); expect(a.buys![0]).toMatchObject({ id: 'dmg', name: 'Острая игла', price: 12 });
    const text = w1.feed.map((e) => e.x);
    expect(text).toContain('Ива: Гл. I · выход из коридора'); expect(text).toContain('Ярь: Гл. I · выход из коридора'); expect(text).toContain('Ива: Гл. I · начало боя');
    expect(text).toContain('Ива купил(а): Острая игла за 12'); expect(text).toContain('Ива: потеряно 4.2 с после обрыва нити');
    const rp = w1.S!.players[0]!; expect(rp.subs!.length).toBe(2); expect(rp.lost).toBe(4200); expect(rp.deaths).toBe(1); expect(rp.buys).toBe(1);
    // отрыв между игроками считается по общему подсплиту
    const lead = w1.lead()!; expect(lead.ms).toBeLessThan(-2000); expect(lead.txt).toMatch(/Гл\. I · (выход из коридора|начало боя)/);
    void org;
  });

  it('индикатор «в лавке» из телеметрии; полоска соперника с этапом и отрывом', () => {
    const l = lobby(); startRace(l); const { room, p1, p2, w1 } = l, { sim } = room;
    sim.run(2000); ev(p1, 'sub', { ch: 1, sk: 'exit' }); ev(p1, 'sub', { ch: 1, sk: 'fight' }); sim.run(6000); ev(p2, 'sub', { ch: 1, sk: 'exit' }); sim.run(500);
    for (let i = 0; i < 20; i++) { tel(p1, 1, { st: 'level', sh: 1 }); tel(p2, 2, { ch: 1 }); sim.run(66); }
    sim.run(600);
    expect(w1.inShop(1)).toBe(true); expect(w1.inShop(2)).toBe(false);
    const s = p2.play.strip()!; expect(s.text).toMatch(/^Ива · Гл\. I · в лавке · \+\d+\.\d с$/); expect(s.col).toBe('#ff9a8a'); // Ива впереди: у Ярь плюс
    expect(p2.play.rival().text).toBe(s.text);
    const s1 = p1.play.strip()!; expect(s1.text).toMatch(/^Ярь · Гл\. I · .* · −\d+\.\d с$/); expect(s1.col).toBe('#9ff0c8');
    tel(p1, 1, { st: 'arena', sh: 0 }); sim.run(600); tel(p1, 1, { st: 'arena', sh: 0 }); sim.run(600);
    expect(p2.play.strip()!.text).toContain('бой с Корнематкой');
  });

  it('личный рекорд и лучшие отрезки уходят в снимок комнаты со второй гонки; итог содержит подсплиты', () => {
    const l = lobby(); startRace(l); const { room, p1, p2, w1 } = l, { sim, org } = room;
    sim.run(1000); ev(p1, 'sub', { ch: 1, sk: 'exit' }); ev(p1, 'death', { ch: 1 }); ev(p1, 'lost', { ms: 3000 }); sim.run(500);
    p1.game.finish(); sim.run(1500); p2.game.finish(); sim.run(800);
    const r = org.S!.result!, row = r.players.find((p) => p.name === 'Ива')!;
    expect(row.subs!.map((s) => s.k)).toEqual(['exit', 'kill']); expect(row.lost).toBe(3000); // последний «kill» берётся из сплитов финиша expect(row.deathList!.length).toBe(1);
    expect(r.players.find((p) => p.name === 'Ярь')!.subs!.map((s) => s.k)).toEqual(['kill']); // от игрока без событий в итог попадает только смерть последнего босса
    // вторая гонка: рекорд подтягивается из архива
    org.restart(); sim.run(600); p1.play.toggleReady(); p2.play.toggleReady(); sim.run(500); org.start(); sim.run(5000);
    const pb = w1.S!.players[0]!.pb!;
    expect(pb.t).toBe(row.time); expect(pb.sp).toEqual(row.splits); expect(pb.bs.every((x) => x != null && x > 0)).toBe(true); expect(pb.sb['1:exit']).toBe(row.subs![0]!.rta);
    expect(w1.S!.players[0]!.subs).toEqual([]); expect(w1.S!.players[0]!.lost).toBe(0);
  });

  it('событие подсплита, пришедшее после обрыва, доходит один раз', () => {
    const l = lobby(); startRace(l); const { room, p1 } = l, { sim, net } = room;
    sim.run(500); net.cut('p1'); ev(p1, 'sub', { ch: 1, sk: 'exit' }); sim.run(9000); net.heal('p1'); sim.run(20000);
    expect(seat(room, 'Ива').subs!.length).toBe(1); expect(room.org.S!.events.filter((e) => e.k === 'sub').length).toBe(1);
  });
});

describe('2.3 «Босс-раш»: дисциплина организатора, подсплиты по фазам, таблица «босс × игрок»', () => {
  const ev = (p: P, k: string, d: Record<string, unknown> = {}) => p.play.event(k, d);
  it('организатор выбирает дисциплину в комнате; неизвестная не принимается; игроки получают cat=boss и общее зерно', () => {
    const l = lobby(), { room, p1, p2, w1 } = l, { org, sim } = room;
    expect(org.S!.disc).toBe('trail'); org.setDisc('ghost'); expect(org.S!.disc).toBe('trail');
    org.setDisc('boss'); sim.run(300);
    expect(org.S!.disc).toBe('boss'); expect(w1.S!.disc).toBe('boss'); expect(w1.S!.discName).toBe('Босс-раш'); expect(p1.play.state!.discName).toBe('Босс-раш');
    p1.play.toggleReady(); p2.play.toggleReady(); sim.run(500); org.start(); sim.run(5000);
    expect(p1.game.run!.cat).toBe('boss'); expect(p2.game.run!.cat).toBe('boss'); expect(p1.game.run!.seed).toBe(p2.game.run!.seed);
    org.setDisc('trail'); expect(org.S!.disc).toBe('boss'); // во время гонки дисциплину не сменить
  });

  it('бои: фазы и итоги боссов доходят до организатора и обсервера; отрыв и подписи — по именам боссов', () => {
    const l = lobby(); l.room.org.setDisc('boss'); l.room.sim.run(300); startRace(l); const { room, p1, p2, w1 } = l, { sim } = room;
    sim.run(1000); ev(p1, 'sub', { ch: 1, sk: 'fight' }); sim.run(500); ev(p2, 'sub', { ch: 1, sk: 'fight' }); sim.run(8000);
    ev(p1, 'sub', { ch: 1, sk: 'ph2' }); ev(p1, 'boss', { ch: 1, dmg: 31.5, par: 4, tk: 2, stn: 1, exe: 0, dth: 1, fgt: 9000 }); p1.game.split(0); sim.run(300);
    const text = w1.feed.map((e) => e.x);
    expect(text).toContain('Ива: Корнематка · начало боя'); expect(text).toContain('Ярь: Корнематка · начало боя'); expect(text).toContain('Ива: Корнематка · фаза 2'); expect(text.some((x) => /^Ива: Корнематка · /.test(x) && /0:\d\d/.test(x))).toBe(true);
    const a = w1.S!.players[0]!, b = w1.S!.players[1]!;
    expect(a.bosses).toEqual([{ ch: 1, dmg: 31.5, parries: 4, taken: 2, stuns: 1, execs: 0, deaths: 1, fight: 9000 }]); expect(b.bosses).toEqual([]);
    expect(w1.lead()!.txt).toMatch(/Корнематка/);
    const rows = bossRows('boss', a, b); expect(rows[0]!.ta).toBe(a.splits[0]); expect(rows[0]!.tb).toBeNull(); expect(rows[0]!.a!.parries).toBe(4); expect(rows.map((r) => r.name)).toEqual(['Корнематка', 'Миша', 'Владик', 'Тима']);
    expect(stageText('boss', { ch: 1, st: 'level' }, a.subs, false)).toBe('Корнематка · бой, фаза 2');
  });

  it('итог: время по боссам, урон и отбивы в результате; лучший босс; Эло и личный рекорд считаются отдельно по дисциплине', () => {
    const l = lobby(); l.room.org.setDisc('boss'); l.room.sim.run(300); startRace(l); const { room, p1, p2, w1 } = l, { sim, org } = room;
    sim.run(1000);
    // Ива быстрее на первом и третьем боссе, Ярь — на втором и четвёртом; последний бой уходит только вместе с финишем
    const fin = (p: P, t: number[], bosses: Record<string, number>[]) => { const sp = t.map((x) => ({ rta: x, igt: x })); p.play.onFinish({ rta: t[3]!, igt: t[3]!, deaths: 0, splits: sp }, { dps: 1 }, 0, bosses); };
    const bs = (dmg: number[], par: number[]) => dmg.map((d, i) => ({ ch: i + 1, dmg: d, parries: par[i]!, taken: 0, stuns: 0, execs: 0, deaths: 0, fight: 1000 }));
    fin(p1, [20_000, 60_000, 80_000, 130_000], bs([100, 200, 150, 300], [1, 2, 3, 4])); sim.run(300); fin(p2, [25_000, 50_000, 90_000, 125_000], bs([90, 210, 140, 310], [0, 5, 1, 6])); sim.run(500);
    const r = org.S!.result!; expect(org.S!.phase).toBe('done'); expect(r.discipline).toBe('boss'); expect(r.settings.cat).toBe('boss');
    const a = r.players.find((p) => p.name === 'Ива')!, b = r.players.find((p) => p.name === 'Ярь')!;
    expect(a.bosses!.map((x) => x.ch)).toEqual([1, 2, 3, 4]); expect(b.bosses![3]!.parries).toBe(6);
    const pa = w1.S!.players.find((p) => p.name === 'Ива')!, pb = w1.S!.players.find((p) => p.name === 'Ярь')!, rows = bossRows('boss', pa, pb);
    expect(rows.map((x) => x.win)).toEqual(['a', 'b', 'a', 'b']); // 4-й босс: Ива 50 с против 35 с у Ярь
    expect(rows[0]!.d).toBe(-5000); expect(rows[1]!.ta).toBe(40_000); expect(rows[1]!.tb).toBe(25_000); expect(rows[3]!.ta).toBe(50_000); expect(rows[3]!.tb).toBe(35_000);
    expect(bestBoss(rows, 'a')).toBe(3); expect(bestBoss(rows, 'b')).toBe(2); // самый большой отрыв: у Ивы на Владике (20 с), у Ярь на Мише (15 с, при равенстве — первый)
    // Эло: отдельная таблица «boss», трейловой нет; рейтинг игроков на обложке результата
    const elo = computeElo(org.archive()); expect(Object.keys(elo.byDisc)).toEqual(['boss']); expect(elo.byDisc['boss']!.map((x) => x.name).sort()).toEqual(['Ива', 'Ярь']);
    expect(a.eloAfter).not.toBeNull(); expect(a.eloAfter! + b.eloAfter!).toBe(a.eloBefore! + b.eloBefore!);
    expect(ratingOf(elo, 'Ива', 'trail').rating).toBe(1000); expect(r.winner).toBe('Ярь'); expect(ratingOf(elo, 'Ярь', 'boss').rating).toBe(1020); expect(ratingOf(elo, 'Ива', 'boss').rating).toBe(980);
    // вторая гонка босс-раша: рекорд подставляется по дисциплине «boss», в «Тропе» его нет
    org.restart(); sim.run(500); p1.play.toggleReady(); p2.play.toggleReady(); sim.run(500); org.start(); sim.run(5000);
    expect(w1.S!.players.find((p) => p.name === 'Ива')!.pb!.t).toBe(130_000); expect(personalBest(org.archive(), 'Ива', 'trail')).toBeNull();
    expect(sumOfBest(w1.S!.players.find((p) => p.name === 'Ярь')!.pb)).toBe(125_000); // лучшие отрезки Ярь: 25, 25, 40, 35
  });
});
