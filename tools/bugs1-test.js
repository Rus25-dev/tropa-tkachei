// Регрессии из списка багов версии 1.5 (пункты 1–8): вид сверху Миши, сохранение арены кампании, залипшие клавиши
// экрана победы, нить за удар по Мише, оглушённый босс, предмет способности, клавиша «ещё раз», темп музыки.
// Запуск: NODE_PATH=... node tools/bugs1-test.js   (INDEX=путь/к/index.html — проверить другую сборку)
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let errs = 0, fails = 0; const ok = (c, m) => { console.log(c ? 'ок   ' : 'ПРОВАЛ', m); if (!c) fails++; };
  const index = process.env.INDEX || path.resolve(__dirname, '../index.html');
  // каждый сценарий — в чистой странице (своё localStorage и состояние Phaser)
  const run = async (fn, arg) => {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
    await page.goto('file://' + index);
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
    await page.evaluate(() => { window.sleep = (ms) => new Promise((r) => setTimeout(r, ms)); window.tick = (sc, n) => { for (let i = 0; i < n; i++) { sc.time.preUpdate(); sc.time.update(sc.time.now + 16, 16); } }; window.until = async (f, ms) => { const t = performance.now(); while (!f() && performance.now() - t < (ms || 8000)) await sleep(50); return f(); }; });
    const out = await page.evaluate(fn, arg); await page.close(); return out;
  };
  const START = `const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};`;

  // 1. Миша, вид сверху: повтор боя из паузы/победы не должен тащить за собой td
  const r1 = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'misha' }); await sleep(600);
    let sc = g.scene.getScene('game'), ui = g.scene.getScene('ui');
    sc.tdBegin(); await sleep(900);
    const o = { inTd: !!sc.td && sc.tdFlip };
    ui.retry(); await sleep(900);
    sc = g.scene.getScene('game');
    o.td = sc.td; o.flip = sc.tdFlip;
    o.rot = sc.cameras.main.rotation;
    // и выход в меню из вида сверху
    sc.tdBegin(); await sleep(700); g.scene.getScene('ui').restart(); await sleep(500);
    g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'misha' }); await sleep(600);
    sc = g.scene.getScene('game'); o.td2 = sc.td; o.flip2 = sc.tdFlip;
    return o;
  });
  ok(r1.inTd, '1: вид сверху включился (' + r1.inTd + ')');
  ok(r1.td == null && r1.flip === false && Math.abs(r1.rot) < 1e-6, '1: после «Заново» td сброшен, камера прямая');
  const r1b = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'misha' }); await sleep(600);
    let sc = g.scene.getScene('game'); sc.tdBegin(); await sleep(700);
    g.scene.getScene('ui').retry(); await sleep(1200);
    sc = g.scene.getScene('game'); g.loop.stop();
    const p = sc.players[0], o = {}; let f = 0; for (let i = 0; i < 90; i++, f++) sc.update(f * 16.667, 16.667);
    const x0 = p.x, sx0 = sc.cameras.main.scrollX; sc.kb1.right[0].isDown = true;
    for (let i = 0; i < 40; i++, f++) sc.update(f * 16.667, 16.667);
    o.dx = p.x - x0; o.dcam = sc.cameras.main.scrollX - sx0;
    return o;
  });
  ok(r1b.dx > 20 && Math.abs(r1b.dcam) > 2, '1: после «Заново» герой ходит, камера следует (dx=' + Math.round(r1b.dx) + ', камера ' + Math.round(r1b.dcam) + ')');
  ok(r1.td2 == null && r1.flip2 === false, '1: после «В меню» и новой игры td сброшен');

  // 2. Кампания: победа в арене сохраняет прогресс; босс-тест и спидран — нет
  const r2 = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    const o = {}, camp = (ch) => ({ ch, st: 'arena', beads: 9, abil: { double: true, glide: true }, up: { hp: 1, dmg: 1, silk: 0 }, time: 100, deaths: 2 });
    try { localStorage.removeItem('tt_save'); } catch (_) { }
    g.scene.start('game', { players: 1, mode: 'story', camp: camp(2) }); await sleep(500);
    let sc = g.scene.getScene('game'); o.mode = sc.mode;
    sc.win(); await sleep(200);
    o.save2 = Settings.progress();
    g.scene.start('game', { players: 1, mode: 'story', camp: camp(4) }); await sleep(500);
    sc = g.scene.getScene('game'); sc.win(); await sleep(200); o.save4 = Settings.progress();
    // обычный босс-тест
    localStorage.removeItem('tt_save');
    g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'vladik' }); await sleep(500);
    sc = g.scene.getScene('game'); sc.win(); await sleep(200); o.bt = Settings.progress();
    // спидран в арене кампании
    g.scene.start('game', { players: 1, mode: 'story', camp: camp(3) }); await sleep(500);
    sc = g.scene.getScene('game'); sc.sr = { cat: 'boss' }; o.srCan = Campaign.canSave(sc); Campaign.decorate(sc, {}); o.sr = Settings.progress();
    return o;
  });
  ok(r2.mode === 'bosstest' && r2.save2 && r2.save2.chapter === 3 && r2.save2.stage === 'road', '2: победа в арене гл. II → сохранена гл. III (коридор)');
  ok(r2.save2 && r2.save2.beads === 9 && r2.save2.abil.glide && r2.save2.up.hp === 1 && r2.save2.up.dmg === 1 && r2.save2.deaths === 2, '2: бусины, способности, улучшения, обрывы сохранены');
  ok(r2.save4 && r2.save4.done === true && r2.save4.chapter === 4, '2: победа гл. IV → «кампания пройдена»');
  ok(r2.bt == null, '2: обычный босс-тест ничего не сохраняет');
  ok(r2.srCan === false && r2.sr == null, '2: спидран не сохраняет');

  // 3. Выход из коридора: залипший Пробел/Enter не выкидывает в меню
  const r3 = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    g.scene.start('game', { players: 1, mode: 'story', camp: { ch: 2, st: 'road', beads: 0, abil: {}, up: { hp: 0, dmg: 0, silk: 0 }, time: 0, deaths: 0 } }); await sleep(500);
    const sc = g.scene.getScene('game'), ui = g.scene.getScene('ui'), o = {};
    sc.win(); ui.input.keyboard.emit('keydown-SPACE', { repeat: false }); ui.input.keyboard.emit('keydown-ENTER', { repeat: false });
    tick(sc, 80); await until(() => g.scene.getScene('game').camp.st === 'arena', 5000); await sleep(300);
    const sc2 = g.scene.getScene('game');
    o.menu = g.scene.getScene('menu').sys.isActive(); o.st = sc2.camp && sc2.camp.st; o.active = sc2.sys.isActive();
    return o;
  });
  ok(!r3.menu && r3.active && r3.st === 'arena', '3: Пробел/Enter при выходе из коридора не уводит в меню (st=' + r3.st + ', menu=' + r3.menu + ')');

  // 3б/7. Экран победы: ранние и повторные нажатия игнорируются; R не перезапускает бой, N — перезапускает
  const r3b = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'vladik' }); await sleep(500);
    const sc = g.scene.getScene('game'), ui = g.scene.getScene('ui'), o = {}, key = (k, rep) => ui.input.keyboard.emit('keydown-' + k, { repeat: !!rep });
    let retried = 0; ui.retry = () => { retried++; };
    sc.win(); const t0 = performance.now();
    key('ENTER'); key('SPACE'); o.early = g.scene.getScene('menu').sys.isActive(); o.dt = performance.now() - t0;
    await until(() => performance.now() - ui.winAt > 1000);
    key('SPACE', true); key('ENTER', true); o.repeat = g.scene.getScene('menu').sys.isActive();
    key('R'); o.afterR = retried; key('N'); o.afterN = retried;
    key('ENTER'); o.afterEnter = retried; // первый пункт экрана победы — «Заново»
    key('RIGHT'); key('ENTER'); await sleep(300);
    o.menu = g.scene.getScene('menu').sys.isActive();
    return o;
  });
  ok(!r3b.early && r3b.dt < 700, '3: Enter/Пробел сразу после появления экрана победы игнорируются');
  ok(!r3b.repeat, '3: повтор от удержания клавиши игнорируется');
  ok(r3b.afterR === 0, '7: R на экране победы не перезапускает бой');
  ok(r3b.afterN === 0 && r3b.afterEnter === 1, '7: клавиши-горячие убраны, «Заново» — пункт меню (Enter)');
  ok(r3b.menu, '3: свежее нажатие Enter через паузу ведёт в меню');

  // 4. Нить за удар иглой по Мише: как у остальных боссов (1 за 2 удара), без двойного учёта
  const r4 = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'misha' }); await sleep(600); g.loop.stop();
    const sc = g.scene.getScene('game'); for (let i = 0; i < 100; i++) sc.update(i * 16.7, 16.7);
    const m = sc.misha, p = sc.players[0], o = {}; p.silk = 0; p.bossHits = 0; p.face = 1; p.x = m.x - 20; p.y = m.y;
    const calls = []; const gs = sc.gainSilk; sc.gainSilk = function (...a) { calls.push(a[1]); return gs.apply(this, a); };
    const hit = () => { p.atkHits = new Set(); p.atkT = 0.2; p.atkDir = 'f'; p.heavy = false; m.state = 'idle'; m.hitCd = 0; sc.resolveAttack(p); };
    for (let k = 0; k < 4; k++) hit();
    o.silk = p.silk; o.calls = calls.length;
    p.silk = 0; m.hp = m.tdMarks[1]; calls.length = 0; for (let k = 0; k < 4; k++) hit(); o.armSilk = p.silk;
    return o;
  });
  ok(r4.calls === 4 && r4.silk === 2, '4: 4 удара иглой по Мише → 4 учёта, 2 нити (как у других боссов): ' + r4.silk);
  ok(r4.armSilk === 2, '4: удары по закрытому рюкзаку дают столько же: ' + r4.armSilk);

  // 5. Оглушённый босс не ранит касанием
  const r5 = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    const o = {};
    for (const kind of ['korn', 'vladik', 'tima']) {
      g.scene.start('game', kind === 'korn' ? { players: 1, mode: 'story' } : { players: 1, mode: 'bosstest', boss: kind }); await sleep(600); g.loop.stop();
      const sc = g.scene.getScene('game'); let f = 0; for (let i = 0; i < 60; i++, f++) sc.update(f * 16.7, 16.7);
      const b = kind === 'korn' ? sc.boss : sc[kind], p = sc.players[0];
      const place = () => { p.x = b.x + b.w / 2 - 7; p.y = b.y + b.h - 40; p.inv = 0; p.hp = p.maxHp; };
      place(); b.stagger = 2; b.state = 'idle'; b.poiseImmune = 9; let hurt = false;
      for (let i = 0; i < 4; i++, f++) { place(); b.stagger = 2; sc.update(f * 16.7, 16.7); if (p.hp < p.maxHp) hurt = true; }
      o[kind] = !hurt;
      b.stagger = 0; b.state = 'idle'; b.t = 5; place();
      for (let i = 0; i < 4; i++, f++) { place(); b.stagger = 0; b.state = 'idle'; b.t = 5; sc.update(f * 16.7, 16.7); if (p.hp < p.maxHp) break; }
      o[kind + 'Ctl'] = p.hp < p.maxHp;
    }
    return o;
  });
  for (const k of ['korn', 'vladik', 'tima']) { ok(r5[k], '5: оглушённый ' + k + ' не ранит касанием'); ok(r5[k + 'Ctl'], '5: (контроль) неоглушённый ' + k + ' ранит'); }

  // 6. Предмет способности виден и после перезапуска сцены
  const r6 = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    try { localStorage.removeItem('tt_save'); } catch (_) { }
    const o = {}, d = { players: 1, mode: 'story' };
    g.scene.start('game', d); await sleep(500);
    let sc = g.scene.getScene('game'); o.n1 = (sc.items || []).length; o.alive1 = !!(sc.itemG && sc.itemG.scene);
    g.scene.start('game', d); await sleep(500);
    sc = g.scene.getScene('game'); o.n2 = (sc.items || []).length; o.alive2 = !!(sc.itemG && sc.itemG.scene && sc.itemG.active);
    g.scene.getScene('ui').retry(); await sleep(500);
    sc = g.scene.getScene('game'); o.alive3 = !!(sc.itemG && sc.itemG.scene && sc.itemG.active);
    return o;
  });
  ok(r6.n1 > 0 && r6.alive1, '6: предмет есть при первом запуске');
  ok(r6.n2 > 0 && r6.alive2 && r6.alive3, '6: предмет не пропадает при втором запуске и после «Заново»');

  // 8. Темп музыки не остаётся ускоренным после боя
  const r8 = await run(async () => {
    const g = window.__game; g.scene.stop('menu'); Snd.play = () => {};
    g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'misha' }); await sleep(500);
    const sc = g.scene.getScene('game'); sc.bossPhaseForMusic = () => 3; await sleep(300);
    const o = { boss: Music.intensity };
    g.scene.getScene('ui').restart(); await sleep(500);
    o.menu = Music.intensity;
    g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'misha' }); await sleep(400); g.scene.getScene('game').bossPhaseForMusic = () => 3; await sleep(300);
    g.scene.stop('game'); g.scene.stop('ui'); o.stopped = Music.intensity;
    return o;
  });
  ok(Math.abs(r8.boss - 1.14) < 1e-6, '8: в 3-й фазе темп ускорен (' + r8.boss + ')');
  ok(r8.menu === 1 && r8.stopped === 1, '8: в меню и после остановки сцены темп сброшен');

  console.log('ошибок страницы:', errs, 'провалов:', fails);
  await browser.close(); process.exit(errs || fails ? 1 : 0);
})();
