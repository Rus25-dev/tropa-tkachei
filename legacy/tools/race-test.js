// Сквозная проверка «Гонок Ткачей» v1.8: организатор + два игрока + обсервер в отдельных страницах (свой localStorage у каждой),
// вместо WebRTC — транспорт-заглушка через Node (tools/lib-bridge.js: задержка, тихие обрывы, «смерть» организатора).
// Реальная сеть PeerJS/WebRTC здесь НЕ проверяется: для неё tools/race-real-test.js (нужен локальный сервер `npm run peer`).
// Запуск: node tools/race-test.js [--shots=папка]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const { Bridge, phaserSrc } = require('./lib-bridge.js');
const shots = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let errs = 0, fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ПРОВАЛ', m); } else console.log('ок   ', m); };
const INDEX = process.env.INDEX || path.resolve(__dirname, '../index.html');

const bridge = new Bridge({ lat: 25 });
let browser;
async function mkPage(ctx, name, opt) {
  opt = opt || {};
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc });
    if (u.startsWith('file://')) { if (opt.ver) { return r.fulfill({ contentType: 'text/html', body: fs.readFileSync(INDEX, 'utf8').replace(/const GAME_VERSION = '[^']+'/, `const GAME_VERSION = '${opt.ver}'`) }); } return r.continue(); }
    return r.fulfill({ status: 200, body: '' });
  });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', name, e.message, (e.stack || '').split('\n').slice(1, 4).join(' / ')); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('CONSOLE.ERR', name, m.text().slice(0, 200)); });
  await bridge.attach(page, name);
  await page.goto('file://' + INDEX);
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive() && window.__game.scene.getScene('menu').mStack);
  await page.evaluate(() => { Snd.play = () => { }; Music.play = () => { }; });
  await page.evaluate(ADVANCE_INSTALL);
  await page.evaluate(() => { window.__sp = (n) => RaceOrg.seatList().find((p) => p.name === n); });
  return page;
}
const ev = (p, f, a) => p.evaluate(f, a);
const until = async (p, f, ms, arg) => { try { await p.waitForFunction(f, arg, { timeout: ms || 15000, polling: 100 }); return true; } catch (_) { return false; } };
const shot = async (p, n) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await p.screenshot({ path: path.join(shots, n + '.png') }); } };

// форсированная победа над боссом и проход в следующий этап настоящими функциями игры. Читы записываются в журнал действиями
// (Journal.ext), иначе воспроизведение журнала не сможет их повторить — у живого игрока таких вмешательств нет.
const ADVANCE_INSTALL = `(() => {
  Journal.ext = {
    1: (sc) => { const p = sc.players[0];
      if (sc.vladik) { sc.vladik.hp = 1; sc.vladik.state = 'idle'; sc.damageVladik(p); }
      else if (sc.tima) { sc.tima.hp = 1; sc.tima.state = 'idle'; sc.damageTima(p); }
      else if (sc.misha) { sc.misha.hp = 1; sc.misha.hitCd = 0; sc.misha.state = 'idle'; sc.mishaBagHit({}); }
      else { sc.boss.hp = 1; sc.boss.state = 'idle'; sc.damageBoss(p); } },
    2: (sc) => { const p = sc.players[0]; p.x = sc.exitR.x + 4; p.y = sc.exitR.y + 20; p.vx = p.vy = 0; },
  };
  window.__advance = () => {
    const g = window.__game, sc = g.scene.getScene('game'), ui = g.scene.getScene('ui');
    if (!sc || !sc.sys.isActive() || !ui || !ui.ready || !sc.camp || sc.won || sc.leaving || sc.replaying || (Speedrun.run && (Speedrun.run.hold || Speedrun.run.tp != null))) return 'wait';
    const alive = sc.vladik ? sc.vladik.state !== 'dead' : sc.tima ? sc.tima.state !== 'dead' : sc.misha ? sc.misha.state !== 'dead' : !sc.bossDead;
    const act = (id) => { Journal.act(sc, 'ex', id); Journal.ext[id](sc); };
    if (alive && sc.camp.st !== 'road') { act(1); return 'kill'; }
    if (sc.exitR) { act(2); return 'exit'; }
    return 'wait';
  };
})()`;
const ADVANCE = 'window.__advance && window.__advance()';
async function playToEnd(p, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 120000)) {
    const done = await ev(p, () => { const u = window.__game.scene.getScene('ui'); return !!(u && u.srShown); });
    if (done) return true;
    await ev(p, ADVANCE); await sleep(350);
  }
  return false;
}
const org = (p) => p.evaluate(() => { const S = RaceOrg.S; return S && { phase: S.phase, code: S.code, id: S.id, seed: S.seed, goAt: S.goAt, pause: S.pause, players: RaceOrg.seatList().map((x) => ({ id: x.id, name: x.name, online: x.online, ready: x.ready, loaded: x.loaded, fin: !!x.fin, splits: x.splits.length, tel: !!x.tel })), events: S.events.length, status: RaceOrg.status }; });

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const mkCtx = () => browser.newContext({ viewport: { width: 1280, height: 720 } });
  const [cO, c1, c2, cW] = await Promise.all([mkCtx(), mkCtx(), mkCtx(), mkCtx()]);
  const O = await mkPage(cO, 'ORG'), P1 = await mkPage(c1, 'P1'), P2 = await mkPage(c2, 'P2'), W = await mkPage(cW, 'W');

  // ===== 1. комната и вход =====
  console.log('-- комната');
  await ev(O, () => RaceOrg.create());
  await until(O, () => RaceOrg.status === 'open', 8000);
  let s = await org(O);
  ok(s && s.phase === 'lobby' && /^[A-Z0-9]{5}$/.test(s.code) && s.status === 'open', 'организатор создал комнату: ' + (s && s.code));
  const code = s.code;
  ok(await ev(O, () => !!localStorage.getItem('tt_rc_org')), 'состояние комнаты записано в localStorage');
  await ev(P1, (c) => { RacePlay.open(c); RacePlay.join(c, 'Ива'); }, code);
  await ev(P2, (c) => { RacePlay.open(c); RacePlay.join(c, 'Ярь'); }, code);
  await ev(W, (c) => { RaceWatch.open(c); RaceWatch.join(c); }, code);
  ok(await until(O, () => RaceOrg.seatList().length === 2 && RaceOrg.seatList().every((p) => p.online), 10000), 'оба игрока вошли и в сети');
  ok(await until(W, () => RaceWatch.S && RaceWatch.S.players.length === 2, 10000), 'обсервер получил снимок гонки с двумя игроками');
  // третий игрок и дубль имени
  const P3 = await mkPage(await mkCtx(), 'P3');
  await ev(P3, (c) => { RacePlay.open(c); RacePlay.join(c, ' ива '); }, code);
  ok(await until(P3, () => RacePlay.S && RacePlay.S.status === 'denied', 8000) && /занято|два игрока/.test(await ev(P3, () => RacePlay.S.denied)), 'третий игрок отклонён: ' + await ev(P3, () => RacePlay.S.denied));
  await P3.context().close();
  const P4 = await mkPage(await mkCtx(), 'P4', { ver: '1.7-тест' });
  await ev(P4, (c) => { RacePlay.open(c); RacePlay.join(c, 'Другой'); }, code);
  ok(await until(P4, () => RacePlay.S && RacePlay.S.status === 'denied', 8000) && /версия/.test(await ev(P4, () => RacePlay.S.denied)), 'игрок с другой версией игры отклонён: ' + await ev(P4, () => RacePlay.S.denied));
  await P4.context().close();
  await shot(O, 'org-lobby');

  // ===== 2. готовность и старт =====
  console.log('-- старт');
  ok(!(await ev(O, () => RaceOrg.canStart())), 'без «Готов» старт недоступен');
  await ev(P1, () => document.getElementById('rcj-ready').click());
  await ev(P2, () => document.getElementById('rcj-ready').click());
  ok(await until(O, () => RaceOrg.canStart(), 8000), 'оба готовы — старт доступен');
  await shot(P1, 'player-lobby');
  await ev(O, () => RaceOrg.start());
  ok(await until(P1, () => Speedrun.run && Speedrun.run.rc && Speedrun.run.hold, 15000) && await until(P2, () => Speedrun.run && Speedrun.run.rc && Speedrun.run.hold, 15000), 'по команде «prep» у обоих запустился забег и герой ждёт');
  await Promise.all([P1, P2].map((p) => until(p, () => { const g = window.__game.scene.getScene('game'); return g && g.sys.isActive() && g.seed != null && Speedrun.run && Speedrun.run.rc; }, 10000)));
  const seeds = await Promise.all([P1, P2].map((p) => ev(p, () => window.__game.scene.getScene('game').seed)));
  ok(seeds[0] === seeds[1] && seeds[0] === (await org(O)).seed, 'у обоих общее зерно ' + seeds[0]);
  ok(await until(O, () => RaceOrg.S.phase === 'run', 20000), 'после «загружен» и отсчёта 3-2-1 организатор объявил «Пошёл»');
  ok(await until(P1, () => !Speedrun.run.hold, 5000) && await until(P2, () => !Speedrun.run.hold, 5000), 'у обоих игроков герой отпущен');
  const goDiff = await Promise.all([P1, P2].map((p) => ev(p, () => Speedrun.run.t0)));
  void goDiff;
  await sleep(1500);
  // ===== 3. телеметрия =====
  console.log('-- телеметрия');
  ok(await until(O, () => RaceOrg.seatList().every((p) => p.tel && p.tel.el > 0), 8000), 'организатор получает телеметрию обоих');
  if (process.env.DBG) console.log('DBGO', JSON.stringify(await ev(O, () => RaceOrg.seatList().map((p) => ({ id: p.id, tel: p.tel && Object.keys(p.tel).join(',').slice(0, 80), el: p.tel && p.tel.el, rtt: p.rtt })))));
  if (process.env.DBG) console.log('DBG', JSON.stringify(await ev(P1, () => ({ tele: RacePlay.S.tele, st: RacePlay.S.status, hold: Speedrun.run.hold, rc: !!Speedrun.run.rc, t0: Speedrun.run.t0, tick: window.__game.scene.getScene('game').tickN, upd: window.__game.loop.actualFps }))));
  ok(await until(W, () => Object.keys(RaceWatch.tel).length === 2, 8000), 'обсервер получает телеметрию обоих (пачками)');
  ok(await until(W, () => window.__game.scene.isActive('watch') && RaceWatch.scene && Object.keys(RaceWatch.scene.views).length === 2, 8000), 'сцена обсервера создала обе половины');
  await sleep(1200);
  const rate = await ev(W, () => { const a = RaceWatch.hist[1].length, t = (RaceWatch.hist[1][a - 1].at - RaceWatch.hist[1][0].at) / 1000; return a / Math.max(0.5, t); });
  ok(rate > 8 && rate < 25, 'частота телеметрии ≈ 15 Гц: ' + rate.toFixed(1));
  await shot(W, 'watch-run');
  await shot(P1, 'player-run');


  // ===== 4. события, обрыв связи игрока =====
  console.log('-- события и обрыв связи');
  const advanceUntil = async (p, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 60000)) { if (await ev(p, fn)) return true; await ev(p, ADVANCE); await sleep(350); } return false; };
  ok(await advanceUntil(P1, () => Speedrun.run.splits.length >= 1, 40000), 'игрок 1 убил Корнематку и получил первый сплит');
  const gotSplit = await until(O, () => __sp('Ива').splits.length === 1, 6000);
  if (!gotSplit) {
    console.log('   DBG org', JSON.stringify(await ev(O, () => ({ phase: RaceOrg.S.phase, ev: RaceOrg.S.events.slice(-6).map((e) => e.k + ':' + (e.x || '')), seats: RaceOrg.seatList().map((p) => ({ id: p.id, on: p.online, sp: p.splits })), hub: [...RaceOrg.hub.seats.values()].map((s) => ({ id: s.id, on: s.online, inN: s.inN, sid: s.sid })) }))));
    console.log('   DBG P1', JSON.stringify(await ev(P1, () => { const c = RacePlay.S.client; return { st: c.status, n: c.n, out: c.outbox.length, sid: c.sid, splits: Speedrun.run.splits.length, hold: Speedrun.run.hold, rc: !!Speedrun.run.rc, done: Speedrun.run.done }; })));
  }
  ok(gotSplit, 'организатор получил сплит игрока 1');
  ok(await until(W, () => RaceWatch.feed.some((e) => e.k === 'split' && /Ива/.test(e.x)), 6000), 'лента обсервера показала сплит: ' + (await ev(W, () => (RaceWatch.feed.filter((e) => e.k === 'split').pop() || {}).x)));
  bridge.cutPage(P1); // у игрока 1 пропал интернет
  const adv2 = await advanceUntil(P1, () => Speedrun.run.splits.length >= 2, 40000);
  if (!adv2) console.log('   DBG P1', JSON.stringify(await ev(P1, () => { const sc = window.__game.scene.getScene('game'); return { ch: sc.camp && sc.camp.ch, st: sc.camp && sc.camp.st, won: sc.won, leaving: sc.leaving, boss: sc.bossDead, tick: sc.tickN, paused: sc.paused, hold: Speedrun.run.hold, sp: Speedrun.run.splits.length, ui: window.__game.scene.getScene('ui').ready, act: sc.sys.isActive(), exit: !!sc.exitR }; })));
  ok(adv2, 'без связи игрок 1 продолжает играть локально и берёт второй сплит');
  await sleep(9000);
  ok(await ev(O, () => !__sp('Ива').online) && await ev(O, () => RaceOrg.S.events.some((e) => e.k === 'off' && e.s === __sp('Ива').id)), 'организатор заметил обрыв игрока 1 (≈7 с тишины)');
  ok(await ev(O, () => __sp('Ива').splits.length) === 1, 'второй сплит пока не дошёл (связи нет)');
  const pend = await ev(P1, () => RacePlay.S.client.pending());
  ok(pend >= 1, 'события копятся в очереди игрока: ' + pend);
  ok(await ev(P1, () => !!Speedrun.rivalInfo() && /потеряна/.test(Speedrun.rivalInfo().text)), 'игрок видит на табличке: связь потеряна, играем локально');
  bridge.healPage(P1);
  ok(await until(O, () => __sp('Ива').online && __sp('Ива').splits.length === 2, 20000), 'связь вернулась сама: второй сплит доставлен организатору');
  const nsp = await ev(O, () => RaceOrg.S.events.filter((e) => e.k === 'split' && e.s === __sp('Ива').id && e.i === 1).length);
  ok(nsp === 1, 'сплит дошёл ровно один раз: ' + nsp);
  ok(await until(P1, () => RacePlay.S.client.pending() === 0, 5000), 'очередь игрока пуста после досылки');
  ok(await until(W, () => RaceWatch.feed.some((e) => e.k === 're' && /Ива/.test(e.x)), 6000), 'обсервер видит «связь восстановлена»');

  // ===== 5. техническая пауза =====
  console.log('-- техническая пауза');
  await ev(O, () => RaceOrg.techPause());
  ok(await until(P2, () => Speedrun.run.tp != null && window.__game.scene.getScene('game').paused, 6000) && await until(P1, () => Speedrun.run.tp != null, 6000), 'оба игрока остановлены технической паузой');
  const r1 = await ev(P2, () => Speedrun.rta()); await sleep(1500); const r2 = await ev(P2, () => Speedrun.rta());
  ok(Math.abs(r2 - r1) < 60, 'время игрока в паузе не идёт: ' + Math.round(r2 - r1) + ' мс за 1,5 с');
  ok(await until(W, () => RaceWatch.S.pause.on, 4000), 'обсервер знает о паузе');
  await ev(O, () => RaceOrg.undo());
  ok(await until(P2, () => Speedrun.run.tp == null && !window.__game.scene.getScene('game').paused, 6000), '«Отменить действие» снимает паузу');
  const r3 = await ev(P2, () => Speedrun.rta()); await sleep(800); const r4 = await ev(P2, () => Speedrun.rta());
  ok(r4 - r3 > 600, 'после паузы время идёт дальше');
  ok(await ev(O, () => RaceOrg.S.pause.total) > 1000, 'организатор учёл паузу: ' + await ev(O, () => RaceOrg.S.pause.total) + ' мс');

  // ===== 6. игрок 2: «упала вкладка» — восстановление по журналу =====
  console.log('-- восстановление игрока по журналу');
  ok(await advanceUntil(P2, () => Speedrun.run.splits.length >= 1, 40000), 'игрок 2 взял первый сплит');
  await sleep(2500); // журнал сохраняется раз в ~2 с
  const before = await ev(P2, () => { const sc = window.__game.scene.getScene('game'), r = Speedrun.run; return { ch: sc.camp.ch, st: sc.camp.st, splits: r.splits.length, igt: Math.round(r.igt), journal: !!localStorage.getItem('tt_jr'), len: (localStorage.getItem('tt_jr') || '').length }; });
  ok(before.journal && before.len > 200, 'журнал забега лежит в localStorage: ' + before.len + ' байт');
  const ctx2 = P2.context(); bridge.killPage(P2, 1500); await P2.close(); // вкладка пропала без прощания
  await sleep(500);
  const P2b = await mkPage(ctx2, 'P2b');
  const rest = await until(P2b, () => Speedrun.run && Speedrun.run.rc && Speedrun.run.restored === 1 && !Journal.rp, 40000);
  if (!rest) console.log('   DBG P2b', JSON.stringify(await ev(P2b, () => ({ sess: localStorage.getItem('tt_rc_play'), name: localStorage.getItem('tt_sr_name'), S: RacePlay.S && { st: RacePlay.S.status, phase: RacePlay.S.state && RacePlay.S.state.phase, seat: RacePlay.S.seat, den: RacePlay.S.denied }, info: (() => { const i = Journal.info(); return i && { ok: i.ok, why: i.why, race: i.race, ticks: i.ticks }; })(), err: Journal.error, rp: !!Journal.rp, run: !!Speedrun.run, ov: document.getElementById('rc-join') && !document.getElementById('rc-join').hidden }))));
  ok(rest, 'новая вкладка сама восстановила забег по журналу (restored=1)');
  const after = await ev(P2b, () => { const sc = window.__game.scene.getScene('game'), r = Speedrun.run; return { ch: sc.camp.ch, st: sc.camp.st, splits: r.splits.length, igt: Math.round(r.igt), paused: sc.paused, hold: r.hold, rta: Math.round(Speedrun.rta()) }; });
  ok(after.ch === before.ch && after.splits === before.splits && after.igt >= before.igt - 3000 && !after.hold && !after.paused, 'глава, сплиты и IGT восстановлены, гонка идёт без паузы: ' + JSON.stringify(after));
  const igtChk = await ev(P2b, () => { const J = Journal.J, r = Speedrun.run, rel = J.segs[0].acts.find((a) => a[1] === 'rel'), ticks = J.segs.reduce((a, g) => a + g.n, 0); const paused = (J.pauses || []).reduce((a, q) => a + ((q[1] || Date.now()) - q[0]), 0); /* ticks в технической паузе в IGT не идут */ return { igt: Math.round(r.igt), exp: Math.round((ticks - (rel ? rel[0] : 0)) * 1000 / 60 - paused) }; });
  ok(Math.abs(igtChk.igt - igtChk.exp) < 400, 'IGT восстановленного игрока равен тиковому (без «лишнего» удержания): ' + igtChk.igt + ' vs ' + igtChk.exp + ' мс');
  const gotRest = await until(O, () => RaceOrg.S.events.some((e) => e.k === 'restored'), 8000);
  if (!gotRest) console.log('   DBG restored', JSON.stringify(await ev(P2b, () => ({ n: RacePlay.S.client.n, out: RacePlay.S.client.outbox.length, st: RacePlay.S.client.status }))), JSON.stringify(await ev(O, () => RaceOrg.S.events.slice(-4).map((e) => e.k))));
  ok(gotRest, 'организатор получил отметку «забег восстановлен»');
  ok(await until(O, () => __sp('Ярь').online, 10000), 'игрок 2 снова в сети на своём месте');
  const rtaChk = await ev(P2b, () => Speedrun.rta());
  const orgEl = await ev(O, () => RaceOrg.elapsed());
  ok(Math.abs(rtaChk - orgEl) < 4000, 'время игрока после восстановления сходится с часами организатора: ' + Math.round(rtaChk) + ' vs ' + Math.round(orgEl) + ' мс');
  const P2n = P2b;

  // ===== 7. перезагрузка организатора =====
  console.log('-- перезагрузка организатора');
  const stBefore = await org(O);
  await sleep(700); // дать сохраниться состоянию
  bridge.killPage(O, 6000); await O.close();
  await sleep(500);
  const O2 = await mkPage(cO, 'O2');
  await ev(O2, () => RaceOrg.resume());
  ok(await until(O2, () => RaceOrg.status === 'open', 25000), 'организатор после перезагрузки поднял комнату с тем же кодом ' + stBefore.code + ' (после освобождения старого id)');
  const st2 = await org(O2);
  ok(st2.code === stBefore.code && st2.phase === 'run' && st2.goAt === stBefore.goAt && st2.id === stBefore.id, 'ход гонки восстановлен: фаза «идёт», тот же старт и номер гонки');
  ok(await until(O2, () => RaceOrg.seatList().length === 2 && RaceOrg.seatList().every((p) => p.online), 30000), 'оба игрока вернулись на свои места сами');
  ok(await until(W, () => RaceWatch.connStatus === 'online', 30000), 'обсервер переподключился сам');
  const spl = await ev(O2, () => [__sp('Ива').splits.length, __sp('Ярь').splits.length]);
  ok(spl[0] === 2 && spl[1] >= 1, 'сплиты игроков не потеряны (' + spl.join('+') + ')');

  // ===== 8. финиш и результат =====
  console.log('-- финиш');
  const [d1, d2] = await Promise.all([playToEnd(P1, 150000), playToEnd(P2n, 150000)]);
  ok(d1 && d2, 'оба игрока дошли до итогового экрана');
  ok(await until(O2, () => RaceOrg.S.phase === 'done' && RaceOrg.S.result, 20000), 'организатор собрал результат гонки');
  const res = await ev(O2, () => RaceOrg.S.result);
  ok(res && res.players.length === 2 && res.players.every((p) => !p.dnf && p.time > 0 && p.splits.length === 4 && p.stats), 'в результате оба финиша: время, 4 сплита, статистика');
  ok(res.winner && res.winner !== 'draw' && res.players[0].place === 1 && res.players[0].time <= res.players[1].time, 'победитель — самое быстрое время: ' + res.winner + ' ' + res.players.map((p) => p.name + ' ' + p.time).join(' / '));
  ok(res.version === await ev(O2, () => GAME_VERSION) && res.seed === stBefore.seed && res.discipline === 'trail' && Array.isArray(res.events) && res.id === stBefore.id, 'формат результата: версия, зерно, дисциплина, события, id');
  const arch = await ev(O2, () => RaceOrg.archive());
  ok(arch.length === 1 && arch[0].id === res.id, 'гонка записана в архив');
  ok(await until(W, () => RaceWatch.S.phase === 'done' && (RaceWatch.S.result || RaceWatch.resultLite), 8000), 'обсервер получил итог и показывает разбор');
  const stats = await ev(O2, () => RaceOrg.seatList().map((p) => p.fin.stats));
  ok(stats.every((x) => x && x.swings >= 0 && 'dps' in x && 'acc' in x && 'buys' in x && 'ph' in x), 'статистика: ' + JSON.stringify(stats[0]).slice(0, 140));
  const bn = await Promise.all([P1, P2n].map((p) => ev(p, () => Speedrun.raceBanner())));
  if (process.env.DBG) console.log('DBGB', JSON.stringify(await Promise.all([P1, P2n].map((p) => ev(p, () => ({ seat: RacePlay.S.seat, res: RacePlay.S.res, fin: RacePlay.S.fin, res2: Speedrun.run.result && Speedrun.run.result.rta }))))), JSON.stringify(await ev(O2, () => RaceOrg.S.events.map((e) => e.k).join(','))));
  ok(bn.every((b) => b && /ПОБЕДА|ПОРАЖЕНИЕ/.test(b.text)) && bn[0].text !== bn[1].text, 'у игроков на экране итога баннер (у победителя и проигравшего разные): ' + bn.map((b) => b && b.text).join(' / '));
  await shot(W, 'watch-done'); await shot(O2, 'org-done'); await shot(P1, 'player-done');
  const dl = await ev(O2, () => JSON.stringify({ races: RaceOrg.archive() }));
  ok(JSON.parse(dl).races.length === 1, 'races.json формируется из архива');


  // ===== 9. переигровка, присуждение победы, отмена действия и гонки =====
  console.log('-- переигровка, присуждение, отмена');
  const seed1 = (await org(O2)).seed;
  await ev(O2, () => RaceOrg.restart());
  ok(await until(O2, () => RaceOrg.S.phase === 'lobby' && RaceOrg.seatList().every((p) => !p.ready && !p.fin), 6000) && (await org(O2)).seed !== seed1, '«Переиграть»: комната в ожидании, готовность сброшена, зерно новое');
  ok(await until(P1, () => !Speedrun.run && document.getElementById('rc-join') && !document.getElementById('rc-join').hidden, 12000) && await until(P2n, () => !Speedrun.run, 12000), 'игроки вернулись из забега в комнату ожидания');
  await ev(P1, () => document.getElementById('rcj-ready').click()); await ev(P2n, () => document.getElementById('rcj-ready').click());
  ok(await until(O2, () => RaceOrg.canStart(), 8000), 'второй раунд: оба готовы');
  await ev(O2, () => RaceOrg.start());
  ok(await until(O2, () => RaceOrg.S.phase === 'run', 40000), 'второй раунд идёт');
  await ev(O2, () => RaceOrg.award(2));
  ok(await until(O2, () => RaceOrg.S.phase === 'done' && RaceOrg.S.result && RaceOrg.S.result.awarded && RaceOrg.S.result.winnerSeat === 2, 6000), '«Присудить победу» игроку 2: результат помечен «присуждено»');
  ok((await ev(O2, () => RaceOrg.archive())).length === 2, 'присуждённая гонка попала в архив');
  ok(await until(P1, () => RacePlay.S.res && RacePlay.S.res.awarded, 6000) && await ev(P1, () => !!Speedrun.run && !Speedrun.run.done), 'игроки получили итог, а их забеги не оборваны');
  await ev(O2, () => RaceOrg.undo());
  ok(await until(O2, () => RaceOrg.S.phase === 'run' && !RaceOrg.S.result, 6000) && (await ev(O2, () => RaceOrg.archive())).length === 1, '«Отменить действие» откатило присуждение: гонка снова идёт, архив вернулся к одной записи');
  await ev(O2, () => RaceOrg.cancel());
  ok(await until(O2, () => RaceOrg.S.phase === 'lobby', 6000) && await until(P1, () => !Speedrun.run, 12000), '«Отменить гонку»: все в комнате ожидания, ничего лишнего в архиве');
  ok((await ev(O2, () => RaceOrg.archive())).length === 1, 'отменённая гонка в архив не попала');

  // ===== 10. обсервер при скрытом окне =====
  console.log('-- обсервер в скрытом окне');
  await ev(W, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')); });
  await ev(P1, () => document.getElementById('rcj-ready').click()); await ev(P2n, () => document.getElementById('rcj-ready').click());
  await until(O2, () => RaceOrg.canStart(), 8000);
  await ev(O2, () => RaceOrg.start());
  ok(await until(O2, () => RaceOrg.S.phase === 'run', 40000), 'третий раунд идёт, пока окно обсервера «скрыто»');
  await sleep(3000);
  ok(await ev(W, () => document.hidden && RaceWatch.S.phase === 'run' && Object.values(RaceWatch.tel).every((t) => performance.now() - t.at < 1500)), 'скрытый обсервер продолжает получать состояние и телеметрию');
  ok(await ev(W, () => !window.__game.isPaused && window.__game.scene.isActive('watch')), 'игровой цикл обсервера не поставлен на паузу');
  const clk1 = await ev(W, () => RaceWatch.clockMs()); await sleep(1200); const clk2 = await ev(W, () => RaceWatch.clockMs());
  ok(clk2 - clk1 > 900, 'табло продолжает считать время: +' + Math.round(clk2 - clk1) + ' мс за 1,2 с');

  console.log(`итого: ошибок страниц ${errs}, провалов ${fails}`);
  await browser.close();
  process.exit(errs || fails ? 1 : 0);
})().catch(async (e) => { console.log('СБОЙ ТЕСТА', e && e.stack || e); try { await browser.close(); } catch (_) { } process.exit(2); });
