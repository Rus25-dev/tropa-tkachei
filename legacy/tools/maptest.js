// Проверка карты и быстрых переходов: глава II (в коридоре две скамьи). node tools/maptest.js [скриншот.png]
// Скамья → карта → телепорт на другую скамью, сохранение прогресса карты без потери прежних полей, запрет в бою, загрузка при продолжении.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const shot = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let errs = 0;
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  const fails = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => {
    Snd.play = () => {};
    localStorage.setItem('tt_save', JSON.stringify({ bench: 0, beads: 5, abil: { double: true }, chapter: 2, stage: 'road', up: { hp: 1, dmg: 0, silk: 0 }, time: 12, deaths: 1, name: 'Гл. II · Коридор типографии' }));
    const g = window.__game; g.scene.stop('menu'); g.scene.start('game', { players: 1, mode: 'story', camp: Campaign.resume() });
  });
  await sleep(1200);
  const ok = (c, m) => { if (!c) { fails.push(m); console.log('ПРОВАЛ', m); } };
  const sit = (bi) => ev(async (bi) => {
    const sc = window.__game.scene.getScene('game'), b = sc.benches[bi], p = sc.players[0];
    p.x = b.x - 7; p.y = b.y - 26; p.vx = p.vy = 0; p.sit = false;
    await new Promise((r) => setTimeout(r, 150));
    p.pend = { ...(p.pend || {}), upP: true };
    await new Promise((r) => setTimeout(r, 250));
    // ↑ на скамье открывает меню (v1.7): выбираем «Отдохнуть»
    if (sc.benchMenuOpen) { window.__game.scene.getScene('ui').benchMenu.pick(0); await new Promise((r) => setTimeout(r, 250)); }
    return p.sit;
  }, bi);
  const key = (code) => ev((code) => { const sc = window.__game.scene.getScene('game'); MapTravel.onKey(sc, { code, repeat: false, preventDefault() { } }); }, code);
  const st = () => ev(() => {
    const sc = window.__game.scene.getScene('game'), p = sc.players[0], sv = Settings.progress();
    return { open: MapTravel.open, busy: MapTravel.busy, paused: sc.paused, sel: MapTravel.sel, mapB: [...sc.mapB], vis: sc.mapV.size, sit: p.sit, x: Math.round(p.x), bx: sc.benches.map((b) => Math.round(b.x - 7)), resp: Math.round(sc.respawn.x),
      uiVis: !!(sc.ui().mapC && sc.ui().mapC.visible), can: MapTravel.can(sc), save: sv && { bench: sv.bench, abil: sv.abil, chapter: sv.chapter, stage: sv.stage, up: sv.up, beads: sv.beads, mapB: sv.map && sv.map['2'] && sv.map['2'].b, mapV: sv.map && sv.map['2'] && sv.map['2'].v.length } };
  });
  ok(await ev(() => window.__game.scene.getScene('game').benches.length === 2), 'в коридоре главы II должно быть две скамьи');
  ok(await sit(0), 'не удалось сесть на скамью 0');
  let s = await st();
  ok(s.mapB.join() === '0', 'скамья 0 не отмечена: ' + s.mapB);
  ok(s.save && s.save.mapB && s.save.mapB.join() === '0' && s.save.mapV > 0, 'карта не сохранена: ' + JSON.stringify(s.save));
  ok(s.save && s.save.abil.double && s.save.chapter === 2 && s.save.stage === 'road' && s.save.up.hp === 1 && s.save.beads === 5, 'потеряны поля прогресса: ' + JSON.stringify(s.save));
  await key('KeyM'); s = await st();
  ok(s.open && s.paused && s.uiVis, 'карта не открылась/не пауза: ' + JSON.stringify(s));
  ok(!s.can.ok, 'телепорт на ту же скамью не должен быть доступен');
  if (shot) { await sleep(100); await page.screenshot({ path: shot.replace('.png', '-1.png') }); }
  await ev(() => { const sc = window.__game.scene.getScene('game'); sc.togglePause(); });
  s = await st(); ok(!s.open && !s.paused && !s.uiVis, 'Esc не закрыл карту: ' + JSON.stringify(s));
  // вторая скамья
  ok(await sit(1), 'не удалось сесть на скамью 1');
  s = await st(); ok(s.mapB.join() === '0,1', 'скамьи 0,1 не отмечены: ' + s.mapB);
  await key('KeyM'); s = await st();
  ok(s.open && s.sel === 1, 'при открытии на скамье 1 выбрана не она: ' + s.sel);
  await key('ArrowLeft'); s = await st(); ok(s.sel === 0 && s.can.ok, 'выбор скамьи 0 / can: ' + JSON.stringify([s.sel, s.can]));
  if (shot) { await sleep(100); await page.screenshot({ path: shot.replace('.png', '-2.png') }); }
  // бой с боссом: телепорт запрещён
  await ev(() => { window.__game.scene.getScene('game').fightOn = true; });
  s = await st(); ok(!s.can.ok && /бо/.test(s.can.why), 'во время боя телепорт должен быть запрещён: ' + JSON.stringify(s.can));
  await ev(() => { window.__game.scene.getScene('game').fightOn = false; });
  await key('Enter');
  await sleep(150); s = await st(); ok(s.busy && !s.open, 'телепорт не начался: ' + JSON.stringify(s));
  // в безголовом браузере кадров мало (~8/с), а таймеры идут по кадрам: ждём до 15 с
  for (let i = 0; i < 60 && (await st()).busy; i++) await sleep(250);
  s = await st();
  ok(!s.busy && !s.paused && s.sit && Math.abs(s.x - s.bx[0]) < 4, `герой не на скамье 0: x=${s.x} скамья=${s.bx[0]}`);
  ok(s.resp === s.bx[0] + 7, 'точка возрождения не обновилась: ' + s.resp);
  ok(s.save && s.save.bench === 0 && s.save.abil.double && s.save.up.hp === 1 && s.save.mapB.join() === '0,1', 'сохранение после телепорта: ' + JSON.stringify(s.save));
  // перезапуск «Продолжить»: посещённые скамьи подгружаются
  await ev(() => { const g = window.__game; g.scene.stop('game'); g.scene.start('game', { players: 1, mode: 'story', camp: Campaign.resume() }); });
  await sleep(1200); s = await st();
  ok(s.mapB.join() === '0,1' && s.vis > 5, 'карта не загрузилась при продолжении: ' + JSON.stringify([s.mapB, s.vis]));
  // сеть: событие 'bench' от телепорта у напарника не ломает приём
  console.log(JSON.stringify(s.save), 'ошибок:', errs, 'провалов:', fails.length);
  await browser.close(); process.exit(errs || fails.length ? 1 : 0);
})();
