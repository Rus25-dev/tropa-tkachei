// Дымовой тест: история или босс-тест, случайные нажатия, проверка на исключения. node tools/smoke.js [story|vladik|tima|misha] [кадров]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const mode = process.argv[2] || 'story', N = +(process.argv[3] || 3000);
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let errs = 0;
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  const out = await page.evaluate(({ mode, N }) => new Promise((resolve) => {
    const g = window.__game; g.scene.stop('menu');
    g.scene.start('game', mode === 'story' ? { players: 1, mode: 'story' } : { players: 1, mode: 'bosstest', boss: mode });
    setTimeout(() => {
      const sc = g.scene.getScene('game'); Snd.play = () => {}; sc.togglePause = () => {}; g.loop.stop();
      sc.rawInput = () => sc._i || {};
      let f = 0, maxX = 0;
      const run = () => {
        for (let n = 0; n < 60 && f < N; n++, f++) {
          const k = Math.floor(f / 25) % 8;
          sc._i = { right: f % 400 < 300, left: f % 400 >= 300, jump: f % 37 < 12, atk: f % 11 === 0, dash: f % 90 === 0, heal: f % 53 === 0, up: f % 130 < 20, down: false, bomb: f % 70 === 0 };
          sc.update(f * 16.667, 16.667); maxX = Math.max(maxX, sc.players[0].x);
        }
        if (f >= N) return resolve({ f, maxX: Math.round(maxX), hp: sc.players[0].hp, abil: sc.abil });
        setTimeout(run, 0);
      };
      run();
    }, 800);
  }), { mode, N });
  console.log(JSON.stringify(out), 'ошибок:', errs);
  await browser.close(); process.exit(errs ? 1 : 0);
})();
