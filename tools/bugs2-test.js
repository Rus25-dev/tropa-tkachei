// Регрессии сетевых багов (список после проверки 1.5). Запуск: NODE_PATH=... node tools/bugs2-test.js
// WebRTC здесь нет: гость и хост — отдельные сцены в одной странице, Net.send перехвачен, соединение — объект-заглушка с on/send/close.
// Реальная сеть PeerJS/WebRTC не проверяется. Код выхода 1 при ошибках страницы или проваленных проверках.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let errs = 0, fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ПРОВАЛ', m); } else console.log('ок   ', m); };

async function newPage(browser) {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('crash', () => console.log('PAGE CRASH')); page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  await page.evaluate(() => {
    window.__snd = []; Snd.play = (n) => { window.__snd.push(n); }; Music.play = () => { };
    // заглушка соединения: всё отправленное копится в conn.sent
    window.fakeConn = () => { const h = {}, c = { open: true, sent: [], on(e, f) { h[e] = f; }, send(m) { c.sent.push(m); }, close() { c.open = false; }, fire(e, d) { h[e] && h[e](d); } }; return c; };
    window.startGame = async (data, stopLoop = true) => {
      const g = window.__game; g.scene.stop('menu'); g.scene.start('game', data);
      await new Promise((r) => setTimeout(r, 900));
      const sc = g.scene.getScene('game'); if (stopLoop) g.loop.stop();
      sc.sent = []; sc.sendEv = (o) => { sc.sent.push(o); };
      return sc;
    };
  });
  return page;
}
// все сцены создаются заново на каждую проверку: свежая страница
async function scene(browser, data) {
  const page = await newPage(browser);
  await page.evaluate(async (d) => { window.sc = await window.startGame(d); }, data);
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  // ---- 1. Плащ-парус: подобрал гость ----
  {
    const G = await scene(browser, { players: 2, online: 'guest', mode: 'story', boss: 'misha' });
    const g = await G.evaluate(() => {
      const it = sc.items.find((q) => q.ability === 'double'); const had = !!it; const p = sc.players[1];
      p.x = it.px - 7; p.y = it.py - 13; sc.stepItems();
      return { had, abil: !!sc.abil.double, left: sc.items.length, ev: sc.sent.filter((e) => e.k === 'abil' && e.a === 'double').length, saved: !!(Settings.progress() && Settings.progress().abil && Settings.progress().abil.double) };
    });
    ok(g.had && g.abil && g.left === 0 && g.ev === 1, 'плащ: гость подобрал — у него способность, предмет убран, хосту ушло событие abil');
    ok(!g.saved, 'плащ: гость не затирает своё сохранение');
    await G.close();
    const H = await scene(browser, { players: 2, online: 'host', mode: 'story', boss: 'misha' });
    const h = await H.evaluate(() => {
      sc.onEv({ k: 'abil', a: 'double' });
      return { abil: !!sc.abil.double, left: sc.items.filter((q) => q.ability === 'double').length, saved: !!(Settings.progress() && Settings.progress().abil && Settings.progress().abil.double), camp: Campaign.snap(sc).abil.double === true };
    });
    ok(h.abil && h.left === 0 && h.saved && h.camp, 'плащ: хост получил способность, предмет убран, прогресс сохранён и попадает в снимок главы');
    await H.close();
    // и наоборот: подобрал хост — гость узнаёт
    const H2 = await scene(browser, { players: 2, online: 'host', mode: 'story', boss: 'misha' });
    const ev = await H2.evaluate(() => { const it = sc.items.find((q) => q.ability === 'double'); const p = sc.players[0]; p.x = it.px - 7; p.y = it.py - 13; sc.stepItems(); return sc.sent.filter((e) => e.k === 'abil'); });
    ok(ev.length === 1, 'плащ: подобрал хост — гостю ушло событие abil');
    await H2.close();
    const G2 = await scene(browser, { players: 2, online: 'guest', mode: 'story', boss: 'misha' });
    const g2 = await G2.evaluate((e) => { sc.onEv(e); return { abil: !!sc.abil.double, left: sc.items.filter((q) => q.ability === 'double').length }; }, ev[0] || {});
    ok(g2.abil && g2.left === 0, 'плащ: гость по событию получил способность, предмет с карты исчез');
    await G2.close();
  }

  // ---- 2. Корни у гостя ----
  {
    const G = await scene(browser, { players: 2, online: 'guest', mode: 'bosstest', boss: 'misha' });
    const r = await G.evaluate(() => {
      const idx = NET_KINDS.indexOf('rootspike'), snap = (d) => ({ e: [], b: [0, 0, 1, 10, 10, 'idle', 0, 0, null], pr: [[idx, 400, 300, 0, 0, d, '']], bd: [], bc: 0, g: [], bD: 0, rs: [0, 0] });
      sc.applySnap(snap(0));
      const q = sc.projs.find((u) => u.kind === 'rootspike');
      const life0 = q.life;
      for (let i = 0; i < 5; i++) sc.netSmooth(0.016);
      const calls = []; const o = sc.fx.fillTriangle; sc.fx.fillTriangle = function (...a) { calls.push(a); return o.apply(this, a); };
      sc.drawExtraProjs(1); sc.fx.fillTriangle = o;
      const t = calls[0]; // основной треугольник шипа: (x1,y1,x2,y2,apexX,apexY)
      sc.applySnap(snap(0)); const kept = sc.projs[0].life;
      return { life0, apexUp: t && t[5] < t[1], life: q.life, kept };
    });
    ok(r.life0 <= 0.55 && r.apexUp, 'корни: у гостя вершина шипа выше основания (не вниз сквозь пол)');
    ok(r.life < r.life0 && r.kept < r.life0, 'корни: рост шипа у гостя идёт по времени и не сбрасывается новым снимком');
    await G.close();
  }

  // ---- 3. Хост в коконе, гость отключился ----
  {
    const H = await scene(browser, { players: 2, online: 'host', mode: 'bosstest', boss: 'misha' });
    const r = await H.evaluate(() => {
      Net.conn = fakeConn(); Net.lastRecv = performance.now();
      sc.players[0].downed = true; sc.players[0].hp = 0; // хост в коконе, гость жив
      sc.onPeerLost();
      return { wiping: sc.wiping, online: sc.online, n: sc.players.length };
    });
    ok(r.wiping && !r.online && r.n === 1, 'кокон: гость отключился — хост не завис в коконе, нить оборвалась (teamWipe)');
    await H.evaluate(() => { const g = window.__game; for (let i = 0; i < 160; i++) g.step(10000 + i * 16.667, 16.667); });
    ok(await H.evaluate(() => !sc.wiping && !sc.players[0].downed && sc.players[0].hp > 0), 'кокон: после обрыва хост возродился');
    await H.close();
    const H2 = await scene(browser, { players: 2, online: 'host', mode: 'bosstest', boss: 'misha' });
    ok(await H2.evaluate(() => { Net.conn = fakeConn(); sc.onPeerLost(); return !sc.wiping && sc.players.length === 1; }), 'кокон: хост на ногах — обрыва нити нет, игра продолжается');
    await H2.close();
  }

  // ---- 4. Отбив гостя и стойка босса ----
  {
    const G = await scene(browser, { players: 2, online: 'guest', mode: 'bosstest', boss: 'misha' });
    const g = await G.evaluate(() => {
      const b = sc.boss; b.state = 'idle'; b.hp = 20; const p = sc.players[1]; p.x = b.x + 20; p.y = b.y + 10;
      sc.toasts = []; sc.ui().toast = (m) => sc.toasts.push(m);
      sc.parrySuccess(p, b.x);
      sc.poiseAdd(b, 99); // даже прямой вызов у гостя ничего не считает
      return { poise: b.poise || 0, stag: b.stagger || 0, toast: sc.toasts.filter((m) => /Оглушён/.test(m)).length, ev: sc.sent.filter((e) => e.k === 'parrypoise') };
    });
    ok(g.poise === 0 && g.stag === 0 && g.toast === 0, 'отбив: у гостя стойка не считается и ложного «Оглушён!» нет');
    ok(g.ev.length === 1, 'отбив: гость шлёт хосту событие parrypoise');
    await G.close();
    const H = await scene(browser, { players: 2, online: 'host', mode: 'bosstest', boss: 'misha' });
    const h = await H.evaluate((ev) => {
      const b = sc.boss; b.state = 'idle'; b.hp = 20; b.poise = 0; b.stagger = 0; sc.onEv(ev);
      const a = b.poise; sc.onEv(ev); sc.onEv(ev);
      return { a, stag: b.stagger };
    }, g.ev[0] || {});
    ok(h.a === 3 || h.stag > 0, 'отбив: хост копит стойку от отбива гостя (+3)');
    ok(h.stag > 0, 'отбив: несколько отбивов гостя оглушают босса у хоста');
    await H.close();
  }

  // ---- 5 и 6. Удар хоста глазами гостя ----
  {
    const G = await scene(browser, { players: 2, online: 'guest', mode: 'bosstest', boss: 'vladik' });
    const r = await G.evaluate(() => {
      const b = sc.vladik; b.state = 'idle'; const out = {};
      const swing = (p) => { p.x = b.x + 8; p.y = b.y + 10; p.face = 1; p.atkDir = 'f'; p.atkT = 0.2; p.atkHits = new Set(); p.heavy = false; window.__snd.length = 0; sc.hitstop = 0; sc.resolveAttack(p); return { hs: sc.hitstop, hit: window.__snd.filter((n) => n === 'hit').length, touched: p.atkHits.has(b), snd: window.__snd.join() }; };
      out.remote = swing(sc.players[0]);
      out.local = swing(sc.players[1]);
      // события cut: вокруг игрока кладём букву
      const cuts = (p) => { sc.projs = [{ kind: 'letter', x: p.x + 20, y: p.y + 6, w: 22, h: 26, vx: 0, vy: 0, life: 3 }]; p.atkHits = new Set(); p.atkT = 0.2; p.atkDir = 'f'; p.face = 1; sc.sent.length = 0; b.state = 'intro'; sc.resolveAttack(p); b.state = 'idle'; return sc.sent.filter((e) => e.k === 'cut').length; };
      out.cutRemote = cuts(sc.players[0]);
      out.cutLocal = cuts(sc.players[1]);
      return out;
    });
    ok(r.remote.touched && r.remote.hs === 0 && r.remote.hit === 0, 'удар хоста у гостя: нет hitstop и нет второго звука «hit» (его присылает сам хост)');
    if (!(r.local.touched && r.local.hs > 0 && r.local.hit === 1)) console.log(JSON.stringify(r.local));
    ok(r.local.touched && r.local.hs > 0 && r.local.hit === 1, 'удар самого гостя: зависание кадра и звук остались');
    ok(r.cutRemote === 0, 'взмах хоста по буквам: гость не дублирует событие cut');
    ok(r.cutLocal === 1, 'взмах самого гостя по буквам: событие cut уходит хосту один раз');
    await G.close();
  }

  // ---- 7 и 8. Жизненный цикл сети ----
  {
    let P = await newPage(browser);
    await P.evaluate(() => {
      // поддельный PeerJS: события вызываем руками
      window.peers = [];
      window.Peer = class { constructor(id) { this.id = id; this.h = {}; this.destroyed = false; window.peers.push(this); } on(e, f) { this.h[e] = f; } fire(e, d) { this.h[e] && this.h[e](d); } connect() { const c = fakeConn(); return c; } destroy() { this.destroyed = true; } reconnect() { } };
    });
    // 8: прощание
    const b8 = await P.evaluate(() => {
      const c = fakeConn(); Net.role = 'guest'; Net.bind(c);
      let lost = 0; Net.onClose = () => lost++;
      c.fire('data', { t: 'bye' });
      const byeRecv = lost === 1 && Net.conn === null;
      const c2 = fakeConn(); Net.bind(c2);
      window.dispatchEvent(new Event('pagehide'));
      const sentOnHide = c2.sent.some((m) => m.t === 'bye');
      const c3 = fakeConn(); Net.bind(c3); Net.close();
      return { byeRecv, sentOnHide, sentOnClose: c3.sent.some((m) => m.t === 'bye'), cleared: Net.onClose === null && Net.cb === null && Net.conn === null };
    });
    ok(b8.byeRecv, 'прощание: сообщение bye сразу сообщает о разрыве (без ожидания 10 с)');
    ok(b8.sentOnHide, 'прощание: при закрытии вкладки (pagehide) уходит bye');
    ok(b8.sentOnClose, 'прощание: при выходе в меню (Net.close) уходит bye');
    ok(b8.cleared, 'выход: Net.close чистит обработчики и соединение');

    await P.close();
    const P2 = await newPage(browser);
    await P2.evaluate(() => { window.peers = []; window.Peer = class { constructor(id) { this.id = id; this.h = {}; this.destroyed = false; window.peers.push(this); } on(e, f) { this.h[e] = f; } fire(e, d) { this.h[e] && this.h[e](d); } connect() { return fakeConn(); } destroy() { this.destroyed = true; } reconnect() { } }; });
    P = P2;
    // кадры гоняем вручную: в песочнице часы Phaser без реального цикла стоят
    await P.evaluate(() => { window.__game.loop.stop(); window.__tm = 20000; window.pump = (n) => { for (let i = 0; i < n; i++) { window.__tm += 16.667; Net.lastRecv = performance.now(); window.__game.step(window.__tm, 16.667); } }; });
    // 7: хост запускает комнату через настоящий Lobby, гость уходит и возвращается по тому же коду
    await P.evaluate(() => { Net.close(); Lobby.mode = 'story'; Lobby.doHost(); window.peers[window.peers.length - 1].fire('open'); });
    const code = await P.evaluate(() => Net.code);
    const c1 = await P.evaluate(() => { const c = fakeConn(); window.c1 = c; const pr = window.peers[window.peers.length - 1]; pr.fire('connection', c); c.fire('open'); return true; });
    await sleep(600); await P.evaluate(() => window.pump(70));
    const s1 = await P.evaluate(() => { const sc = window.__game.scene.getScene('game'); return { game: sc.sys.isActive(), online: sc.online, n: sc.players.length, start: window.c1.sent.some((m) => m.t === 'start') }; });
    ok(s1.game && s1.online === 'host' && s1.n === 2 && s1.start, 'повторный вход: первая пара собралась (хост в игре, гостю ушёл start)');
    await P.evaluate(() => { window.c1.fire('close'); });
    const s2 = await P.evaluate(() => { const sc = window.__game.scene.getScene('game'); return { online: sc.online, n: sc.players.length, onClose: Net.onClose, menu: window.__game.scene.getScene('menu').sys.isActive() }; });
    ok(!s2.online && s2.n === 1 && s2.onClose === null && !s2.menu, 'повторный вход: после ухода гостя хост играет один, старый onClose снят');
    await P.evaluate(() => { const c = fakeConn(); window.c2 = c; const pr = window.peers[window.peers.length - 1]; pr.fire('connection', c); c.fire('open'); });
    await sleep(600);
    await P.evaluate(() => window.pump(70));
    const s3 = await P.evaluate(() => { const sc = window.__game.scene.getScene('game'); return { game: sc.sys.isActive(), online: sc.online, n: sc.players.length, menu: window.__game.scene.getScene('menu').sys.isActive(), start: window.c2.sent.some((m) => m.t === 'start'), conn: Net.conn === window.c2, code: Net.code }; });
    ok(s3.game && !s3.menu && s3.online === 'host' && s3.n === 2 && s3.start && s3.conn && s3.code === code, 'повторный вход: по тому же коду гость принят, хост не выкинут в меню, мир не заморожен');
    // старое соединение, закрывшееся позже, ничего не ломает
    await P.evaluate(() => { window.c1.fire('close'); });
    ok(await P.evaluate(() => { const sc = window.__game.scene.getScene('game'); return sc.sys.isActive() && sc.online === 'host' && Net.conn === window.c2; }), 'повторный вход: запоздалый close старого соединения игнорируется');
    // выход хоста в меню: прощание гостю и чистое состояние
    const x = await P.evaluate(() => { const sc = window.__game.scene.getScene('game'); sc.ui().restart(); return { bye: window.c2.sent.some((m) => m.t === 'bye'), peerGone: window.peers[window.peers.length - 1].destroyed, onClose: Net.onClose, cb: Net.cb }; });
    ok(x.bye && x.peerGone && x.onClose === null && x.cb === null, 'выход хоста в меню: гостю ушло прощание, комната закрыта, обработчики сняты');
    await P.close();
  }

  await browser.close();
  console.log(fails || errs ? `ИТОГ: провалов ${fails}, ошибок страницы ${errs}` : 'ИТОГ: всё зелёное');
  process.exit(fails || errs ? 1 : 0);
})();
