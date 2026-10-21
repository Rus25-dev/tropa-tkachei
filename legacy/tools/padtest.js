// Тест геймпада: подменяем navigator.getGamepads эмулятором DualSense и проверяем управление, паузу, вибрацию.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let errs = 0, fails = 0; const ok = (c, m) => { console.log(c ? 'ок   ' : 'ПРОВАЛ', m); if (!c) fails++; };
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
  await page.addInitScript(() => {
    const pad = { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })), rumbles: [], vibrationActuator: null };
    pad.vibrationActuator = { playEffect: (t, o) => { pad.rumbles.push(o.duration); return Promise.resolve('complete'); } };
    window.__pad = pad; navigator.getGamepads = () => [pad];
  });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  const res = await page.evaluate(() => new Promise((resolve) => {
    const g = window.__game; g.scene.stop('menu'); g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'tima' });
    setTimeout(() => {
      const sc = g.scene.getScene('game'); Snd.play = () => {}; g.loop.stop(); const pad = window.__pad, out = {};
      const B = (n, v) => { pad.buttons[n].pressed = !!v; pad.buttons[n].value = v ? 1 : 0; };
      const run = (n) => { for (let i = 0; i < n; i++) sc.update(i * 16.7, 16.7); };
      run(60);
      const p = sc.players[0];
      out.kind = Pads.kind(pad); out.listed = Pads.list().length;
      // идём вправо стиком
      const x0 = p.x; pad.axes[0] = 0.9; run(30); out.moved = p.x - x0; pad.axes[0] = 0;
      // прыжок крестиком
      run(30); B(0, true); run(4); out.vy = p.vy; B(0, false); run(40);
      // удар квадратом
      B(2, true); sc.update(0, 16.7); out.atk = p.atkT > 0 || p.atkCd > 0; B(2, false); run(30);
      // рывок на R2
      run(40); B(7, true); sc.update(0, 16.7); sc.update(0, 16.7); out.dash = p.dashT > 0 || p.dashCd > 0; B(7, false); run(40);
      // нить на треугольнике (отбив без полной нити)
      run(30); B(3, true); sc.update(0, 16.7); out.parry = p.parryT > 0 || p.parryCd > 0; B(3, false); run(10);
      // пауза на Options
      B(9, true); run(2); out.paused = sc.paused; B(9, false); run(2);
      B(9, true); run(2); out.unpaused = !sc.paused; B(9, false); run(2);
      // вибрация при уроне
      pad.rumbles.length = 0; p.inv = 0; sc.hurtPlayer(p, 1, p.x + 50); out.rumble = pad.rumbles.length;
      out.hint = Pads.hint();
      out.padmode = !!(Touch.root && Touch.root.classList.contains('padmode')) || !Touch.enabled;
      resolve(out);
    }, 800);
  }));
  console.log(JSON.stringify(res));
  ok(res.kind === 'ps' && res.listed === 1, 'DualSense опознан');
  ok(res.moved > 30, 'левый стик двигает героя');
  ok(res.vy < 0, 'крестик (✕) — прыжок');
  ok(res.atk, 'квадрат (□) — удар');
  ok(res.dash, 'R2 — рывок');
  ok(res.parry, 'треугольник (△) — нить/отбив');
  ok(res.paused === true && res.unpaused === true, 'Options — пауза и снятие паузы');
  ok(res.rumble >= 1, 'вибрация геймпада при уроне');
  ok(/✕/.test(res.hint) && /Options/.test(res.hint), 'подсказка для PlayStation: ' + res.hint.slice(0, 40));
  console.log('ошибок страницы:', errs, 'провалов:', fails);
  await browser.close(); process.exit(errs || fails ? 1 : 0);
})();
