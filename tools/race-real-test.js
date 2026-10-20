// Гонка по НАСТОЯЩЕМУ WebRTC: PeerJS-клиент из node_modules и локальный сервер-знакомитель (пакет «peer», порт 9000, ссылка ?peer=localhost:9000).
// Организатор, два игрока и обсервер — четыре отдельные страницы Chrome (свой localStorage). Проверяется: вход по коду, готовность, старт, общее зерно,
// телеметрия через DataChannel, разрыв реального соединения и автоматический возврат, перезагрузка страницы организатора (тот же код комнаты).
// Запуск: node tools/race-real-test.js   (CHROME — путь к Chrome). Интернет не нужен: всё идёт через localhost.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const { PeerServer } = require('peer');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const peerSrc = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let errs = 0, fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ПРОВАЛ', m); } else console.log('ок   ', m); };
const INDEX = path.resolve(__dirname, '../index.html'), PORT = 9000 + Math.floor(Math.random() * 500);
const Q = `peer=localhost:${PORT}`;
const until = async (p, f, ms, arg) => { try { await p.waitForFunction(f, arg, { timeout: ms || 15000, polling: 100 }); return true; } catch (_) { return false; } };

(async () => {
  const server = PeerServer({ port: PORT, path: '/', allow_discovery: false });
  // WebRTC на localhost: отключаем mDNS-маскировку адресов, иначе headless Chrome не находит кандидатов
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (name, query, name2) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(); page.setDefaultTimeout(30000);
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.includes('peerjs.min.js')) return r.fulfill({ contentType: 'application/javascript', body: peerSrc }); if (u.startsWith('file://') || u.includes('localhost')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', name, e.message); });
    page.on('console', (m) => { if (process.env.DBG && /error|warn/.test(m.type())) console.log('  CONSOLE', name, m.text().slice(0, 160)); });
    if (name2) await page.addInitScript((n) => { try { localStorage.setItem('tt_sr_name', n); } catch (_) { } }, name2);
    await page.goto('file://' + INDEX + '?' + Q + query);
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive() && window.__game.scene.getScene('menu').mStack);
    await page.evaluate(() => { Snd.play = () => { }; Music.play = () => { }; });
    return page;
  };
  try {
    const O = await mk('ORG', '&race=org');
    ok(await until(O, () => typeof RaceOrg !== 'undefined' && RaceOrg.S && RaceOrg.status === 'open', 20000), 'организатор создал комнату на настоящем PeerJS-сервере');
    const code = await O.evaluate(() => RaceOrg.S.code);
    const P1 = await mk('P1', `&race=play&room=${code}`, 'Ива'), P2 = await mk('P2', `&race=play&room=${code}`, 'Ярь'), W = await mk('W', `&race=watch&room=${code}`);
    const joined = await until(O, () => RaceOrg.seatList().length === 2 && RaceOrg.seatList().every((p) => p.online), 30000);
    if (!joined) console.log('   DBG P1', JSON.stringify(await P1.evaluate(() => ({ s: RacePlay.S && { st: RacePlay.S.status, den: RacePlay.S.denied, cs: RacePlay.S.client && RacePlay.S.client.status, at: RacePlay.S.client && RacePlay.S.client.attempt }, name: Speedrun.myName(), url: location.search, join: !document.getElementById('rc-join').hidden }))), JSON.stringify(await O.evaluate(() => RaceOrg.status)));
    ok(joined, 'оба игрока вошли по ссылке и соединились по WebRTC');
    ok(await until(W, () => RaceWatch.S && RaceWatch.S.players.length === 2, 20000), 'обсервер получил снимок гонки');
    await P1.evaluate(() => document.getElementById('rcj-ready').click()); await P2.evaluate(() => document.getElementById('rcj-ready').click());
    ok(await until(O, () => RaceOrg.canStart(), 10000), 'оба готовы');
    await O.evaluate(() => RaceOrg.start());
    ok(await until(O, () => RaceOrg.S.phase === 'run', 40000), 'старт: загрузка, отсчёт и «Пошёл» по реальной сети');
    await sleep(2500);
    ok(await until(O, () => RaceOrg.seatList().every((p) => p.tel && p.tel.el > 0), 8000) && await until(W, () => Object.keys(RaceWatch.tel).length === 2, 8000), 'телеметрия обоих доходит организатору и обсерверу через DataChannel');
    const rtt = await O.evaluate(() => RaceOrg.seatList().map((p) => Math.round(p.rtt || 0)));
    console.log('   пинги (мс):', rtt.join(', '));
    const seeds = await Promise.all([P1, P2].map((p) => p.evaluate(() => window.__game.scene.getScene('game').seed)));
    ok(seeds[0] === seeds[1], 'у игроков общее зерно');

    // разрыв реального соединения игрока 1: закрываем DataChannel и сам Peer
    await P1.evaluate(() => { const c = RacePlay.S.client; c.conn && c.conn.close(); });
    ok(await until(O, () => RaceOrg.S.events.some((e) => e.k === 'bye' || e.k === 'off'), 8000), 'организатор заметил разрыв');
    ok(await until(O, () => RaceOrg.seatList()[0].online, 30000), 'игрок вернулся на то же место сам');
    ok(await until(P1, () => RacePlay.S.client.status === 'online' && RacePlay.S.client.pending() === 0, 15000), 'у игрока снова связь, очередь пуста');

    // перезагрузка страницы организатора: код тот же, игроки и обсервер переподключаются
    const before = await O.evaluate(() => ({ code: RaceOrg.S.code, goAt: RaceOrg.S.goAt, id: RaceOrg.S.id }));
    await sleep(800); await O.reload();
    await O.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
    ok(await until(O, () => typeof RaceOrg !== 'undefined' && RaceOrg.S && RaceOrg.status === 'open', 40000), 'организатор после перезагрузки снова на сервере');
    const after = await O.evaluate(() => ({ code: RaceOrg.S.code, goAt: RaceOrg.S.goAt, id: RaceOrg.S.id, phase: RaceOrg.S.phase }));
    ok(after.code === before.code && after.goAt === before.goAt && after.id === before.id && after.phase === 'run', 'тот же код, старт и ход гонки: ' + JSON.stringify(after));
    ok(await until(O, () => RaceOrg.seatList().length === 2 && RaceOrg.seatList().every((p) => p.online), 40000), 'игроки вернулись сами');
    ok(await until(W, () => RaceWatch.connStatus === 'online' && Object.values(RaceWatch.tel).every((t) => performance.now() - t.at < 3000), 40000), 'обсервер снова получает телеметрию');
  } catch (e) { fails++; console.log('СБОЙ ТЕСТА', e && e.stack || e); }
  await browser.close(); try { server.close && server.close(); } catch (_) { }
  console.log('ошибок страниц:', errs, 'провалов:', fails);
  process.exit(errs || fails ? 1 : 0);
})();
